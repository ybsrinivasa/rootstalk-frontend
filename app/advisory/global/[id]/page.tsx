'use client'
import { useEffect, useState, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import { RelationsSection } from '@/components/advisory-authoring/RelationsSection'
import { CQsSection } from '@/components/advisory-authoring/CQsSection'
import { PublishModal } from '@/components/advisory-authoring/PublishModal'
import {
  ReadOnlyBanner, VersionHistorySection,
  type LineageRow as SharedLineageRow,
} from '@/components/advisory-authoring/LineageSection'
import { PracticeFormModal, type ExistingPractice } from '@/components/advisory-authoring/PracticeFormModal'
import { useReadOnlyGuard } from '@/components/advisory-authoring/ReadOnlyGuard'
import api from '@/lib/api'
import { practiceShortLabel } from '@/lib/practice-label'

// Batch DD (2026-05-19) — Custom Parameter / Variable authoring is
// hidden on SA-CCA. User rule: "Globals are pure Cosh — the SA
// should be pushing back to Cosh for any new universal P-V need,
// not creating one-off customs that bypass Cosh's authority."
// Custom P-V remains available on CA-CCA (per-client scope, which
// is the right place for client-specific extensions). Flip to
// `true` if Custom P-V on SA needs to be reinstated.
const SHOW_CUSTOM_PV = false

interface Package {
  id: string; name: string; crop_cosh_id: string
  package_type: string
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  duration_days: number
  version: number; description: string | null; created_at: string
  start_date_label_cosh_id: string | null
  published_at: string | null
}
interface Timeline {
  id: string; name: string; from_type: string; from_value: number; to_value: number; display_order: number
  status?: string  // "ACTIVE" | "INACTIVE" — Batch 28
}
interface PracticeElement {
  element_type: string
  label: string
  cosh_ref: string | null
  value: string | null
  unit_cosh_id: string | null
  display_value: string | null
  display_order: number
}
interface Practice {
  id: string; l0_type: string; l1_type: string | null; l2_type: string | null
  display_order: number; is_special_input: boolean
  is_brand_locked?: boolean  // Batch 39I-a — SE opts in per Practice
  elements?: PracticeElement[]  // Batch 32 — server resolves labels + display values
}
// Batch 39A's GET endpoint returns each Relation with its 3-D parts
// shape reconstructed from each Practice's encoded role string, plus
// any RelationConditional folded in under `conditional`.
interface RelationOut {
  id: string
  relation_type: 'AND' | 'OR' | 'IF'
  expression: string | null
  parts: string[][][]  // parts[part][option][position] = practice_id
  conditional: { question_id: string; question_text: string | null; answer: 'YES' | 'NO' | 'BOTH' } | null
}
// Batch 39E (2026-05-15) — IF Conditional Question. The CQ list
// endpoint bundles each side's attachment so the UI can render the
// CQ card directly from one fetch.
interface CQAttachment {
  kind: 'practice' | 'relation'
  id: string
}
interface CQOut {
  id: string
  timeline_id: string
  question_text: string
  display_order: number
  yes: CQAttachment | null
  no: CQAttachment | null
}
interface PushStatusRow {
  client_id: string
  client_name: string
  already_pushed: boolean
  pushed_at: string | null
  latest_local_published_at: string | null
  has_pending_draft: boolean
}
interface GlobalParameter {
  id: string
  crop_cosh_id: string
  name: string
  source: 'COSH' | 'CUSTOM'
  display_order: number
}
interface GlobalVariable {
  id: string
  parameter_id: string
  name: string
  // Batch 35 (2026-05-14): null = SE-added (editable on any parent),
  // non-null = Cosh-mirrored (read-only regardless of parent source).
  cosh_id: string | null
}
interface PackageVariableAssignment {
  parameter_id: string
  variable_id: string
}
const STATUS_COLOUR: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
}
const L0_COLOUR: Record<string, string> = {
  INPUT: 'bg-blue-100 text-blue-700', NON_INPUT: 'bg-purple-100 text-purple-700',
  INSTRUCTION: 'bg-amber-100 text-amber-700', MEDIA: 'bg-pink-100 text-pink-700',
}
// Reference Type allowed values are package_type-conditional now —
// the static FROM_TYPES list was a holdover from before:
//   Annual    → DAS / DBS only
//   Perennial → CALENDAR only
const ALLOWED_FROM_TYPES_BY_PACKAGE_TYPE: Record<string, string[]> = {
  ANNUAL: ['DAS', 'DBS'],
  PERENNIAL: ['CALENDAR'],
}

// Calendar plumbing — store as day-of-year (1..365) in from_value /
// to_value; surface month + day pickers in the modal. Non-leap-year
// month start offsets:
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const MONTH_OFFSETS = MONTH_DAYS.reduce<number[]>((acc, d, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + MONTH_DAYS[i - 1])
  return acc
}, [])

function dayOfYear(month: number, day: number): number {
  // month is 1..12, day is 1..MONTH_DAYS[month-1]
  return MONTH_OFFSETS[month - 1] + day
}

function doyToMonthDay(doy: number): { month: number; day: number } {
  if (doy < 1) return { month: 1, day: 1 }
  if (doy > 365) return { month: 12, day: 31 }
  let m = 0
  while (m < 11 && MONTH_OFFSETS[m + 1] < doy) m++
  return { month: m + 1, day: doy - MONTH_OFFSETS[m] }
}

function shortMonthDay(doy: number): string {
  const { month, day } = doyToMonthDay(doy)
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${day}`
}

// FastAPI returns `detail` as a string OR an object like
// {code, message, errors}. Rendering an object as a React child
// throws "Objects are not valid as a React child" and kills the
// tree (Chrome then shows "This page couldn't load"). Always
// extract a string before assigning to state used in JSX.
function extractErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const obj = detail as { code?: string; message?: string }
    if (obj.message) return obj.message
  }
  return fallback
}

function formatTimelineRange(tl: { from_type: string; from_value: number; to_value: number }): string {
  if (tl.from_type === 'CALENDAR') {
    return `${shortMonthDay(tl.from_value)} → ${shortMonthDay(tl.to_value)}`
  }
  return `Day ${tl.from_value} → ${tl.to_value}`
}

export default function GlobalPackageDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [pkg, setPkg] = useState<Package | null>(null)
  const [timelines, setTimelines] = useState<Timeline[]>([])
  const [practiceMap, setPracticeMap] = useState<Record<string, Practice[]>>({})
  const [expandedPractice, setExpandedPractice] = useState<string | null>(null)  // Batch 32
  const [expanded, setExpanded] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  // Batch 39L-a (2026-05-16) — rich publish confirmation modal.
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [publishBlockers, setPublishBlockers] = useState<{ code: string; message: string }[]>([])

  // Batch 39R (2026-05-17) — Global Package ACTIVE ↔ INACTIVE toggle.
  // Endpoint (PUT /advisory/global/packages/{pkg_id}) has existed since
  // Batch 28; this exposes it on the SA-portal UI for the first time.
  const [togglingPkg, setTogglingPkg] = useState(false)

  async function togglePkgStatus(next: 'ACTIVE' | 'INACTIVE') {
    if (!pkg) return
    if (!confirm(
      next === 'INACTIVE'
        ? 'Mark this Global Package Inactive? Clients will stop seeing it as available to pull, but existing imports stay live.'
        : 'Reactivate this Global Package? It will surface again on the import list.'
    )) return
    setTogglingPkg(true)
    try {
      const { data } = await api.put(`/advisory/global/packages/${id}`, { status: next })
      setPkg(data)
    } catch (err: unknown) {
      alert(extractErrorMessage(err, 'Failed to update status.'))
    } finally {
      setTogglingPkg(false)
    }
  }

  // Batch 39L-b (2026-05-16) — lineage state. Surfaces an existing
  // DRAFT in the same lineage so the read-only banner offers a
  // "Continue" link rather than a fresh clone every time.
  interface LineageRow {
    id: string
    status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
    version: number
    published_at: string | null
    is_current: boolean
  }
  const [lineage, setLineage] = useState<LineageRow[]>([])
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState('')
  // Batch 39L-c (2026-05-16) — version-history panel. `makingEditable`
  // holds the lineage row id mid-flight so we can disable just that
  // row's CTA while the clone-from-historical-row call is in progress.
  const [makingEditable, setMakingEditable] = useState<string | null>(null)

  // Relations live in `<RelationsSection>` (Batch 39P-b2); CCA only
  // keeps a mirror map populated via onRelationsChange so the CQ
  // section can look up Relation by id for attachment labels +
  // gate-eligibility (relations already wired to any CQ).
  const [relationsByTimeline, setRelationsByTimeline] = useState<Record<string, RelationOut[]>>({})
  // CQ list lives in `<CQsSection>` (Batch 39P-c); CCA only keeps a
  // mirror map populated via onCQsChange so the publish-readiness
  // gate + dangling-CQ checks can read it without a parallel fetch.
  const [cqsByTimeline, setCqsByTimeline] = useState<Record<string, CQOut[]>>({})

  const [showAddTL, setShowAddTL] = useState(false)
  const [addingTL, setAddingTL] = useState(false)
  const [tlError, setTlError] = useState('')
  const [tlForm, setTlForm] = useState({
    name: '', from_type: 'DAS', from_value: '1', to_value: '30',
    // Calendar-only — drive month/day pickers; serialised to
    // from_value/to_value (day-of-year) on submit.
    from_month: '1', from_day: '1', to_month: '12', to_day: '31',
  })

  // Edit Timeline (Batch 28). `showEditTL` carries the Timeline being
  // edited, or null. The form mirrors the Add Timeline shape plus a
  // status toggle; from_type stays read-only (locked at create time).
  const [showEditTL, setShowEditTL] = useState<Timeline | null>(null)
  const [editingTL, setEditingTL] = useState(false)
  const [editTLError, setEditTLError] = useState('')
  const [editTLForm, setEditTLForm] = useState({
    name: '', from_value: '1', to_value: '30',
    from_month: '1', from_day: '1', to_month: '12', to_day: '31',
    status: 'ACTIVE',
  })

  const [showAddPractice, setShowAddPractice] = useState<string | null>(null)
  // Carries the Practice being edited when the modal opens in edit
  // mode. The modal itself owns all per-field state (Batch 39P-e).
  const [editingPractice, setEditingPractice] = useState<{ timelineId: string; practice: Practice } | null>(null)
  // Batch 33: when set, the Practice modal opens in EDIT mode pre-
  // filled with this Practice's current values; Submit issues PUT
  // instead of POST. Carries the timeline_id alongside since the
  // PUT URL needs both ids.

  const [showPushModal, setShowPushModal] = useState(false)
  const [pushStatus, setPushStatus] = useState<PushStatusRow[] | null>(null)
  const [pushingClientId, setPushingClientId] = useState<string | null>(null)
  const [pushError, setPushError] = useState('')

  // Edit Package details
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '', duration_days: '120',
    start_date_label_cosh_id: '',
    description: '',
    status: 'DRAFT',  // Batch 28: ACTIVE / INACTIVE toggle; DRAFT shown read-only.
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')
  // 2026-05-22: live Cosh list from `/cosh/options/start-date-names`.
  const [startDateLabels, setStartDateLabels] = useState<{ cosh_id: string; name: string }[]>([])

  useEffect(() => {
    api.get<{ cosh_id: string; name: string }[]>(`/cosh/options/start-date-names`)
      .then(r => setStartDateLabels(r.data))
      .catch(() => setStartDateLabels([]))
  }, [])

  // Parameters & Variables (Batch 9, 2026-05-11). Moved into its
  // own modal 2026-05-11 — full editor is too heavy to share the
  // page with the Timeline workspace; compact summary lives in
  // the header.
  const [showSignature, setShowSignature] = useState(false)
  const [parameters, setParameters] = useState<GlobalParameter[]>([])
  const [variablesByParam, setVariablesByParam] = useState<Record<string, GlobalVariable[]>>({})
  const [packageVariables, setPackageVariables] = useState<PackageVariableAssignment[]>([])
  const [newParamName, setNewParamName] = useState('')
  const [newVarForParamId, setNewVarForParamId] = useState<string | null>(null)
  const [newVarName, setNewVarName] = useState('')
  const [pvSaveError, setPvSaveError] = useState('')

  // Batch 28: Custom Parameter atomic create + rename + delete.
  const [creatingParam, setCreatingParam] = useState(false)
  const [paramDraft, setParamDraft] = useState<{ name: string; variables: string[] }>({
    name: '', variables: ['', ''],  // ≥ 2 variables required
  })
  const [editingParamId, setEditingParamId] = useState<string | null>(null)
  const [editingParamName, setEditingParamName] = useState('')
  const [editingVarKey, setEditingVarKey] = useState<string | null>(null)
  const [editingVarName, setEditingVarName] = useState('')
  // Batch 37 (2026-05-15): hide-unused toggle for the PV panel. The
  // panel lists every Parameter for the crop (Cosh-mirrored + Custom),
  // which is noisy once the SE has made the few assignments that
  // shape this Package's signature. Off by default so new SEs see
  // the full list; flipping it on collapses to just the rows the SE
  // has assigned a variable on for this Package.
  const [hideUnusedParams, setHideUnusedParams] = useState(false)

  const loadTimelines = () =>
    api.get<Timeline[]>(`/advisory/global/packages/${id}/timelines`)
      .then(r => setTimelines(r.data))

  useEffect(() => {
    api.get<Package>(`/advisory/global/packages/${id}`)
      .then(r => setPkg(r.data))
      .catch(() => router.replace('/advisory/global'))
    loadTimelines()
    // Batch 39L-b — lineage drives the read-only banner's
    // "Continue draft" vs "Start v_N+1 draft" affordance.
    api.get<LineageRow[]>(`/advisory/global/packages/${id}/lineage`)
      .then(r => setLineage(r.data))
      .catch(() => setLineage([]))
  }, [id])

  async function handleCloneToDraft() {
    setCloning(true); setCloneError('')
    try {
      const { data } = await api.post<Package>(
        `/advisory/global/packages/${id}/clone-to-draft`
      )
      router.push(`/advisory/global/${data.id}`)
    } catch (err: unknown) {
      setCloneError(extractErrorMessage(err, 'Failed to start a new draft.'))
    } finally { setCloning(false) }
  }

  // Batch 39L-c — clone any INACTIVE row in this lineage into a new
  // DRAFT. Mirrors the spec line: "CM can also pick a previous
  // (INACTIVE) version and make it editable." Backend endpoint already
  // accepts ACTIVE or INACTIVE sources and enforces the single-DRAFT
  // invariant by flipping any existing DRAFT to INACTIVE — we warn the
  // CM up front if that's about to happen.
  async function handleMakeEditable(srcId: string, srcVersion: number) {
    const existing = lineage.find(r => r.status === 'DRAFT')
    if (existing && existing.id !== srcId) {
      const ok = confirm(
        `A v${existing.version} DRAFT already exists in this lineage. ` +
        `Making v${srcVersion} editable will replace it (the existing ` +
        `draft becomes INACTIVE). Continue?`
      )
      if (!ok) return
    }
    setMakingEditable(srcId); setCloneError('')
    try {
      const { data } = await api.post<Package>(
        `/advisory/global/packages/${srcId}/clone-to-draft`
      )
      router.push(`/advisory/global/${data.id}`)
    } catch (err: unknown) {
      setCloneError(extractErrorMessage(err, 'Failed to make this version editable.'))
    } finally { setMakingEditable(null) }
  }

  const loadPractices = (tlId: string) =>
    api.get<Practice[]>(`/advisory/global/packages/${id}/timelines/${tlId}/practices`)
      .then(r => setPracticeMap(m => ({ ...m, [tlId]: r.data })))

  // Relations + CQs are loaded by their shared sections (Batch 39P-b2,
  // 39P-c). They surface their lists back via `onRelationsChange` /
  // `onCQsChange` so the parent's mirror maps stay in sync for
  // downstream features (publish-readiness gate, etc.).
  const toggle = (tlId: string) => {
    if (expanded === tlId) { setExpanded(null); return }
    setExpanded(tlId)
    if (!practiceMap[tlId]) loadPractices(tlId)
  }
  // ── Batch 39C-rev2: linear chain helpers ──────────────────────────────────

  // Practice label helpers — extracted to lib/practice-label.ts on
  // 2026-05-17 so the SA-portal PG editor (and future UCAT-pipe
  // surfaces) share the same formatting. See that module for per-L0
  // rules.
  // Practices already inside ANY relation on this timeline — disabled in
  // the picker (backend rejects double-membership anyway).
  function practiceIdsInAnyRelation(tlId: string): Set<string> {
    const out = new Set<string>()
    for (const r of (relationsByTimeline[tlId] || [])) {
      for (const part of r.parts) for (const opt of part) for (const pid of opt) {
        out.add(pid)
      }
    }
    return out
  }

  async function handlePublish() {
    setPublishing(true)
    setPublishError('')
    try {
      const { data } = await api.post<Package>(`/advisory/global/packages/${id}/publish`)
      setPkg(data)
      setShowPublishModal(false)
    } catch (err: unknown) {
      // 422 publish_blocked carries a `missing: [...]` list. Surface
      // every checklist item to the CM in one pass.
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      if (detail && typeof detail === 'object') {
        const d = detail as { code?: string; message?: string; missing?: { code: string; message: string }[] }
        if (d.code === 'publish_blocked' && Array.isArray(d.missing)) {
          setPublishBlockers(d.missing)
          setPublishError('Publish blocked — see the checklist below.')
        } else if (d.message) {
          setPublishError(d.message)
        } else {
          setPublishError('Publish failed.')
        }
      } else {
        setPublishError(typeof detail === 'string' ? detail : 'Publish failed.')
      }
    } finally { setPublishing(false) }
  }

  function openAddTimeline() {
    if (!pkg) return
    const isPerennial = pkg.package_type === 'PERENNIAL'
    setTlForm({
      name: '',
      from_type: isPerennial ? 'CALENDAR' : 'DAS',
      from_value: '1',
      to_value: '30',
      from_month: '1', from_day: '1',
      to_month: '12', to_day: '31',
    })
    setTlError('')
    setShowAddTL(true)
  }

  async function handleAddTimeline(e: FormEvent) {
    e.preventDefault()
    setTlError('')

    // Compute from_value / to_value per Reference Type.
    let fromVal: number
    let toVal: number
    if (tlForm.from_type === 'CALENDAR') {
      fromVal = dayOfYear(parseInt(tlForm.from_month), parseInt(tlForm.from_day))
      toVal = dayOfYear(parseInt(tlForm.to_month), parseInt(tlForm.to_day))
      if (fromVal >= toVal) {
        setTlError('FROM date must be earlier than TO date in the calendar year.')
        return
      }
    } else {
      fromVal = parseInt(tlForm.from_value)
      toVal = parseInt(tlForm.to_value)
      if (Number.isNaN(fromVal) || Number.isNaN(toVal)) {
        setTlError('FROM and TO must be whole numbers.'); return
      }
      if (tlForm.from_type === 'DAS' && fromVal >= toVal) {
        setTlError('For DAS, FROM (smaller) must be less than TO (larger). The number increases as the season progresses.')
        return
      }
      if (tlForm.from_type === 'DBS' && fromVal <= toVal) {
        setTlError('For DBS, FROM (larger) must be greater than TO (smaller). The number counts down toward sowing.')
        return
      }
    }

    setAddingTL(true)
    try {
      const { data } = await api.post<Timeline>(`/advisory/global/packages/${id}/timelines`, {
        name: tlForm.name, from_type: tlForm.from_type,
        from_value: fromVal, to_value: toVal,
      })
      setShowAddTL(false)
      setTimelines(tls => [...tls, data])
    } catch (err: unknown) {
      setTlError(extractErrorMessage(err, 'Failed to add timeline.'))
    } finally { setAddingTL(false) }
  }

  function openEditTimeline(tl: Timeline) {
    const isCalendar = tl.from_type === 'CALENDAR'
    const fromMD = isCalendar ? doyToMonthDay(tl.from_value) : { month: 1, day: 1 }
    const toMD = isCalendar ? doyToMonthDay(tl.to_value) : { month: 12, day: 31 }
    setEditTLForm({
      name: tl.name,
      from_value: String(tl.from_value),
      to_value: String(tl.to_value),
      from_month: String(fromMD.month), from_day: String(fromMD.day),
      to_month: String(toMD.month), to_day: String(toMD.day),
      status: tl.status || 'ACTIVE',
    })
    setEditTLError('')
    setShowEditTL(tl)
  }

  async function handleEditTimeline(e: FormEvent) {
    e.preventDefault()
    if (!showEditTL) return
    setEditTLError('')

    const isCalendar = showEditTL.from_type === 'CALENDAR'
    let fromVal: number, toVal: number
    if (isCalendar) {
      fromVal = dayOfYear(parseInt(editTLForm.from_month), parseInt(editTLForm.from_day))
      toVal = dayOfYear(parseInt(editTLForm.to_month), parseInt(editTLForm.to_day))
      if (fromVal >= toVal) {
        setEditTLError('FROM date must be earlier than TO date in the calendar year.')
        return
      }
    } else {
      fromVal = parseInt(editTLForm.from_value)
      toVal = parseInt(editTLForm.to_value)
      if (Number.isNaN(fromVal) || Number.isNaN(toVal)) {
        setEditTLError('FROM and TO must be whole numbers.'); return
      }
      if (showEditTL.from_type === 'DAS' && fromVal >= toVal) {
        setEditTLError('For DAS, FROM (smaller) must be less than TO (larger).'); return
      }
      if (showEditTL.from_type === 'DBS' && fromVal <= toVal) {
        setEditTLError('For DBS, FROM (larger) must be greater than TO (smaller).'); return
      }
    }

    setEditingTL(true)
    try {
      const { data } = await api.put<Timeline>(
        `/advisory/global/packages/${id}/timelines/${showEditTL.id}`,
        {
          name: editTLForm.name,
          from_value: fromVal,
          to_value: toVal,
          status: editTLForm.status,
        },
      )
      setTimelines(tls => tls.map(t => t.id === data.id ? data : t))
      setShowEditTL(null)
    } catch (err: unknown) {
      setEditTLError(extractErrorMessage(err, 'Failed to update timeline.'))
    } finally { setEditingTL(false) }
  }

  async function handleDeleteTL(tl: Timeline) {
    if (!confirm(`Delete timeline "${tl.name}"?`)) return
    await api.delete(`/advisory/global/packages/${id}/timelines/${tl.id}`)
    setTimelines(tls => tls.filter(t => t.id !== tl.id))
    if (expanded === tl.id) setExpanded(null)
  }

  function openEditPractice(timelineId: string, p: Practice) {
    // Batch 33: open the Add Practice modal in edit mode. State seeding
    // moved inside `<PracticeFormModal>` (Batch 39P-e); we just set the
    // mode + carry the practice through.
    setEditingPractice({ timelineId, practice: p })
    setShowAddPractice(timelineId)
  }
  async function handleDeletePractice(tlId: string, practiceId: string) {
    if (!confirm('Delete this practice?')) return
    await api.delete(`/advisory/global/packages/${id}/timelines/${tlId}/practices/${practiceId}`)
    setPracticeMap(m => ({ ...m, [tlId]: (m[tlId] || []).filter(p => p.id !== practiceId) }))
  }

  const loadPushStatus = () =>
    api.get<PushStatusRow[]>(`/advisory/global/packages/${id}/push-status`)
      .then(r => setPushStatus(r.data))
      .catch(() => setPushStatus([]))

  function openPushModal() {
    setShowPushModal(true)
    setPushError('')
    setPushStatus(null)
    loadPushStatus()
  }

  function openEdit() {
    if (!pkg) return
    setEditForm({
      name: pkg.name,
      duration_days: String(pkg.duration_days),
      start_date_label_cosh_id: pkg.start_date_label_cosh_id || startDateLabels[0]?.cosh_id || '',
      description: pkg.description || '',
      status: pkg.status,
    })
    setEditError('')
    setShowEdit(true)
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!pkg) return
    setSavingEdit(true); setEditError('')
    try {
      const body: Record<string, unknown> = {
        name: editForm.name.trim() || undefined,
        duration_days: parseInt(editForm.duration_days),
        start_date_label_cosh_id: editForm.start_date_label_cosh_id,
        description: editForm.description.trim() || null,
      }
      // Status change is only sent when the SE actually toggled it
      // (and only when the new value is allowed: ACTIVE↔INACTIVE
      // freely, DRAFT→INACTIVE allowed, DRAFT→ACTIVE blocked
      // server-side — that path goes through Publish).
      if (editForm.status !== pkg.status) {
        body.status = editForm.status
      }
      const { data } = await api.put<Package>(`/advisory/global/packages/${id}`, body)
      setPkg(data)
      setShowEdit(false)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : (detail as { message?: string })?.message
      setEditError(msg || 'Failed to save changes.')
    } finally { setSavingEdit(false) }
  }

  // Batch 39N-b (2026-05-16) — push is now an authoring step. The CM
  // picks a client here, the per-client form (Name / Description /
  // Start Date Label / Locations / PVs / Authors) lives on its own
  // page so the 5-section surface gets room to breathe.
  function handlePushToClient(clientId: string) {
    setShowPushModal(false)
    router.push(`/advisory/global/${id}/push/${clientId}`)
  }

  // ── Parameters & Variables ─────────────────────────────────────────────────

  const loadParameters = async (cropCoshId: string) => {
    const { data } = await api.get<GlobalParameter[]>(
      `/advisory/global/parameters?crop_cosh_id=${encodeURIComponent(cropCoshId)}`,
    )
    setParameters(data)
    const map: Record<string, GlobalVariable[]> = {}
    for (const p of data) {
      const r = await api.get<GlobalVariable[]>(`/advisory/global/parameters/${p.id}/variables`)
      map[p.id] = r.data
    }
    setVariablesByParam(map)
  }

  const loadPackageVariables = async () => {
    const { data } = await api.get<PackageVariableAssignment[]>(
      `/advisory/global/packages/${id}/variables`,
    )
    setPackageVariables(data)
  }

  useEffect(() => {
    if (!pkg) return
    loadParameters(pkg.crop_cosh_id)
    loadPackageVariables()
  }, [pkg?.crop_cosh_id])

  // Batch 28: atomic Custom Parameter create (name + ≥ 2 variables in
  // one round-trip). Replaces the old inline name-only create.
  function openCreateParam() {
    setParamDraft({ name: '', variables: ['', ''] })
    setPvSaveError('')
    setCreatingParam(true)
  }

  async function handleCreateCustomParam() {
    if (!pkg) return
    const name = paramDraft.name.trim()
    const variables = paramDraft.variables.map(v => v.trim()).filter(Boolean)
    if (!name) { setPvSaveError('Parameter name is required.'); return }
    if (variables.length < 2) { setPvSaveError('At least 2 variables are required.'); return }
    setPvSaveError('')
    try {
      await api.post('/advisory/global/parameters', {
        crop_cosh_id: pkg.crop_cosh_id,
        name,
        variables: variables.map(n => ({ name: n })),
      })
      setCreatingParam(false)
      await loadParameters(pkg.crop_cosh_id)
    } catch (err: unknown) {
      setPvSaveError(extractErrorMessage(err, 'Failed to create parameter.'))
    }
  }

  async function handleRenameParameter(paramId: string, newName: string) {
    if (!pkg || !newName.trim()) return
    setPvSaveError('')
    try {
      await api.put(`/advisory/global/parameters/${paramId}`, { name: newName.trim() })
      setEditingParamId(null)
      await loadParameters(pkg.crop_cosh_id)
    } catch (err: unknown) {
      setPvSaveError(extractErrorMessage(err, 'Failed to rename parameter.'))
    }
  }

  async function handleDeleteParameter(paramId: string, paramName: string) {
    if (!pkg) return
    if (!confirm(`Delete parameter "${paramName}" and all its variables?`)) return
    setPvSaveError('')
    try {
      await api.delete(`/advisory/global/parameters/${paramId}`)
      await loadParameters(pkg.crop_cosh_id)
    } catch (err: unknown) {
      setPvSaveError(extractErrorMessage(err, 'Failed to delete parameter.'))
    }
  }

  async function handleRenameVariable(paramId: string, varId: string, newName: string) {
    if (!pkg || !newName.trim()) return
    setPvSaveError('')
    try {
      await api.put(
        `/advisory/global/parameters/${paramId}/variables/${varId}`,
        { name: newName.trim() },
      )
      setEditingVarKey(null)
      await loadParameters(pkg.crop_cosh_id)
    } catch (err: unknown) {
      setPvSaveError(extractErrorMessage(err, 'Failed to rename variable.'))
    }
  }

  async function handleDeleteVariable(paramId: string, varId: string, varName: string) {
    if (!pkg) return
    if (!confirm(`Delete variable "${varName}"?`)) return
    setPvSaveError('')
    try {
      await api.delete(`/advisory/global/parameters/${paramId}/variables/${varId}`)
      await loadParameters(pkg.crop_cosh_id)
    } catch (err: unknown) {
      setPvSaveError(extractErrorMessage(err, 'Failed to delete variable.'))
    }
  }

  // Legacy inline-add: still used to add a 3rd, 4th variable to an
  // existing parameter. Kept as-is to minimise UI churn.
  async function handleAddParameter() {
    /* Replaced by handleCreateCustomParam (Batch 28). Kept as a stub
       to avoid breaking any stale references; the UI no longer calls
       this. */
    void newParamName
  }

  async function handleAddVariable(parameterId: string) {
    if (!newVarName.trim() || !pkg) return
    setPvSaveError('')
    try {
      await api.post(`/advisory/global/parameters/${parameterId}/variables`, {
        parameter_id: parameterId, name: newVarName.trim(),
      })
      setNewVarName(''); setNewVarForParamId(null)
      await loadParameters(pkg.crop_cosh_id)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : (detail as { message?: string })?.message
      setPvSaveError(msg || 'Failed to add variable.')
    }
  }

  function getAssignedVariableId(parameterId: string): string {
    return packageVariables.find(pv => pv.parameter_id === parameterId)?.variable_id || ''
  }

  async function handleAssignVariable(parameterId: string, variableId: string) {
    setPvSaveError('')
    // Build the next assignment set: replace any existing entry for
    // this parameter; drop the entry entirely if variableId is empty.
    const next: PackageVariableAssignment[] = packageVariables
      .filter(pv => pv.parameter_id !== parameterId)
    if (variableId) {
      next.push({ parameter_id: parameterId, variable_id: variableId })
    }
    try {
      await api.put(`/advisory/global/packages/${id}/variables`, { assignments: next })
      setPackageVariables(next)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : (detail as { message?: string })?.message
      setPvSaveError(msg || 'Failed to update package signature.')
    }
  }

  // Editing is allowed only on DRAFT rows. ACTIVE / INACTIVE rows
  // are historical snapshots — the user must clone-to-draft from
  // the banner first. Prior to this gate, the page rendered the
  // full editor regardless of status; users would type for an hour
  // then hit a 422 at Publish/Save time ("not in DRAFT state").
  // 2026-05-21 fix: disable every edit trigger up-front and wrap
  // the editable body in a fieldset so the visual state matches.
  //
  // Hook MUST sit above the `if (!pkg) return …` early return —
  // moving it below violates Rules of Hooks (the hook is skipped
  // on first render while pkg is null, then runs once pkg arrives,
  // and React throws #310 + breaks hydration). 2026-05-22 fix
  // after the renderer-crash bug.
  const editorReadOnly = pkg ? pkg.status !== 'DRAFT' : true
  const { tryEdit, GuardModal } = useReadOnlyGuard({
    isReadOnly: editorReadOnly,
    statusLabel: pkg?.status?.toLowerCase() || 'published',
  })

  if (!pkg) return <AdminLayout><div className="pt-20 text-center text-slate-400">Loading…</div></AdminLayout>

  // Batch 39L-b — read-only banner state. The detail page renders
  // the same authoring affordances for any package status, but when
  // pkg.status is not DRAFT the CM is editing a snapshot that
  // downstream clients may have pulled — so we surface a banner
  // directing them to clone-to-draft (or continue an existing draft).
  const existingDraft = lineage.find(r => r.status === 'DRAFT' && r.id !== pkg?.id) || null
  const nextVersion = pkg ? (pkg.published_at == null ? pkg.version : Math.max(...lineage.map(r => r.version), pkg.version) + 1) : 0
  return (
    <AdminLayout>
      <div className="max-w-4xl space-y-6">
        {pkg && (
          <ReadOnlyBanner
            status={pkg.status}
            currentVersion={pkg.version}
            nextVersion={nextVersion}
            existingDraft={existingDraft as SharedLineageRow | null}
            continueDraftHref={(draft) => `/advisory/global/${draft.id}`}
            cloning={cloning}
            cloneError={cloneError}
            onCloneToDraft={handleCloneToDraft}
          />
        )}
        <VersionHistorySection
          lineage={lineage as SharedLineageRow[]}
          rowDetailUrl={(row) => `/advisory/global/${row.id}`}
          makingEditable={makingEditable}
          onMakeEditable={handleMakeEditable}
          publishedAtChip={(row) => {
            const lr = row as SharedLineageRow & { published_at?: string | null }
            return lr.published_at ? (
              <span className="text-xs text-slate-500">
                published {new Date(lr.published_at).toLocaleDateString()}
              </span>
            ) : null
          }}
        />
        {/* Header */}
        <div className="flex items-start gap-4">
          <button onClick={() => router.back()} className="mt-1 text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{pkg.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">GLOBAL TEMPLATE</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOUR[pkg.status] || 'bg-slate-100 text-slate-600'}`}>{pkg.status}</span>
              {/* Batch 39L-a — persistent version badge so the CM
                  never loses track of what they're editing. */}
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white"
                title={pkg.published_at ? `Published ${new Date(pkg.published_at).toLocaleDateString()}` : 'Not yet published'}>
                v{pkg.version}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              {pkg.package_type} · {pkg.duration_days} days · Crop: <span className="font-mono">{pkg.crop_cosh_id}</span> · v{pkg.version}
            </p>
            {pkg.description && <p className="text-slate-400 text-sm mt-1">{pkg.description}</p>}
            {parameters.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                <span className="font-semibold text-slate-600">Signature:</span>{' '}
                {parameters.map((p, i) => {
                  const assignedId = packageVariables.find(pv => pv.parameter_id === p.id)?.variable_id
                  const variable = assignedId
                    ? (variablesByParam[p.id] || []).find(v => v.id === assignedId)
                    : null
                  return (
                    <span key={p.id}>
                      {i > 0 && <span className="text-slate-300 mx-1.5">·</span>}
                      <span className="text-slate-500">{p.name}: </span>
                      <span className={variable ? 'text-slate-700 font-medium' : 'text-slate-400 italic'}>
                        {variable ? variable.name : 'not set'}
                      </span>
                    </span>
                  )
                })}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {pkg.status === 'DRAFT' && (
              <button onClick={() => {
                setShowPublishModal(true)
                setPublishError('')
                setPublishBlockers([])
              }} disabled={publishing}
                className="bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
                ✓ Publish…
              </button>
            )}
            {pkg.status === 'ACTIVE' && (
              <button onClick={() => togglePkgStatus('INACTIVE')} disabled={togglingPkg}
                className="border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 disabled:opacity-50">
                {togglingPkg ? 'Saving…' : '⊘ Mark Inactive'}
              </button>
            )}
            {pkg.status === 'INACTIVE' && (
              <button onClick={() => togglePkgStatus('ACTIVE')} disabled={togglingPkg}
                className="border border-green-300 text-green-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-green-50 disabled:opacity-50">
                {togglingPkg ? 'Saving…' : '↺ Reactivate'}
              </button>
            )}
            <Link href={`/advisory/global/${id}/preview`}
              className="border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 text-center">
              👁 Preview
            </Link>
            <button
              onClick={() => tryEdit(openEdit)}
              className="border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50">
              ✎ Edit details
            </button>
            <button
              onClick={() => tryEdit(() => { setShowSignature(true); setPvSaveError('') })}
              className="border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50">
              ✎ Set signature
            </button>
            <button
              onClick={openPushModal}
              disabled={pkg.status !== 'ACTIVE'}
              title={pkg.status !== 'ACTIVE'
                ? 'Publish this Global Package before pushing to clients.'
                : 'Push this Global Package to one of your assigned clients.'}
              className="border border-blue-300 text-blue-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed">
              ↗ Push to clients
            </button>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <strong>Global template.</strong> Publish first, then push to assigned clients to seed
          their local copy. Each push is once-per-client; SEs pull subsequent versions themselves
          from the CA portal once they're ready to review your changes.
        </div>

        {/* Timelines */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">
              Timelines <span className="text-slate-400 font-normal text-sm">({timelines.length})</span>
            </h2>
            <button onClick={() => tryEdit(openAddTimeline)}
              className="text-sm font-medium px-3 py-1.5 rounded-xl border border-blue-300 text-blue-600 hover:bg-blue-50">
              + Add Timeline
            </button>
          </div>

          {timelines.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-200">
              <p className="text-slate-500 text-sm">No timelines yet. Add practice windows like "Week 1–4 (Germination)" with INPUT/INSTRUCTION/NON_INPUT practices.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {timelines.map(tl => (
                <div key={tl.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${tl.status === 'INACTIVE' ? 'border-slate-200 opacity-70' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50" onClick={() => toggle(tl.id)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800 text-sm">{tl.name}</p>
                        {tl.status === 'INACTIVE' && (
                          <span className="text-[10px] uppercase tracking-wide bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{tl.from_type} · {formatTimelineRange(tl)}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); tryEdit(() => openEditTimeline(tl)) }}
                      className="text-slate-300 hover:text-blue-500 p-1" title="Edit timeline">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={e => { e.stopPropagation(); tryEdit(() => handleDeleteTL(tl)) }} className="text-slate-300 hover:text-red-400 p-1" title="Delete timeline">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded === tl.id ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {expanded === tl.id && (
                    <div className="border-t border-slate-100 px-5 py-4 space-y-2">
                      {!practiceMap[tl.id]
                        ? <p className="text-xs text-slate-400">Loading…</p>
                        : practiceMap[tl.id].length === 0
                          ? <p className="text-xs text-slate-400 italic">No practices yet.</p>
                          : practiceMap[tl.id].map(p => {
                            const isExpanded = expandedPractice === p.id
                            const hasElements = (p.elements?.length || 0) > 0
                            return (
                              <div key={p.id} className="border-b border-slate-50 last:border-0">
                                <div
                                  className="flex items-center gap-3 py-2 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded"
                                  onClick={() => setExpandedPractice(isExpanded ? null : p.id)}>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${L0_COLOUR[p.l0_type] || 'bg-slate-100'}`}>{p.l0_type}</span>
                                  <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                                    {p.l2_type ? practiceShortLabel(p) : <span className="text-slate-400 italic">No sub-type</span>}
                                  </span>
                                  {p.is_special_input && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">special</span>}
                                  {p.is_brand_locked && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full" title="Locked brand — orders route to onboarded dealers only">🔒 locked</span>}
                                  <span className="text-[11px] text-slate-400">
                                    {hasElements ? `${p.elements!.length} element${p.elements!.length === 1 ? '' : 's'}` : 'no elements'}
                                  </span>
                                  <button onClick={e => { e.stopPropagation(); tryEdit(() => openEditPractice(tl.id, p)) }}
                                    className="text-slate-300 hover:text-blue-500 p-1" title="Edit practice">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); tryEdit(() => handleDeletePractice(tl.id, p.id)) }}
                                    className="text-slate-300 hover:text-red-400 p-1" title="Delete practice">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                  <svg className={`w-3.5 h-3.5 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                                {isExpanded && (
                                  <div className="ml-2 pl-3 border-l-2 border-slate-100 py-2 space-y-1 mb-2">
                                    {hasElements ? p.elements!.map(el => {
                                      // Batch 36 — media element types render
                                      // an inline preview instead of the
                                      // raw URL. UPLOAD_IMAGE → thumbnail,
                                      // UPLOAD_AUDIO → audio player,
                                      // HYPERLINK → preview card.
                                      const url = el.value || ''
                                      const isImg = el.element_type === 'UPLOAD_IMAGE' && url
                                      const isAud = el.element_type === 'UPLOAD_AUDIO' && url
                                      const isLnk = el.element_type === 'HYPERLINK' && url
                                      return (
                                        <div key={el.element_type} className={isImg || isAud || isLnk ? "flex items-start gap-2 text-xs" : "flex items-baseline gap-2 text-xs"}>
                                          <span className="text-slate-500 min-w-[140px] shrink-0">{el.label}:</span>
                                          <span className="text-slate-800 font-medium min-w-0">
                                            {isImg ? (
                                              <a href={url} target="_blank" rel="noopener noreferrer">
                                                <img src={url} alt="" className="max-h-28 rounded border border-slate-200" />
                                              </a>
                                            ) : isAud ? (
                                              // eslint-disable-next-line jsx-a11y/media-has-caption
                                              <audio controls src={url} className="max-w-xs" />
                                            ) : isLnk ? (
                                              <a href={url} target="_blank" rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline break-all">{url}</a>
                                            ) : (
                                              el.display_value || <span className="text-slate-300 italic">—</span>
                                            )}
                                          </span>
                                        </div>
                                      )
                                    }) : (
                                      <p className="text-xs text-slate-400 italic">No elements on this Practice.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })
                      }
                      <button onClick={() => tryEdit(() => setShowAddPractice(tl.id))} className="text-xs font-medium text-blue-600 mt-2 hover:underline">
                        + Add Practice
                      </button>

                      {/* Relations — shared with every other UCAT pipe
                          via `<RelationsSection>` (Batch 39P-b2). The
                          callback keeps `relationsByTimeline` mirrored
                          so the CQ section can resolve relation
                          labels + gate eligibility. */}
                      <RelationsSection
                        timelineId={tl.id}
                        timelineName={tl.name}
                        practices={practiceMap[tl.id] || []}
                        pipe={{ pipe: 'CCA_GLOBAL', parentId: id }}
                        onRelationsChange={(tid, rels) =>
                          setRelationsByTimeline(m => ({ ...m, [tid]: rels }))
                        }
                      />

                      {/* Conditional Questions — shared across pipes
                          via `<CQsSection>` (Batch 39P-c). The
                          callback keeps `cqsByTimeline` mirrored for
                          features like the publish-readiness gate. */}
                      <CQsSection
                        timelineId={tl.id}
                        timelineName={tl.name}
                        practices={practiceMap[tl.id] || []}
                        relations={relationsByTimeline[tl.id] || []}
                        pipe={{ pipe: 'CCA_GLOBAL', parentId: id }}
                        onCQsChange={(tid, list) =>
                          setCqsByTimeline(m => ({ ...m, [tid]: list }))
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {showPublishModal && pkg && (() => {
          let tlCount = 0, practiceCount = 0, relCount = 0, cqCount = 0
          for (const tl of timelines) {
            if (tl.status === 'INACTIVE') continue
            tlCount++
            practiceCount += (practiceMap[tl.id] || []).length
            relCount += (relationsByTimeline[tl.id] || []).length
            cqCount += (cqsByTimeline[tl.id] || []).length
          }
          return (
            <PublishModal
              entityLabel="Package"
              currentVersion={pkg.version}
              isFirstPublish={pkg.published_at == null}
              contentSnapshot={{
                timelines: tlCount,
                practices: practiceCount,
                relations: relCount,
                cqs: cqCount,
              }}
              blockers={publishBlockers}
              error={publishError}
              publishing={publishing}
              onConfirm={handlePublish}
              onCancel={() => {
                setShowPublishModal(false); setPublishError(''); setPublishBlockers([])
              }}
            />
          )
        })()}

        {showAddTL && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="p-6 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Add Timeline Window</h2>
                <p className="text-slate-500 text-sm mt-0.5">Define a practice window (e.g. Week 1–4 germination stage)</p>
              </div>
              <form onSubmit={handleAddTimeline} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
                  <input value={tlForm.name} onChange={e => setTlForm(f => ({ ...f, name: e.target.value }))}
                    required placeholder="e.g. Germination Stage (Week 1–4)"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {(() => {
                  const allowed = ALLOWED_FROM_TYPES_BY_PACKAGE_TYPE[pkg.package_type] || ['DAS', 'DBS', 'CALENDAR']
                  return (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Reference Type
                        {allowed.length === 1 && (
                          <span className="text-xs text-slate-400 font-normal ml-2">
                            (locked — {pkg.package_type === 'PERENNIAL' ? 'Perennials use the calendar' : 'Annuals use DAS / DBS'})
                          </span>
                        )}
                      </label>
                      <select value={tlForm.from_type}
                        onChange={e => setTlForm(f => ({ ...f, from_type: e.target.value }))}
                        disabled={allowed.length === 1}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500">
                        {allowed.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {tlForm.from_type === 'DAS' && 'Days After Sowing — FROM (smaller number) → TO (larger number). The clock runs forward.'}
                        {tlForm.from_type === 'DBS' && 'Days Before Sowing — FROM (larger number) → TO (smaller number). The countdown runs toward sowing.'}
                        {tlForm.from_type === 'CALENDAR' && 'Calendar date — FROM (earlier date) → TO (later date) within a calendar year.'}
                      </p>
                    </div>
                  )
                })()}

                {tlForm.from_type === 'CALENDAR' ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">Window (calendar date)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">From</label>
                        <div className="flex gap-1.5">
                          <select value={tlForm.from_month}
                            onChange={e => setTlForm(f => ({ ...f, from_month: e.target.value }))}
                            className="flex-1 border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white">
                            {MONTH_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                          </select>
                          <input type="number" min="1" max={MONTH_DAYS[parseInt(tlForm.from_month) - 1]}
                            value={tlForm.from_day}
                            onChange={e => setTlForm(f => ({ ...f, from_day: e.target.value }))}
                            className="w-16 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">To</label>
                        <div className="flex gap-1.5">
                          <select value={tlForm.to_month}
                            onChange={e => setTlForm(f => ({ ...f, to_month: e.target.value }))}
                            className="flex-1 border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white">
                            {MONTH_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                          </select>
                          <input type="number" min="1" max={MONTH_DAYS[parseInt(tlForm.to_month) - 1]}
                            value={tlForm.to_day}
                            onChange={e => setTlForm(f => ({ ...f, to_day: e.target.value }))}
                            className="w-16 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          From (day) {tlForm.from_type === 'DBS' && <span className="text-xs text-slate-400 font-normal">(larger)</span>}
                        </label>
                        <input type="number" value={tlForm.from_value}
                          onChange={e => setTlForm(f => ({ ...f, from_value: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          To (day) {tlForm.from_type === 'DBS' && <span className="text-xs text-slate-400 font-normal">(smaller)</span>}
                        </label>
                        <input type="number" value={tlForm.to_value}
                          onChange={e => setTlForm(f => ({ ...f, to_value: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    {tlForm.from_type === 'DBS' && (
                      <p className="text-[11px] text-slate-500">
                        Use <span className="font-medium">To = 0</span> to close at the sowing moment (continuous with a DAS timeline starting at 0).
                      </p>
                    )}
                  </>
                )}
                {tlError && <p className="text-sm text-red-600">{tlError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddTL(false); setTlError('') }}
                    className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={addingTL}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {addingTL ? 'Adding…' : 'Add Timeline'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Practice Modal — also serves Edit mode (Batch 33) when
            editingPractice is set. Submit routes POST vs PUT inside
            handleAddPractice; the only UX cues that flip are the
            title + Submit label. */}
        <PracticeFormModal
          open={!!showAddPractice && !!pkg}
          mode={editingPractice ? 'edit' : 'create'}
          timelineId={showAddPractice || ''}
          cropCoshId={pkg?.crop_cosh_id || ''}
          existingPractice={editingPractice?.practice as ExistingPractice | undefined}
          contextSubtitle={(() => {
            if (!showAddPractice) return undefined
            const tl = timelines.find(t => t.id === showAddPractice)
            if (!tl || !pkg) return undefined
            return `${pkg.package_type} · ${tl.from_type} · ${tl.name}`
          })()}
          timelineWindow={(() => {
            if (!showAddPractice) return undefined
            const tl = timelines.find(t => t.id === showAddPractice)
            if (!tl) return undefined
            return { from_value: tl.from_value, to_value: tl.to_value }
          })()}
          pipe={{ pipe: 'CCA_GLOBAL', parentId: id }}
          usedCommonNames={(() => {
            // Rule 1 (2026-05-22) — peer PESTICIDE/FERTILIZER CNs in
            // this Timeline. Backend rejects duplicates; UI greys
            // them out pre-emptively.
            if (!showAddPractice) return new Set<string>()
            const peers = practiceMap[showAddPractice] || []
            const out = new Set<string>()
            for (const p of peers) {
              if (p.l1_type !== 'PESTICIDE' && p.l1_type !== 'FERTILIZER') continue
              const cn = (p.elements || []).find(e => e.element_type === 'COMMON_NAME')?.cosh_ref
              if (cn) out.add(cn)
            }
            return out
          })()}
          onClose={() => {
            setShowAddPractice(null)
            setEditingPractice(null)
          }}
          onSaved={() => {
            const tlId = showAddPractice
            if (tlId) loadPractices(tlId)
          }}
        />
        {/* Edit Timeline Modal — Batch 28 */}
        {showEditTL && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="p-6 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Edit Timeline</h2>
                <p className="text-slate-500 text-sm mt-0.5">
                  Reference Type is locked: <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{showEditTL.from_type}</span>
                </p>
              </div>
              <form onSubmit={handleEditTimeline} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
                  <input value={editTLForm.name}
                    onChange={e => setEditTLForm(f => ({ ...f, name: e.target.value }))}
                    required
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                {showEditTL.from_type === 'CALENDAR' ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">Window (calendar date)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">From</label>
                        <div className="flex gap-1.5">
                          <select value={editTLForm.from_month}
                            onChange={e => setEditTLForm(f => ({ ...f, from_month: e.target.value }))}
                            className="flex-1 border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white">
                            {MONTH_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                          </select>
                          <input type="number" min="1" max={MONTH_DAYS[parseInt(editTLForm.from_month) - 1]}
                            value={editTLForm.from_day}
                            onChange={e => setEditTLForm(f => ({ ...f, from_day: e.target.value }))}
                            className="w-16 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">To</label>
                        <div className="flex gap-1.5">
                          <select value={editTLForm.to_month}
                            onChange={e => setEditTLForm(f => ({ ...f, to_month: e.target.value }))}
                            className="flex-1 border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white">
                            {MONTH_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                          </select>
                          <input type="number" min="1" max={MONTH_DAYS[parseInt(editTLForm.to_month) - 1]}
                            value={editTLForm.to_day}
                            onChange={e => setEditTLForm(f => ({ ...f, to_day: e.target.value }))}
                            className="w-16 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">From (Day)</label>
                      <input type="number" value={editTLForm.from_value}
                        onChange={e => setEditTLForm(f => ({ ...f, from_value: e.target.value }))}
                        required
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">To (Day)</label>
                      <input type="number" value={editTLForm.to_value}
                        onChange={e => setEditTLForm(f => ({ ...f, to_value: e.target.value }))}
                        required
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    {showEditTL.from_type === 'DBS' && (
                      <p className="col-span-2 text-[11px] text-slate-500 -mt-1">
                        Use <span className="font-medium">To = 0</span> to close at the sowing moment (continuous with a DAS timeline starting at 0).
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                  <div className="flex gap-2">
                    {(['ACTIVE', 'INACTIVE'] as const).map(s => (
                      <button key={s} type="button"
                        onClick={() => setEditTLForm(f => ({ ...f, status: s }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border ${
                          editTLForm.status === s
                            ? (s === 'ACTIVE'
                                ? 'bg-green-50 border-green-300 text-green-700'
                                : 'bg-slate-100 border-slate-300 text-slate-700')
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}>
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Inactive timelines stay visible on this page with a badge but are excluded from the farmer&apos;s daily advisory.
                  </p>
                </div>

                {editTLError && <p className="text-sm text-red-600">{editTLError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowEditTL(null); setEditTLError('') }}
                    className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={editingTL}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {editingTL ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Package Details Modal */}
        {showEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="p-6 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Edit Package Details</h2>
                <p className="text-slate-500 text-sm mt-0.5">
                  Crop and type are locked — changing them would break content semantics
                  on already-pushed Locals.
                </p>
              </div>
              <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Package Name</label>
                  <input value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    required
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Date Label</label>
                  <select value={editForm.start_date_label_cosh_id}
                    onChange={e => setEditForm(f => ({ ...f, start_date_label_cosh_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    {!editForm.start_date_label_cosh_id && (
                      <option value="">— pick a label —</option>
                    )}
                    {startDateLabels.map(l => (
                      <option key={l.cosh_id} value={l.cosh_id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Duration (days)
                    {pkg.package_type === 'PERENNIAL' && (
                      <span className="text-xs text-slate-400 font-normal ml-2">(locked at 365 for Perennial)</span>
                    )}
                  </label>
                  <input type="number" min="1" max="365"
                    value={editForm.duration_days}
                    disabled={pkg.package_type === 'PERENNIAL'}
                    onChange={e => setEditForm(f => ({ ...f, duration_days: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400" />
                  {pkg.package_type === 'ANNUAL' && (
                    <p className="text-[11px] text-slate-400 mt-1">1 – 365 days.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                  <textarea value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>

                {/* Status toggle (Batch 28). DRAFT can move to INACTIVE
                    (discarding); promotion to ACTIVE goes through the
                    Publish button, not this toggle. */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                  <div className="flex gap-2">
                    {(['DRAFT', 'ACTIVE', 'INACTIVE'] as const).map(s => {
                      const isCurrent = editForm.status === s
                      // DRAFT button is read-only — SE can't manually set DRAFT;
                      // it's only set by the system on create / clone.
                      // ACTIVE button is disabled when current is DRAFT
                      // (must go through Publish).
                      const disabled = s === 'DRAFT'
                        || (s === 'ACTIVE' && pkg.status === 'DRAFT')
                      return (
                        <button key={s} type="button"
                          onClick={() => !disabled && setEditForm(f => ({ ...f, status: s }))}
                          disabled={disabled}
                          className={`flex-1 py-2 rounded-xl text-sm font-medium border ${
                            isCurrent
                              ? (s === 'ACTIVE'
                                  ? 'bg-green-50 border-green-300 text-green-700'
                                  : s === 'DRAFT'
                                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                                    : 'bg-slate-100 border-slate-300 text-slate-700')
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white'
                          }`}>
                          {s.charAt(0) + s.slice(1).toLowerCase()}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {pkg.status === 'DRAFT'
                      ? 'Use Publish to promote DRAFT → ACTIVE. You can also discard a draft by switching it to Inactive.'
                      : 'Toggle between Active and Inactive. Inactive packages are hidden from CA-portal pull and farmer advisory.'}
                  </p>
                </div>

                {editError && <p className="text-sm text-red-600">{editError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button"
                    onClick={() => { setShowEdit(false); setEditError('') }}
                    className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingEdit}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {savingEdit ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Conditional Question Modal — Batch 39E (2026-05-15). The
            SE drafts a YES/NO question and attaches a Practice or a
            Relation to either side. Once attached, that entity is
            gated by the CQ — never fires unless the farmer's answer
            matches the attached side. */}


        {/* Set Signature Modal — Parameters & Variables (Batch 9) */}
        {showSignature && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
              <div className="p-6 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Package Signature</h2>
                <p className="text-slate-500 text-sm mt-0.5">
                  Parameters &amp; Variables that distinguish this Package from siblings for the
                  same crop. Deep-copied to every Local on push.
                </p>
                {/* Batch 37 — used count + hide-unused toggle. */}
                {parameters.length > 0 && (() => {
                  const usedCount = parameters.filter(p => getAssignedVariableId(p.id) !== '').length
                  return (
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-slate-500">
                        {usedCount} of {parameters.length} parameter{parameters.length === 1 ? '' : 's'} assigned
                      </span>
                      <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                        <input type="checkbox"
                          checked={hideUnusedParams}
                          onChange={e => setHideUnusedParams(e.target.checked)}
                          className="w-3.5 h-3.5 rounded" />
                        Hide unused
                      </label>
                    </div>
                  )
                })()}
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {parameters.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">
                    No parameters yet for <span className="font-mono">{pkg.crop_cosh_id}</span>.
                    Add one below (e.g. Irrigation) and give it a couple of variables
                    (e.g. Drip, Flood).
                  </p>
                ) : (() => {
                  const visibleParams = hideUnusedParams
                    ? parameters.filter(p => getAssignedVariableId(p.id) !== '')
                    : parameters
                  if (visibleParams.length === 0) {
                    // hideUnusedParams is on but nothing is assigned yet.
                    return (
                      <p className="text-sm text-slate-400 italic">
                        No parameters assigned for this Package yet. Uncheck "Hide unused"
                        above to see all parameters and assign variables.
                      </p>
                    )
                  }
                  return visibleParams.map(param => {
                  const vars = variablesByParam[param.id] || []
                  const assignedId = getAssignedVariableId(param.id)
                  const isUsed = assignedId !== ''
                  const isCustom = param.source === 'CUSTOM'
                  const isEditingThisParam = editingParamId === param.id
                  return (
                    <div key={param.id}
                      className={`py-3 last:border-0 ${isUsed ? 'border-b border-green-100 bg-green-50/40 -mx-2 px-2 rounded-lg' : 'border-b border-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          {isEditingThisParam ? (
                            <input
                              value={editingParamName}
                              onChange={e => setEditingParamName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameParameter(param.id, editingParamName)
                                if (e.key === 'Escape') setEditingParamId(null)
                              }}
                              onBlur={() => handleRenameParameter(param.id, editingParamName)}
                              autoFocus
                              className="w-full border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-700 truncate">{param.name}</p>
                              {!isCustom && (
                                <span className="text-[10px] uppercase tracking-wide bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                  Cosh
                                </span>
                              )}
                              {isUsed && (
                                <span className="text-[10px] uppercase tracking-wide bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                  Used
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <select
                          value={assignedId}
                          onChange={e => handleAssignVariable(param.id, e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                          <option value="">— not set —</option>
                          {vars.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                        {SHOW_CUSTOM_PV && isCustom && !isEditingThisParam && (
                          <>
                            <button
                              onClick={() => {
                                setEditingParamId(param.id)
                                setEditingParamName(param.name)
                              }}
                              className="text-slate-400 hover:text-blue-500 p-1" title="Rename parameter">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteParameter(param.id, param.name)}
                              className="text-slate-400 hover:text-red-500 p-1" title="Delete parameter">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22" />
                              </svg>
                            </button>
                          </>
                        )}
                        {SHOW_CUSTOM_PV && (
                          <button
                            onClick={() => {
                              setNewVarForParamId(newVarForParamId === param.id ? null : param.id)
                              setNewVarName('')
                            }}
                            className="text-xs text-blue-600 hover:underline">
                            {newVarForParamId === param.id ? 'Cancel' : '+ Variable'}
                          </button>
                        )}
                      </div>
                      {/* Variable rendering — Batch 35 (2026-05-14): the
                          gate is per-variable (cosh_id), not per-parameter
                          source. A Cosh-mirrored parent can still hold
                          SE-added variables which the expert can rename
                          or delete; Cosh-mirrored variables themselves are
                          rendered as static chips with no controls. */}
                      {vars.length > 0 && (() => {
                        const coshVars = vars.filter(v => v.cosh_id !== null)
                        const seVars = vars.filter(v => v.cosh_id === null)
                        return (
                          <div className="mt-1.5 ml-1 space-y-1">
                            {coshVars.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {coshVars.map(v => {
                                  const isAssigned = v.id === assignedId
                                  return (
                                    <span key={v.id}
                                      className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2.5 py-0.5 ${isAssigned ? 'bg-green-100 text-green-800 font-medium ring-1 ring-green-300' : 'bg-blue-50 text-blue-700'}`}
                                      title={isAssigned ? 'Assigned to this Package' : 'From Cosh — read-only'}>
                                      {v.name}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                            {seVars.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {seVars.map(v => {
                                  const key = `${param.id}:${v.id}`
                                  const editingThis = SHOW_CUSTOM_PV && editingVarKey === key
                                  const isAssigned = v.id === assignedId
                                  if (!SHOW_CUSTOM_PV) {
                                    // Batch DD (2026-05-19) — render
                                    // historical SE-added variables as
                                    // read-only chips. SA can still see
                                    // them and dropdowns still assign them
                                    // (preserves any existing data) but no
                                    // new rename/delete is offered.
                                    return (
                                      <span key={v.id}
                                        className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2.5 py-0.5 ${isAssigned ? 'bg-green-100 text-green-800 font-medium ring-1 ring-green-300' : 'bg-slate-100 text-slate-500'}`}
                                        title={isAssigned ? 'Assigned to this Package' : 'Legacy custom — read-only on SA'}>
                                        {v.name}
                                      </span>
                                    )
                                  }
                                  return editingThis ? (
                                    <input key={v.id}
                                      value={editingVarName}
                                      onChange={e => setEditingVarName(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleRenameVariable(param.id, v.id, editingVarName)
                                        if (e.key === 'Escape') setEditingVarKey(null)
                                      }}
                                      onBlur={() => handleRenameVariable(param.id, v.id, editingVarName)}
                                      autoFocus
                                      className="border border-blue-300 rounded-full px-2 py-0.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  ) : (
                                    <span key={v.id}
                                      className={`inline-flex items-center gap-1 text-[11px] rounded-full pl-2.5 pr-1 py-0.5 ${isAssigned ? 'bg-green-100 text-green-800 font-medium ring-1 ring-green-300' : 'bg-slate-100 text-slate-600'}`}
                                      title={isAssigned ? 'Assigned to this Package' : undefined}>
                                      <button onClick={() => { setEditingVarKey(key); setEditingVarName(v.name) }}
                                        className={isAssigned ? 'hover:text-green-900' : 'hover:text-blue-600'}>{v.name}</button>
                                      <button onClick={() => handleDeleteVariable(param.id, v.id, v.name)}
                                        className={`ml-0.5 leading-none ${isAssigned ? 'text-green-600 hover:text-red-500' : 'text-slate-400 hover:text-red-500'}`}
                                        title="Delete variable">
                                        ×
                                      </button>
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })
                })()}

                {SHOW_CUSTOM_PV && newVarForParamId && (
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      value={newVarName}
                      onChange={e => setNewVarName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddVariable(newVarForParamId) }}
                      autoFocus
                      placeholder="New variable name (e.g. Drip)"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={() => handleAddVariable(newVarForParamId)}
                      disabled={!newVarName.trim()}
                      className="text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                      Add
                    </button>
                  </div>
                )}

                {/* New Parameter — opens an atomic sub-dialog. Per Batch 28
                    the API requires name + ≥ 2 variables in one round-trip,
                    so the inline single-field form is replaced by a proper
                    sub-form. Batch DD (2026-05-19) — hidden on SA per user
                    rule: Globals are pure Cosh. Custom P-V stays on CA-CCA
                    where it belongs. */}
                {SHOW_CUSTOM_PV && (
                <div className="pt-3 border-t border-slate-50">
                  {!creatingParam ? (
                    <button onClick={openCreateParam}
                      className="w-full text-sm font-medium px-3 py-2 rounded-lg border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50">
                      + New Custom Parameter
                    </button>
                  ) : (
                    <div className="border border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50/30">
                      <h4 className="text-sm font-semibold text-slate-800">New Custom Parameter</h4>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                        <input
                          value={paramDraft.name}
                          onChange={e => setParamDraft(d => ({ ...d, name: e.target.value }))}
                          autoFocus
                          placeholder="e.g. Irrigation"
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Variables <span className="text-slate-400 font-normal">(at least 2 required)</span>
                        </label>
                        <div className="space-y-1.5">
                          {paramDraft.variables.map((v, i) => (
                            <div key={i} className="flex gap-1.5">
                              <input
                                value={v}
                                onChange={e => setParamDraft(d => ({
                                  ...d, variables: d.variables.map((vv, ii) => ii === i ? e.target.value : vv),
                                }))}
                                placeholder={`Variable ${i + 1} (e.g. ${i === 0 ? 'Drip' : 'Flood'})`}
                                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              {paramDraft.variables.length > 2 && (
                                <button type="button"
                                  onClick={() => setParamDraft(d => ({
                                    ...d, variables: d.variables.filter((_, ii) => ii !== i),
                                  }))}
                                  className="text-slate-400 hover:text-red-500 px-2"
                                  title="Remove this variable slot">
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <button type="button"
                          onClick={() => setParamDraft(d => ({ ...d, variables: [...d.variables, ''] }))}
                          className="text-xs text-blue-600 hover:underline mt-1.5">
                          + Add another variable
                        </button>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button type="button"
                          onClick={() => { setCreatingParam(false); setPvSaveError('') }}
                          className="flex-1 text-sm border border-slate-200 text-slate-700 font-medium py-1.5 rounded-lg hover:bg-white">
                          Cancel
                        </button>
                        <button type="button"
                          onClick={handleCreateCustomParam}
                          disabled={
                            !paramDraft.name.trim()
                            || paramDraft.variables.filter(v => v.trim()).length < 2
                          }
                          className="flex-1 text-sm bg-blue-600 text-white font-semibold py-1.5 rounded-lg disabled:opacity-50">
                          Create
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                )}

                {pvSaveError && <p className="text-xs text-red-600">{pvSaveError}</p>}
              </div>

              <div className="p-4 border-t border-slate-100 flex justify-end">
                <button onClick={() => setShowSignature(false)}
                  className="text-sm font-medium text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-50">
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Push to Clients Modal */}
        {showPushModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="p-6 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Push “{pkg.name}” to a client</h2>
                <p className="text-slate-500 text-sm mt-0.5">
                  First contact only. After this, the client&apos;s SE pulls subsequent versions.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-2">
                {pushStatus === null ? (
                  <p className="text-slate-400 text-sm">Loading…</p>
                ) : pushStatus.length === 0 ? (
                  <p className="text-slate-400 text-sm italic">
                    You have no assigned clients with edit rights.
                  </p>
                ) : pushStatus.map(row => (
                  <div key={row.client_id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{row.client_name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {row.already_pushed ? (
                          <>
                            Pushed {row.pushed_at ? new Date(row.pushed_at).toLocaleDateString() : ''}
                            {row.latest_local_published_at && (
                              <> · Local v live since {new Date(row.latest_local_published_at).toLocaleDateString()}</>
                            )}
                            {row.has_pending_draft && (
                              <span className="text-amber-600"> · DRAFT in progress</span>
                            )}
                          </>
                        ) : 'Not yet pushed'}
                      </p>
                    </div>
                    {row.already_pushed ? (
                      <span className="text-xs font-medium text-slate-400 px-3 py-1.5">Already pushed</span>
                    ) : (
                      <button
                        onClick={() => handlePushToClient(row.client_id)}
                        className="text-sm font-semibold text-white bg-blue-600 px-4 py-1.5 rounded-xl">
                        Push details →
                      </button>
                    )}
                  </div>
                ))}
                {pushError && (
                  <p className="text-sm text-red-600 mt-3">{pushError}</p>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 flex justify-end">
                <button onClick={() => setShowPushModal(false)}
                  className="text-sm font-medium text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        <GuardModal />
      </div>
    </AdminLayout>
  )
}
