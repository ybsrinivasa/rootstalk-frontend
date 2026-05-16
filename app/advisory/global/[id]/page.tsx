'use client'
import { useEffect, useState, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface Package {
  id: string; name: string; crop_cosh_id: string
  package_type: string; status: string; duration_days: number
  version: number; description: string | null; created_at: string
  start_date_label_cosh_id: string | null
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
interface TaxonomyL2 { id: string; label: string }
interface TaxonomyL1 { id: string; label: string; l2: TaxonomyL2[] }
interface TaxonomyL0 { id: string; label: string; l1: TaxonomyL1[] }
interface L2ElementField {
  name: string
  label: string
  source: string
  mandatory: boolean
  mandatory_if_set: string[]
  cascade_from: string[]
  auto_selected: boolean
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

// ── Cosh-options cascade (Batch 20, 2026-05-14) ────────────────────────────
// The rule book's source strings (`cosh_core:<slug>` and
// `cosh_cascade:<lookup>`) map to backend `/cosh/options/*` endpoints
// shipped 2026-05-14. We translate source string → fetch call here.

interface CoshOption { cosh_id: string; name: string }

// `cosh_core:<slug>` slugs that point at a Cosh unit_types pool.
// Matches UNIT_TYPE_SLUG_TO_COSH_UUIDS on the backend.
const UNIT_TYPE_SLUGS = new Set([
  'dosage_unit', 'volume_unit', 'temperature_unit', 'distance_unit',
  'time_unit', 'number_unit', 'irrigation_unit', 'size_unit', 'depth_unit',
])

// `cosh_core:<slug>` and `cosh_cascade:<lookup>` strings the modal
// can render as dropdowns. Everything else (planting_material,
// itk_name, maturity_index, …) falls back to free text until Cosh
// ships those Connects.
function isCoshDropdownSource(source: string): boolean {
  if (source === 'cosh_core:common_name') return true
  if (source === 'cosh_core:application_method') return true
  if (source === 'cosh_core:formulation') return true
  if (source.startsWith('cosh_core:')) {
    return UNIT_TYPE_SLUGS.has(source.slice(10))
  }
  if (source === 'cosh_cascade:manufacturers_for_common_name') return true
  if (source === 'cosh_cascade:brands_for_common_name_and_manufacturer') return true
  if (source === 'cosh_cascade:formulation_for_brand') return true
  if (source === 'cosh_cascade:ai_concentration_for_brand') return true
  return false
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

  // Batch 39B (2026-05-15): Relations on each Timeline. AND/OR simple
  // shapes only in this sub-batch; mixed AND-OR + IF land in 39C/39D.
  const [relationsByTimeline, setRelationsByTimeline] = useState<Record<string, RelationOut[]>>({})
  // Batch 39E — Conditional Questions per timeline + Add CQ modal.
  const [cqsByTimeline, setCqsByTimeline] = useState<Record<string, CQOut[]>>({})
  const [showAddCQ, setShowAddCQ] = useState<string | null>(null)
  // Batch 39G — when set, the Add CQ modal opens in edit mode for the
  // identified CQ; submit hits PUT instead of POST. Null = create mode.
  const [editingCQ, setEditingCQ] = useState<{ timelineId: string; cqId: string } | null>(null)
  const [cqForm, setCqForm] = useState<{
    question_text: string
    yes_attachment: string  // "practice:id" | "relation:id" | ""
    no_attachment: string
  }>({ question_text: '', yes_attachment: '', no_attachment: '' })
  const [savingCQ, setSavingCQ] = useState(false)
  const [cqError, setCqError] = useState('')
  const [showAddRelation, setShowAddRelation] = useState<string | null>(null)
  // Batch 39C-rev2 (2026-05-15) — linear chain builder. The SE picks
  // one practice (or a previously Add-to-List item) per slot, joined
  // by AND / OR operators picked between slots. The chain reads like
  // an expression: `A OR B AND C`. ADD TO LIST stores the chain as a
  // referenceable sub-expression and clears the row; SAVE resolves the
  // chain (using AND-tighter precedence) into the backend's parts shape.
  // List items keep the modal session compact while still letting the SE
  // build complex shapes like `(A+B) or C or D + (P or Q) + (M or N)`.
  const [chainSlots, setChainSlots] = useState<string[]>([])  // practice_id or "list:Lx"
  const [chainOps, setChainOps] = useState<('AND' | 'OR')[]>([])
  const [pickingOp, setPickingOp] = useState(false)  // SE clicked + to extend; show AND/OR buttons
  interface RelationListItem { id: string; slots: string[]; ops: ('AND' | 'OR')[] }
  const [listItems, setListItems] = useState<RelationListItem[]>([])
  const [relationForm, setRelationForm] = useState<{ expression: string }>({ expression: '' })
  const [savingRelation, setSavingRelation] = useState(false)
  const [relationError, setRelationError] = useState('')

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
  const [addingPractice, setAddingPractice] = useState(false)
  const [practiceError, setPracticeError] = useState('')
  const [practiceForm, setPracticeForm] = useState({
    l0_type: 'INPUT', l1_type: '', l2_type: '', display_order: '0',
    is_special_input: false,
    // Batch 39I-a — SE opts in to Lock Brand per Practice. Checkbox
    // is disabled in the modal until a Trade Name (BRAND_NAME) is
    // picked. Auto-clears when BRAND_NAME is wiped.
    is_brand_locked: false,
  })
  // Batch 33: when set, the Practice modal opens in EDIT mode pre-
  // filled with this Practice's current values; Submit issues PUT
  // instead of POST. Carries the timeline_id alongside since the
  // PUT URL needs both ids.
  const [editingPractice, setEditingPractice] = useState<{ timelineId: string; practice: Practice } | null>(null)

  // Practice taxonomy — loaded once from /practice-taxonomy; drives
  // the cascading L0 / L1 / L2 dropdowns in the Add Practice modal.
  const [taxonomy, setTaxonomy] = useState<TaxonomyL0[]>([])
  useEffect(() => {
    api.get<TaxonomyL0[]>('/practice-taxonomy').then(r => setTaxonomy(r.data)).catch(() => setTaxonomy([]))
  }, [])

  const currentL0 = taxonomy.find(l0 => l0.id === practiceForm.l0_type)
  const currentL1 = currentL0?.l1.find(l1 => l1.id === practiceForm.l1_type)

  // L2 element spec — fetched when an L2 is picked. Renders the
  // appropriate input per field. Values are stored as strings in
  // `elementValues`, keyed by field.name. Submit packs them into
  // the elements[] payload (see handleAddPractice).
  const [l2Spec, setL2Spec] = useState<L2ElementField[]>([])
  const [elementValues, setElementValues] = useState<Record<string, string>>({})
  // L2-level flags from the rule book (Batch 25). Used to gate UI
  // affordances that only apply to specific L2s — e.g. the Special
  // Input checkbox should appear only for L2s with is_special_input
  // (ADJUVANTS today).
  const [l2Meta, setL2Meta] = useState<{ is_special_input: boolean; frequency_based: boolean }>({
    is_special_input: false, frequency_based: false,
  })

  // Cosh option lists for the cascading dropdowns. Keyed by
  // field.name (e.g. COMMON_NAME, BRAND_NAME, MANUFACTURER,
  // FORMULATION, AI_CONCENTRATION, DOSAGE_UNIT, …).
  const [optionsByField, setOptionsByField] = useState<Record<string, CoshOption[]>>({})

  useEffect(() => {
    if (!practiceForm.l2_type || !pkg) {
      setL2Spec([]); setElementValues({}); setOptionsByField({})
      setL2Meta({ is_special_input: false, frequency_based: false })
      return
    }
    // Pass the package's crop_cosh_id so the backend can scope
    // plant-wise dosage extras to PLANT_WISE crops only. AREA_WISE
    // and unclassified crops won't see VOLUME_PER_PLANT fields.
    const qs = new URLSearchParams({ crop_cosh_id: pkg.crop_cosh_id })
    api.get<{ elements: L2ElementField[]; is_special_input?: boolean; frequency_based?: boolean }>(
      `/practice-taxonomy/elements/${encodeURIComponent(practiceForm.l2_type)}?${qs}`,
    )
      .then(r => {
        setL2Spec(r.data.elements)
        const fresh: Record<string, string> = {}
        const existing = editingPractice?.practice.elements || []
        for (const f of r.data.elements) {
          // Batch 33: in edit mode, seed each spec field from the
          // practice's stored element (cosh_ref or value); fall back
          // to blank for new fields not present in the original.
          const match = existing.find(e => e.element_type === f.name)
          fresh[f.name] = match?.cosh_ref || match?.value || ''
        }
        setElementValues(fresh)
        setOptionsByField({})
        const newMeta = {
          is_special_input: !!r.data.is_special_input,
          frequency_based: !!r.data.frequency_based,
        }
        setL2Meta(newMeta)
        // Default-check the Special Input box for L2s where it applies
        // (ADJUVANTS today). Standalone adjuvant recommendations don't
        // make practical sense — adjuvants ride along with every host
        // input — so pre-checking is the correct default per user
        // 2026-05-14. SE can still uncheck for any edge case. In
        // edit mode, prefer the practice's stored value over the
        // default so an explicit uncheck round-trips.
        setPracticeForm(prev => ({
          ...prev,
          is_special_input: editingPractice
            ? editingPractice.practice.is_special_input
            : newMeta.is_special_input,
        }))
      })
      .catch(() => {
        setL2Spec([]); setElementValues({}); setOptionsByField({})
        setL2Meta({ is_special_input: false, frequency_based: false })
      })
  }, [practiceForm.l2_type, pkg?.crop_cosh_id, pkg])

  // Fetch L2-level dropdowns (no cascade parent) when l2Spec lands.
  // Common Names, Application Methods, and unit dropdowns are all
  // scoped by L2; they don't depend on other field values, so they
  // can populate immediately.
  useEffect(() => {
    if (!practiceForm.l2_type || l2Spec.length === 0) return
    const l2 = practiceForm.l2_type
    const fetched: Record<string, CoshOption[]> = {}
    const pending: Promise<unknown>[] = []
    for (const f of l2Spec) {
      if (f.cascade_from.length > 0) continue
      if (f.source === 'cosh_core:common_name') {
        pending.push(api.get<CoshOption[]>(
          `/cosh/options/common-names?l2=${encodeURIComponent(l2)}`,
        ).then(r => { fetched[f.name] = r.data }).catch(() => { fetched[f.name] = [] }))
      } else if (f.source === 'cosh_core:application_method') {
        pending.push(api.get<CoshOption[]>(
          `/cosh/options/application-methods?l2=${encodeURIComponent(l2)}`,
        ).then(r => { fetched[f.name] = r.data }).catch(() => { fetched[f.name] = [] }))
      } else if (f.source.startsWith('cosh_core:') && UNIT_TYPE_SLUGS.has(f.source.slice(10))) {
        const slug = f.source.slice(10)
        pending.push(api.get<CoshOption[]>(
          `/cosh/options/units?l2=${encodeURIComponent(l2)}&unit_type=${encodeURIComponent(slug)}`,
        ).then(r => { fetched[f.name] = r.data }).catch(() => { fetched[f.name] = [] }))
      }
    }
    if (pending.length === 0) return
    Promise.all(pending).then(() => setOptionsByField(prev => ({ ...prev, ...fetched })))
  }, [practiceForm.l2_type, l2Spec])

  // Cascade plumbing (Batch 24): MANUFACTURER and BRAND_NAME are
  // independent optional peers under COMMON_NAME, each filtering the
  // other. F + a.i. populate spanning the CN's trade names when no
  // BRAND is set, and narrow when BRAND is set. Each list has its
  // own refresh effect; stale child values get auto-cleared when
  // they fall out of the new list.
  const commonName = elementValues['COMMON_NAME'] || ''
  const manufacturer = elementValues['MANUFACTURER'] || ''
  const brandName = elementValues['BRAND_NAME'] || ''

  // F + a.i. — fetches with CN and optional TN. Replaces the
  // separate CN-cascade and TN-narrow effects from Batch 20.
  // Batch 39D — pass `l2` so the backend can apply the per-L2
  // completeness filter (only TNs satisfying every required Cosh
  // connect surface).
  useEffect(() => {
    if (l2Spec.length === 0) return
    if (!commonName) return
    const cnEnc = encodeURIComponent(commonName)
    const tnSuffix = brandName ? `&trade_name=${encodeURIComponent(brandName)}` : ''
    const l2Suffix = practiceForm.l2_type ? `&l2=${encodeURIComponent(practiceForm.l2_type)}` : ''
    const url_form = `/cosh/options/formulations?common_name=${cnEnc}${tnSuffix}${l2Suffix}`
    const url_ai = `/cosh/options/ai-concentrations?common_name=${cnEnc}${tnSuffix}${l2Suffix}`
    const fetched: Record<string, CoshOption[]> = {}
    const pending: Promise<unknown>[] = []
    for (const f of l2Spec) {
      if (f.source === 'cosh_cascade:formulation_for_brand') {
        pending.push(api.get<CoshOption[]>(url_form)
          .then(r => { fetched[f.name] = r.data })
          .catch(() => { fetched[f.name] = [] }))
      } else if (f.source === 'cosh_cascade:ai_concentration_for_brand') {
        pending.push(api.get<CoshOption[]>(url_ai)
          .then(r => { fetched[f.name] = r.data })
          .catch(() => { fetched[f.name] = [] }))
      } else if (f.source === 'cosh_core:formulation' && f.cascade_from.length === 0) {
        // L2-level formulation field that lives alongside a
        // COMMON_NAME — span the CN's trade names for V1.
        pending.push(api.get<CoshOption[]>(url_form)
          .then(r => { fetched[f.name] = r.data })
          .catch(() => { fetched[f.name] = [] }))
      }
    }
    if (pending.length === 0) return
    Promise.all(pending).then(() => setOptionsByField(prev => ({ ...prev, ...fetched })))
  }, [commonName, brandName, l2Spec])

  // MFR list refresh — fetches with CN and optional TN cross-filter.
  // Clears MFR's current value if it falls out of the new list.
  useEffect(() => {
    if (l2Spec.length === 0) return
    if (!commonName) return
    const mfrField = l2Spec.find(f => f.source === 'cosh_cascade:manufacturers_for_common_name')
    if (!mfrField) return
    const cnEnc = encodeURIComponent(commonName)
    const tnSuffix = brandName ? `&trade_name=${encodeURIComponent(brandName)}` : ''
    const l2Suffix = practiceForm.l2_type ? `&l2=${encodeURIComponent(practiceForm.l2_type)}` : ''
    api.get<CoshOption[]>(`/cosh/options/manufacturers?common_name=${cnEnc}${tnSuffix}${l2Suffix}`)
      .then(r => {
        setOptionsByField(prev => ({ ...prev, [mfrField.name]: r.data }))
        setElementValues(prev => {
          const cur = prev[mfrField.name] || ''
          if (cur && !r.data.some(o => o.cosh_id === cur)) {
            return { ...prev, [mfrField.name]: '' }
          }
          return prev
        })
      })
      .catch(() => { /* leave list as-is */ })
  }, [commonName, brandName, l2Spec])

  // TN list refresh — fetches with CN and optional MFR cross-filter.
  // Clears TN (and downstream F + a.i.) if it falls out of the new list.
  useEffect(() => {
    if (l2Spec.length === 0) return
    if (!commonName) return
    const tnField = l2Spec.find(f => f.source === 'cosh_cascade:brands_for_common_name_and_manufacturer')
    if (!tnField) return
    const cnEnc = encodeURIComponent(commonName)
    const mfrSuffix = manufacturer ? `&manufacturer=${encodeURIComponent(manufacturer)}` : ''
    const l2Suffix = practiceForm.l2_type ? `&l2=${encodeURIComponent(practiceForm.l2_type)}` : ''
    api.get<CoshOption[]>(`/cosh/options/trade-names?common_name=${cnEnc}${mfrSuffix}${l2Suffix}`)
      .then(r => {
        setOptionsByField(prev => ({ ...prev, [tnField.name]: r.data }))
        setElementValues(prev => {
          const cur = prev[tnField.name] || ''
          if (cur && !r.data.some(o => o.cosh_id === cur)) {
            // Stale TN — clear it. The F + a.i. effect will refire
            // (via brandName dependency) and re-broaden to CN-scope.
            return { ...prev, [tnField.name]: '' }
          }
          return prev
        })
      })
      .catch(() => { /* leave list as-is */ })
  }, [commonName, manufacturer, l2Spec])

  // Change handler that cascades clear-on-parent-change: setting a
  // new COMMON_NAME wipes MANUFACTURER / BRAND_NAME / FORMULATION /
  // AI_CONCENTRATION values + their option lists. Setting a new
  // BRAND_NAME wipes FORMULATION / AI_CONCENTRATION (their previous
  // narrowed value is now stale).
  function setElementValue(fieldName: string, value: string) {
    // Batch 33: per user 2026-05-14, tighten the cascade-clear rules.
    // Changing a parent invalidates downstream fields that were
    // implicitly bound to it. INSTRUCTIONS never auto-clears (it's
    // free-text the SE wrote against the previous picks; preserving
    // it across edits avoids accidental loss). APPLICATION_METHOD is
    // L2-scoped (not CN-scoped), but per user spec it's still
    // cleared when CN/TN/MFR changes — a different product may
    // warrant a different application method.
    //
    // The OPTION-list clear (drops cached dropdown options) only
    // applies to fields whose options are CN-driven (MFR, TN, F,
    // AI); APPLICATION_METHOD + DOSAGE_UNIT options come from the
    // L2-level fetch and stay valid.
    // Batch 39C-bugfix1 (2026-05-15): MFR and BRAND_NAME (Trade Name)
    // are bidirectional peers under COMMON_NAME — picking one filters
    // the other's options (Batch 24), it does NOT clear the other.
    // The stale-value auto-clear in the TN / MFR refresh effects
    // handles the case where a freshly-picked peer narrows the other
    // out of validity. Previously this map also wiped the peer, which
    // both lost the SE's pick and (because empty values don't get
    // submitted) stopped the cleared field from appearing on the
    // saved Practice in read-only form.
    const cascadeValuesToClear: Record<string, string[]> = {
      COMMON_NAME:      ['MANUFACTURER', 'BRAND_NAME', 'FORMULATION', 'AI_CONCENTRATION', 'APPLICATION_METHOD', 'DOSAGE', 'DOSAGE_UNIT'],
      MANUFACTURER:     ['FORMULATION', 'AI_CONCENTRATION', 'APPLICATION_METHOD', 'DOSAGE', 'DOSAGE_UNIT'],
      BRAND_NAME:       ['FORMULATION', 'AI_CONCENTRATION', 'APPLICATION_METHOD', 'DOSAGE', 'DOSAGE_UNIT'],
      FORMULATION:      ['AI_CONCENTRATION', 'DOSAGE', 'DOSAGE_UNIT'],
      AI_CONCENTRATION: ['DOSAGE', 'DOSAGE_UNIT'],
    }
    // CN-driven options that should drop their cached lists when the
    // parent value clears (so the dropdown shows fresh CN-scope on
    // next pick rather than a stale narrowed set).
    const cnDrivenOptions = ['MANUFACTURER', 'BRAND_NAME', 'FORMULATION', 'AI_CONCENTRATION']

    const valuesToClear = cascadeValuesToClear[fieldName] || []
    setElementValues(prev => {
      const next = { ...prev, [fieldName]: value }
      for (const c of valuesToClear) if (c in next) next[c] = ''
      return next
    })
    if (valuesToClear.length > 0 && !value) {
      setOptionsByField(prev => {
        const next = { ...prev }
        for (const c of cnDrivenOptions) {
          if (valuesToClear.includes(c)) delete next[c]
        }
        return next
      })
    }
  }

  // Helper: source-string → input variant.
  function elementInputVariant(source: string): 'text' | 'textarea' | 'number' | 'media' | 'hyperlink' | 'auto' | 'select' {
    if (source === 'auto_calculated') return 'auto'
    if (source === 'hyperlink') return 'hyperlink'
    if (source.startsWith('media_')) return 'media'
    if (source.startsWith('number_')) return 'number'
    if (source === 'text_area') return 'textarea'
    if (isCoshDropdownSource(source)) return 'select'
    return 'text'
  }

  function coshHint(source: string): string {
    if (source.startsWith('cosh_core:')) return ` (Cosh: ${source.slice(10)})`
    if (source.startsWith('cosh_cascade:')) return ` (Cosh cascade: ${source.slice(13)})`
    return ''
  }

  // ── Media upload helpers (Batch 36, 2026-05-14) ───────────────────────────
  // Per-field upload-in-progress flag so the SE sees a spinner on the
  // exact widget they're acting on. Keyed by L2-spec field.name.
  const [uploadingByField, setUploadingByField] = useState<Record<string, boolean>>({})

  async function uploadMediaFile(fieldName: string, file: File, folder: string): Promise<void> {
    setUploadingByField(s => ({ ...s, [fieldName]: true }))
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('folder', folder)
      const { data } = await api.post<{ url: string; key: string }>('/media/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setElementValue(fieldName, data.url)
    } finally {
      setUploadingByField(s => ({ ...s, [fieldName]: false }))
    }
  }

  // ── Hyperlink preview (Batch 36) ─────────────────────────────────────────
  // Light WhatsApp-style preview: extract a YouTube/Vimeo video ID
  // from a URL and surface the thumbnail + play overlay. Everything
  // else falls back to a domain card. Full Open Graph preview for
  // arbitrary URLs would need a backend proxy and is deferred.
  function previewFromUrl(url: string): { kind: 'youtube' | 'vimeo' | 'generic'; thumb: string | null; host: string } {
    try {
      const u = new URL(url)
      const host = u.hostname.replace(/^www\./, '')
      // YouTube — long form (youtube.com/watch?v=ID, /embed/ID, /shorts/ID) and short form (youtu.be/ID)
      let ytId: string | null = null
      if (host === 'youtu.be') ytId = u.pathname.slice(1).split('/')[0] || null
      else if (host.endsWith('youtube.com')) {
        const v = u.searchParams.get('v')
        if (v) ytId = v
        else {
          const m = u.pathname.match(/^\/(embed|shorts)\/([^/?#]+)/)
          if (m) ytId = m[2]
        }
      }
      if (ytId && /^[A-Za-z0-9_-]{6,15}$/.test(ytId)) {
        return { kind: 'youtube', thumb: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`, host }
      }
      // Vimeo — vimeo.com/<numeric id> path.
      if (host.endsWith('vimeo.com')) {
        const m = u.pathname.match(/^\/(\d{5,})/)
        if (m) {
          // Vimeo's i.vimeocdn.com thumbnails need a per-video lookup
          // we don't proxy yet — fall back to the generic card with
          // the vimeo host so the SE still gets visual confirmation.
          return { kind: 'vimeo', thumb: null, host }
        }
      }
      return { kind: 'generic', thumb: null, host }
    } catch {
      return { kind: 'generic', thumb: null, host: '' }
    }
  }

  function HyperlinkPreview({ url }: { url: string }) {
    if (!url.trim()) return null
    const p = previewFromUrl(url.trim())
    if (p.kind === 'youtube' && p.thumb) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-3 border border-slate-200 rounded-xl overflow-hidden hover:border-blue-400 transition-colors max-w-sm">
          <div className="relative w-32 aspect-video bg-slate-100 shrink-0">
            <img src={p.thumb} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-black/60 flex items-center justify-center">
                <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="py-2 pr-3 min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">YouTube video</p>
            <p className="text-[11px] text-slate-400 truncate">{p.host}</p>
          </div>
        </a>
      )
    }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-blue-400 transition-colors text-xs text-slate-600">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <span className="truncate max-w-[220px]">{p.host || url}</span>
      </a>
    )
  }

  const [showPushModal, setShowPushModal] = useState(false)
  const [pushStatus, setPushStatus] = useState<PushStatusRow[] | null>(null)
  const [pushingClientId, setPushingClientId] = useState<string | null>(null)
  const [pushError, setPushError] = useState('')

  // Edit Package details
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '', duration_days: '120',
    start_date_label_cosh_id: 'label:sowing_date',
    description: '',
    status: 'DRAFT',  // Batch 28: ACTIVE / INACTIVE toggle; DRAFT shown read-only.
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

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
  }, [id])

  const loadPractices = (tlId: string) =>
    api.get<Practice[]>(`/advisory/global/packages/${id}/timelines/${tlId}/practices`)
      .then(r => setPracticeMap(m => ({ ...m, [tlId]: r.data })))

  // Batch 39B: relations live alongside practices on each Timeline. Both
  // are loaded lazily on expand.
  const loadRelations = (tlId: string) =>
    api.get<RelationOut[]>(`/advisory/global/packages/${id}/timelines/${tlId}/relations`)
      .then(r => setRelationsByTimeline(m => ({ ...m, [tlId]: r.data })))
      .catch(() => setRelationsByTimeline(m => ({ ...m, [tlId]: [] })))

  // Batch 39E: Conditional Questions on each Timeline. Loaded lazily.
  const loadConditionalQuestions = (tlId: string) =>
    api.get<CQOut[]>(`/advisory/global/packages/${id}/timelines/${tlId}/conditional-questions`)
      .then(r => setCqsByTimeline(m => ({ ...m, [tlId]: r.data })))
      .catch(() => setCqsByTimeline(m => ({ ...m, [tlId]: [] })))

  const toggle = (tlId: string) => {
    if (expanded === tlId) { setExpanded(null); return }
    setExpanded(tlId)
    if (!practiceMap[tlId]) loadPractices(tlId)
    if (!relationsByTimeline[tlId]) loadRelations(tlId)
    if (!cqsByTimeline[tlId]) loadConditionalQuestions(tlId)
  }

  function openAddCQ(tlId: string) {
    setShowAddCQ(tlId)
    setEditingCQ(null)
    setCqForm({ question_text: '', yes_attachment: '', no_attachment: '' })
    setCqError('')
  }

  // Batch 39G — open the same modal in edit mode pre-filled from the
  // existing CQ row.
  function openEditCQ(tlId: string, cq: CQOut) {
    setShowAddCQ(tlId)
    setEditingCQ({ timelineId: tlId, cqId: cq.id })
    setCqForm({
      question_text: cq.question_text,
      yes_attachment: cq.yes ? `${cq.yes.kind}:${cq.yes.id}` : '',
      no_attachment:  cq.no  ? `${cq.no.kind}:${cq.no.id}`   : '',
    })
    setCqError('')
  }

  // Practices and Relations already bound to ANY CQ on this Timeline
  // — disabled in both pickers so the same entity can't ride two
  // conditionals. Mirrors the backend's `assert_*_can_be_linked` rules.
  // Batch 39G — when editing an existing CQ, this CQ's own bindings are
  // excluded so the SE can rebind to the same entity.
  function attachmentsAlreadyBoundOnTimeline(
    tlId: string, excludeCqId?: string,
  ): Set<string> {
    const out = new Set<string>()
    for (const cq of (cqsByTimeline[tlId] || [])) {
      if (excludeCqId && cq.id === excludeCqId) continue
      for (const side of [cq.yes, cq.no]) {
        if (side) out.add(`${side.kind}:${side.id}`)
      }
    }
    return out
  }

  async function handleSaveCQ(e: FormEvent) {
    e.preventDefault()
    if (!showAddCQ) return
    const tlId = showAddCQ
    if (!cqForm.question_text.trim()) {
      setCqError('Question text is required.')
      return
    }
    if (!cqForm.yes_attachment && !cqForm.no_attachment) {
      setCqError('Attach at least one Practice or Relation to YES or NO.')
      return
    }
    setSavingCQ(true); setCqError('')
    try {
      // Helper: split "kind:id" into a structured attachment, or null.
      const toAttachment = (s: string): { kind: string; id: string } | null => {
        if (!s) return null
        const [kind, attId] = s.split(':')
        return { kind, id: attId }
      }
      if (editingCQ) {
        // Edit mode — atomic PUT replaces everything.
        await api.put(
          `/advisory/global/conditional-questions/${editingCQ.cqId}`,
          {
            question_text: cqForm.question_text.trim(),
            yes: toAttachment(cqForm.yes_attachment),
            no:  toAttachment(cqForm.no_attachment),
          },
        )
      } else {
        // Create mode — POST the CQ, then bind each side via the
        // existing link endpoints.
        const cqResp = await api.post<{ id: string }>(
          `/advisory/global/packages/${id}/timelines/${tlId}/conditional-questions`,
          { question_text: cqForm.question_text.trim(), display_order: (cqsByTimeline[tlId]?.length || 0) },
        )
        const cqId = cqResp.data.id
        const bind = async (attachment: string, answer: 'YES' | 'NO') => {
          if (!attachment) return
          const [kind, attId] = attachment.split(':')
          if (kind === 'relation') {
            await api.post(`/advisory/global/relations/${attId}/conditionals`, {
              practice_id: 'ignored', question_id: cqId, answer,
            })
          } else if (kind === 'practice') {
            await api.post(`/advisory/global/practices/${attId}/conditionals`, {
              practice_id: attId, question_id: cqId, answer,
            })
          }
        }
        await bind(cqForm.yes_attachment, 'YES')
        await bind(cqForm.no_attachment, 'NO')
      }
      await loadConditionalQuestions(tlId)
      setShowAddCQ(null)
      setEditingCQ(null)
    } catch (err: unknown) {
      setCqError(extractErrorMessage(err, 'Failed to save Conditional Question.'))
    } finally { setSavingCQ(false) }
  }

  async function handleDeleteCQ(tlId: string, cqId: string) {
    if (!confirm('Delete this Conditional Question? The Practices/Relations stay; only the gating goes.')) return
    try {
      await api.delete(`/advisory/global/conditional-questions/${cqId}`)
      await loadConditionalQuestions(tlId)
    } catch (err: unknown) {
      alert(extractErrorMessage(err, 'Failed to delete Conditional Question.'))
    }
  }

  function openAddRelation(tlId: string) {
    setShowAddRelation(tlId)
    setChainSlots([])
    setChainOps([])
    setPickingOp(false)
    setListItems([])
    setRelationForm({ expression: '' })
    setRelationError('')
  }

  // ── Batch 39C-rev2: linear chain helpers ──────────────────────────────────

  // Practice label preferred for Relations: L2 + Common Name + Trade
  // Name. Falls back to the L0 token when nothing else is available.
  function humanize(s: string): string {
    return s.toLowerCase().split('_').map(w => (w[0]?.toUpperCase() || '') + w.slice(1)).join(' ')
  }
  function practiceLabel(p: Practice): string {
    const tokens: string[] = []
    if (p.l2_type) tokens.push(humanize(p.l2_type))
    const cn = p.elements?.find(e => e.element_type === 'COMMON_NAME')
    if (cn?.display_value) tokens.push(cn.display_value)
    const bn = p.elements?.find(e => e.element_type === 'BRAND_NAME')
    if (bn?.display_value) tokens.push(bn.display_value)
    return tokens.length > 0 ? tokens.join(' • ') : p.l0_type
  }
  // Batch 39H (2026-05-15) — distinguishing label for the practice
  // row in the Timeline expansion. Each L0 surfaces its most
  // identity-bearing attribute so two practices of the same L2 look
  // different at a glance:
  //   INPUT       → L2 • Common Name • Trade Name (practiceLabel)
  //   INSTRUCTION → L2 • TITLE
  //   MEDIA       → L2 • TITLE
  //   NON_INPUT   → L2 • first non-INSTRUCTIONS element value
  //                 (with adjacent unit appended when the next
  //                 element is a *_UNIT field)
  function practiceShortLabel(p: Practice): string {
    if (!p.l2_type) return 'No sub-type'
    const l2Human = humanize(p.l2_type)
    if (p.l0_type === 'INPUT') return practiceLabel(p)
    if (p.l0_type === 'INSTRUCTION' || p.l0_type === 'MEDIA') {
      const title = p.elements?.find(e => e.element_type === 'TITLE')
      const t = title?.display_value || title?.value
      return t ? `${l2Human} • ${t}` : l2Human
    }
    // NON_INPUT: walk elements in display order; pick the first
    // non-INSTRUCTIONS field that has a value. If the next element
    // is its matching *_UNIT, append it for context.
    const els = p.elements || []
    for (let i = 0; i < els.length; i++) {
      const e = els[i]
      if (e.element_type === 'INSTRUCTIONS') continue
      const v = e.display_value || e.value
      if (!v) continue
      const next = els[i + 1]
      if (next && next.element_type.endsWith('_UNIT')) {
        const u = next.display_value || next.value
        if (u) return `${l2Human} • ${v} ${u}`
      }
      return `${l2Human} • ${v}`
    }
    return l2Human
  }
  function slotDisplay(
    slot: string,
    practices: Practice[],
    items: RelationListItem[],
  ): string {
    if (slot.startsWith('list:')) {
      const id = slot.slice(5)
      const item = items.find(i => i.id === id)
      if (!item) return id
      return `${item.id}: ${renderChainText(item.slots, item.ops, practices, items)}`
    }
    const p = practices.find(x => x.id === slot)
    if (!p) return slot.slice(0, 8)
    return practiceLabel(p)
  }
  function renderChainText(
    slots: string[], ops: ('AND' | 'OR')[],
    practices: Practice[], items: RelationListItem[],
  ): string {
    if (slots.length === 0) return ''
    const parts: string[] = []
    for (let i = 0; i < slots.length; i++) {
      if (i > 0) parts.push(ops[i - 1])
      const slot = slots[i]
      if (slot.startsWith('list:')) {
        const id = slot.slice(5)
        const item = items.find(it => it.id === id)
        if (item) {
          parts.push('(' + renderChainText(item.slots, item.ops, practices, items) + ')')
        } else {
          parts.push(id)
        }
      } else {
        const p = practices.find(x => x.id === slot)
        parts.push(p ? practiceLabel(p) : slot.slice(0, 8))
      }
    }
    return parts.join(' ')
  }

  // Predicates the UI uses to gate actions.
  function chainIsPureOR(): boolean {
    return chainOps.length > 0 && chainOps.every(o => o === 'OR')
  }
  function chainIsPureAND(): boolean {
    return chainOps.length > 0 && chainOps.every(o => o === 'AND')
  }
  function chainIsPure(): boolean {
    return chainIsPureOR() || chainIsPureAND()
  }

  // Batch 39C-checks2 (2026-05-15) — explicit Gate-1 echo at ADD TO
  // LIST / SAVE time. Mirrors _check_and_input_only +
  // _check_or_l1_restriction so the SE sees the same constraint the
  // backend would otherwise raise as a 422 on Save. Returns the
  // human-readable failure reason or null if the chain is valid.
  function gate1Failure(tlId: string): string | null {
    const practices = practiceMap[tlId] || []
    const resolved: Array<{ l0: string; l1: string | null; special: boolean }> = []
    for (const slot of chainSlots) {
      if (slot.startsWith('list:')) {
        const item = listItems.find(i => i.id === slot.slice(5))
        if (!item) continue
        for (const sub of item.slots) {
          if (sub.startsWith('list:')) continue
          const p = practices.find(x => x.id === sub)
          if (p) resolved.push({ l0: p.l0_type, l1: p.l1_type, special: p.is_special_input })
        }
      } else {
        const p = practices.find(x => x.id === slot)
        if (p) resolved.push({ l0: p.l0_type, l1: p.l1_type, special: p.is_special_input })
      }
    }
    for (const r of resolved) {
      if (r.l0 !== 'INPUT') {
        return 'Relations are L0:INPUT only — drop the non-input slot.'
      }
    }
    if (chainIsPureOR()) {
      const l1s = new Set<string>()
      for (const r of resolved) {
        if (r.special) continue
        if (r.l1) l1s.add(r.l1)
      }
      if (l1s.size > 1) {
        return `OR is restricted to a single L1 group (chain spans ${[...l1s].join(', ')}).`
      }
    }
    return null
  }

  // Batch 39C-checks4 (2026-05-15) — list items must be built from raw
  // practices only. Referencing an existing List item inside a chain
  // that's being Added-To-List would effectively duplicate that List
  // item nested inside the new one — the "(A+B) cannot be added to
  // list once again" rule per user 2026-05-15.
  //
  // SAVE is free of this check — compose List items together at SAVE
  // time; the backend's _check_double_brackets is the final word for
  // the saved Relation.
  //
  // Individual practices may still be reused freely across List items
  // (A in L1=A+B and again in L2=A or C is fine — the rule is about
  // List-item references, not practice references).
  function addToListShapeFailure(): string | null {
    const refs: string[] = []
    for (const slot of chainSlots) {
      if (slot.startsWith('list:')) refs.push(slot.slice(5))
    }
    if (refs.length > 0) {
      const list = refs.join(', ')
      return `A List item must be built from practices only. The chain already references ${list} from the List — compose List items together at SAVE time, not inside another List item.`
    }
    return null
  }

  // ADD TO LIST gating: chain must have at least 2 slots AND all ops
  // identical (pure AND or pure OR) AND pass Gate-1 AND not violate
  // the double-bracket rule.
  function canAddToList(tlId: string): boolean {
    if (chainSlots.length < 2) return false
    if (!chainIsPure()) return false
    if (gate1Failure(tlId)) return false
    if (addToListShapeFailure()) return false
    return true
  }
  function addToListBlockedReason(tlId: string): string {
    if (chainSlots.length < 2) return 'Pick at least 2 slots first.'
    if (!chainIsPure()) return 'ADD TO LIST needs a single operator type (all AND or all OR).'
    const f = gate1Failure(tlId)
    if (f) return f
    const s = addToListShapeFailure()
    if (s) return s
    return 'Save the current chain as a reusable List item.'
  }
  // SAVE intentionally trusts the backend for the structural checks
  // (double-brackets, cross-timeline, combinatorial duplicates). The
  // only client-side gate is "the chain has at least two slots" — the
  // SE wants SAVE to attempt and let the backend rule, even on edge
  // shapes ADD TO LIST refuses.
  function canSave(_tlId: string): boolean {
    return chainSlots.length >= 2
  }
  function saveBlockedReason(_tlId: string): string {
    if (chainSlots.length < 2) return 'A Relation needs at least 2 slots.'
    return ''
  }

  // Batch 39C-checks (2026-05-15): the backend's relation_validation
  // module enforces two L0/L1 rules — AND restricted to L0=INPUT, OR
  // restricted to one L1 group (PESTICIDE or FERTILIZER) with Special
  // Inputs floating across both. We mirror them at the slot picker so
  // the SE sees the constraint live instead of catching a 422 on Save.
  //
  // chainAnchorL1s: which L1 groups are currently in the chain
  // (excluding special inputs, which don't anchor anything).
  function chainAnchorL1s(tlId: string): Set<string> {
    const practices = practiceMap[tlId] || []
    const l1s = new Set<string>()
    const collect = (pid: string) => {
      const p = practices.find(x => x.id === pid)
      if (!p || p.is_special_input) return
      if (p.l0_type === 'INPUT' && p.l1_type) l1s.add(p.l1_type)
    }
    for (const slot of chainSlots) {
      if (slot.startsWith('list:')) {
        const item = listItems.find(it => it.id === slot.slice(5))
        if (item) for (const sub of item.slots) {
          if (!sub.startsWith('list:')) collect(sub)
        }
      } else {
        collect(slot)
      }
    }
    return l1s
  }

  // Can the SE pick OR as the next op? OR cross-L1 is forbidden, so
  // once the chain holds practices from both PESTICIDE and FERTILIZER
  // groups, the OR button is disabled. Empty / pure-special chains
  // are always free to pick OR.
  function canPickOR(tlId: string): boolean {
    const anchors = chainAnchorL1s(tlId)
    return !(anchors.has('PESTICIDE') && anchors.has('FERTILIZER'))
  }

  // Slot dropdown options: practices not already in any saved Relation
  // on the timeline, not already used in this chain, AND list items
  // not already referenced in this chain. Each option is annotated with
  // `eligible` + a human `reason` so the dropdown can disable rather
  // than hide — keeps the rule transparent.
  function slotOptions(
    tlId: string,
    isFirstSlot: boolean,
    nextOp: 'AND' | 'OR' | null,
  ): Array<{ value: string; label: string; kind: 'PRACTICE' | 'LIST'; eligible: boolean; reason?: string }> {
    const practices = practiceMap[tlId] || []
    const inOther = practiceIdsInAnyRelation(tlId)
    const usedInChain = new Set(chainSlots)
    const anchors = chainAnchorL1s(tlId)

    // Eligibility for one candidate (practice OR list item).
    const evaluate = (
      candidatePractices: Array<{ l0: string; l1: string | null; special: boolean }>,
    ): { eligible: boolean; reason?: string } => {
      for (const cp of candidatePractices) {
        if (cp.l0 !== 'INPUT') {
          return { eligible: false, reason: 'not L0:INPUT (Relations are input-only)' }
        }
      }
      if (isFirstSlot || nextOp === 'AND') return { eligible: true }
      if (nextOp === 'OR') {
        // No anchor yet (chain is empty or only Special Inputs) — any
        // L1 is still legal under OR. Once an anchor lands, the OR
        // group restricts to that L1 plus Special Inputs.
        if (anchors.size === 0) return { eligible: true }
        for (const cp of candidatePractices) {
          if (cp.special) continue
          if (cp.l1 && !anchors.has(cp.l1)) {
            return {
              eligible: false,
              reason: `OR is locked to ${[...anchors].join('/')} group (or Special Inputs)`,
            }
          }
        }
        return { eligible: true }
      }
      return { eligible: true }
    }

    const out: Array<{ value: string; label: string; kind: 'PRACTICE' | 'LIST'; eligible: boolean; reason?: string }> = []
    for (const p of practices) {
      if (inOther.has(p.id)) continue
      if (usedInChain.has(p.id)) continue
      const { eligible, reason } = evaluate([{ l0: p.l0_type, l1: p.l1_type, special: p.is_special_input }])
      out.push({ value: p.id, label: practiceLabel(p), kind: 'PRACTICE', eligible, reason })
    }
    for (const item of listItems) {
      const key = `list:${item.id}`
      if (usedInChain.has(key)) continue
      const subPractices = item.slots
        .filter(s => !s.startsWith('list:'))
        .map(s => practices.find(x => x.id === s))
        .filter((x): x is Practice => !!x)
        .map(p => ({ l0: p.l0_type, l1: p.l1_type, special: p.is_special_input }))
      const { eligible, reason } = evaluate(subPractices)
      out.push({
        value: key, kind: 'LIST',
        label: `${item.id}: ${renderChainText(item.slots, item.ops, practices, listItems)}`,
        eligible, reason,
      })
    }
    // Ineligible items sink to the bottom so the SE's eyes land on
    // pickable rows first.
    out.sort((a, b) => Number(b.eligible) - Number(a.eligible))
    return out
  }

  function pickSlot(idx: number, value: string) {
    setChainSlots(s => {
      const next = s.slice()
      next[idx] = value
      return next
    })
    setRelationError('')
    setPickingOp(false)
  }
  function appendSlotValue(value: string) {
    setChainSlots(s => [...s, value])
    setRelationError('')
    setPickingOp(false)
  }
  function appendOp(op: 'AND' | 'OR') {
    setChainOps(o => [...o, op])
    setPickingOp(false)
  }
  function clearChain() {
    setChainSlots([])
    setChainOps([])
    setPickingOp(false)
    setRelationError('')
  }
  function backOneSlot() {
    // Remove the last slot and the operator before it (if any).
    setChainSlots(s => s.slice(0, -1))
    setChainOps(o => o.slice(0, -1))
    setPickingOp(false)
  }

  function addCurrentChainToList() {
    if (!showAddRelation) return
    if (!canAddToList(showAddRelation)) {
      setRelationError(addToListBlockedReason(showAddRelation))
      return
    }
    const id = `L${listItems.length + 1}`
    setListItems(items => [...items, { id, slots: chainSlots.slice(), ops: chainOps.slice() }])
    clearChain()
  }

  function deleteListItem(itemId: string) {
    setListItems(items => items.filter(i => i.id !== itemId))
    // Drop any chain slot that referenced this item; trim the op behind it.
    const ref = `list:${itemId}`
    setChainSlots(slots => {
      const next = slots.filter(s => s !== ref)
      return next
    })
    setChainOps(ops => {
      // Recompute ops so they sit between remaining slots — the simplest
      // safe move is to drop all ops and let the SE re-pick. Rare path.
      const before = chainSlots.length
      const dropped = chainSlots.filter(s => s === ref).length
      if (dropped === 0) return ops
      return ops.slice(0, Math.max(0, before - dropped - 1))
    })
  }

  // ── Save-time resolver: chain + listItems → backend parts shape ────────────
  //
  // Resolution rules (all-OR / all-AND chains; for mixed chains we
  // surface as relation_type=OR with AND-tighter precedence — same
  // standard precedence used in algebra).
  //
  //   Pure OR chain of N slots → relation_type=OR. One Part. Each slot
  //   contributes its own Option(s); list refs to OR-lists merge in
  //   flat; list refs to AND-lists contribute as one compound Option.
  //
  //   Pure AND chain → relation_type=AND. If no list ref points at an
  //   OR-list, the whole thing is one Part with one compound Option of
  //   all positions. If any list ref is an OR-list, each OR-list ref
  //   becomes its own Part (multi-Part AND); practice slots and any
  //   AND-list ref positions collapse into one compound Part.
  //
  //   Mixed chain → split into AND-segments around OR ops (AND tighter).
  //   Each AND-segment becomes an Option; segments OR'd as Options in
  //   one Part. relation_type=OR.

  function resolveListItemKind(item: RelationListItem): 'AND' | 'OR' {
    if (item.ops.every(o => o === 'AND')) return 'AND'
    return 'OR'  // by ADD TO LIST gating, only pure chains land in the list
  }

  function expandSlotForOR(
    slot: string, items: RelationListItem[],
  ): { kind: 'options'; options: string[][] } {
    if (slot.startsWith('list:')) {
      const item = items.find(i => i.id === slot.slice(5))
      if (item) {
        const k = resolveListItemKind(item)
        if (k === 'AND') return { kind: 'options', options: [item.slots.slice()] }
        return { kind: 'options', options: item.slots.map(s => [s]) }
      }
    }
    return { kind: 'options', options: [[slot]] }
  }

  function resolveChain(
    slots: string[], ops: ('AND' | 'OR')[], items: RelationListItem[],
  ): { relation_type: 'AND' | 'OR'; parts: string[][][] } {
    const allOR = ops.length > 0 && ops.every(o => o === 'OR')
    const allAND = ops.length > 0 && ops.every(o => o === 'AND')

    if (allOR) {
      const options: string[][] = []
      for (const slot of slots) {
        const exp = expandSlotForOR(slot, items)
        for (const opt of exp.options) options.push(opt)
      }
      return { relation_type: 'OR', parts: [options] }
    }

    if (allAND) {
      const parts: string[][][] = []
      let pending: string[] = []
      for (const slot of slots) {
        if (slot.startsWith('list:')) {
          const item = items.find(i => i.id === slot.slice(5))
          if (item) {
            if (resolveListItemKind(item) === 'OR') {
              if (pending.length > 0) {
                parts.push([pending])
                pending = []
              }
              parts.push(item.slots.map(s => [s]))
              continue
            }
            pending.push(...item.slots)
            continue
          }
        }
        pending.push(slot)
      }
      if (pending.length > 0) parts.push([pending])
      if (parts.length === 1) return { relation_type: 'AND', parts }
      return { relation_type: 'AND', parts }
    }

    // Mixed chain — AND-tighter precedence. Split on OR.
    const orSegments: string[][] = []  // each is a list of slot values
    let cur: string[] = [slots[0]]
    for (let i = 0; i < ops.length; i++) {
      if (ops[i] === 'AND') cur.push(slots[i + 1])
      else { orSegments.push(cur); cur = [slots[i + 1]] }
    }
    orSegments.push(cur)
    // Each AND-segment becomes one Option (compound if size > 1).
    // List refs within an AND-segment are flattened (AND-list positions
    // appended; OR-list refs in mixed segments aren't supported here —
    // surface an error if they show up).
    const options: string[][] = []
    for (const seg of orSegments) {
      const positions: string[] = []
      for (const slot of seg) {
        if (slot.startsWith('list:')) {
          const item = items.find(i => i.id === slot.slice(5))
          if (item) {
            if (resolveListItemKind(item) === 'OR') {
              throw new Error(
                `Mixed chain references list item ${item.id} (OR-group) inside an AND-segment. ` +
                `Add the OR-group as a separate List item and rebuild — or split into two saves.`,
              )
            }
            positions.push(...item.slots)
            continue
          }
        }
        positions.push(slot)
      }
      options.push(positions)
    }
    return { relation_type: 'OR', parts: [options] }
  }

  async function handleSaveRelation(e: FormEvent) {
    e.preventDefault()
    if (!showAddRelation) return
    if (!canSave(showAddRelation)) {
      setRelationError(saveBlockedReason(showAddRelation) || 'A Relation needs at least 2 slots.')
      return
    }
    setSavingRelation(true); setRelationError('')
    const tlId = showAddRelation
    const practices = practiceMap[tlId] || []
    let resolved: { relation_type: 'AND' | 'OR'; parts: string[][][] }
    try {
      resolved = resolveChain(chainSlots, chainOps, listItems)
    } catch (err) {
      setRelationError(err instanceof Error ? err.message : 'Failed to resolve chain.')
      setSavingRelation(false)
      return
    }
    const expression = relationForm.expression.trim() ||
      renderChainText(chainSlots, chainOps, practices, listItems)
    try {
      await api.post(
        `/advisory/global/packages/${id}/timelines/${tlId}/relations`,
        { relation_type: resolved.relation_type, parts: resolved.parts, expression },
      )
      await loadRelations(tlId)
      setShowAddRelation(null)
    } catch (err: unknown) {
      setRelationError(extractErrorMessage(err, 'Failed to save Relation.'))
    } finally { setSavingRelation(false) }
  }

  async function handleDeleteRelation(tlId: string, relId: string) {
    if (!confirm('Delete this Relation? The practices stay; only the grouping is removed.')) return
    try {
      await api.delete(`/advisory/global/relations/${relId}`)
      await loadRelations(tlId)
    } catch (err: unknown) {
      alert(extractErrorMessage(err, 'Failed to delete Relation.'))
    }
  }

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
    try {
      const { data } = await api.post<Package>(`/advisory/global/packages/${id}/publish`)
      setPkg(data)
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
    // Batch 33: open the Add Practice modal in edit mode. We seed
    // practiceForm from p; the L2-fetch effect (which fires when
    // practiceForm.l2_type lands a new value) then seeds elementValues
    // from p.elements (see the existing .then callback).
    setEditingPractice({ timelineId, practice: p })
    setPracticeError('')
    setPracticeForm({
      l0_type: p.l0_type,
      l1_type: p.l1_type || '',
      l2_type: p.l2_type || '',
      display_order: String(p.display_order),
      is_special_input: p.is_special_input,
      is_brand_locked: !!p.is_brand_locked,
    })
    setShowAddPractice(timelineId)
  }

  async function handleAddPractice(e: FormEvent) {
    e.preventDefault()
    if (!showAddPractice) return
    setAddingPractice(true); setPracticeError('')

    // Pack only the fields the user actually filled in. The
    // validator treats absent fields as unprovided, so we don't
    // send empty rows (would surface as UNKNOWN_FIELD otherwise).
    // auto_calculated + media_* fields are skipped on the form
    // already; nothing to send for them here. Dropdown-sourced
    // (cosh_core/cosh_cascade) fields send `cosh_ref`; free-text
    // fields send `value`.
    const elements: { element_type: string; value?: string; cosh_ref?: string; unit_cosh_id?: string }[] = []
    for (const field of l2Spec) {
      const variant = elementInputVariant(field.source)
      if (variant === 'auto') continue
      const raw = elementValues[field.name]
      if (raw === undefined || raw.trim() === '') continue
      if (variant === 'select') {
        elements.push({ element_type: field.name, cosh_ref: raw.trim() })
      } else {
        // text / textarea / number / media / hyperlink — all carry
        // their string value (media stores the S3 URL returned by
        // /media/upload; hyperlink stores the URL the SE pasted).
        elements.push({ element_type: field.name, value: raw.trim() })
      }
    }

    // Batch 34: derive frequency_days from the L2's interval field
    // (FERTIGATION_INTERVAL / IRRIGATION_INTERVAL / REPEAT_INTERVAL).
    // Validator checks Practice.frequency_days matches the interval
    // element value, so we send both atomically.
    let frequency_days: number | null = null
    const intervalField = l2Spec.find(f => f.name.endsWith('_INTERVAL') && f.source === 'number_2dec')
    if (intervalField) {
      const raw = elementValues[intervalField.name]
      const parsed = raw ? parseInt(raw, 10) : NaN
      if (!Number.isNaN(parsed)) frequency_days = parsed
    }

    // Batch 39I-a — only send is_brand_locked=true when a BRAND_NAME
    // element is actually included. Defensive: backend rejects the
    // mismatch with brand_lock_requires_brand_name, but clearing
    // client-side avoids the round-trip in the common case.
    const hasBrandElement = elements.some(
      el => el.element_type === 'BRAND_NAME' && (el.cosh_ref || '').trim(),
    )
    const body = {
      l0_type: practiceForm.l0_type,
      l1_type: practiceForm.l1_type || null,
      l2_type: practiceForm.l2_type || null,
      display_order: parseInt(practiceForm.display_order),
      is_special_input: practiceForm.is_special_input,
      is_brand_locked: practiceForm.is_brand_locked && hasBrandElement,
      frequency_days,
      elements,
    }

    try {
      if (editingPractice) {
        await api.put(
          `/advisory/global/packages/${id}/timelines/${editingPractice.timelineId}/practices/${editingPractice.practice.id}`,
          body,
        )
      } else {
        await api.post(
          `/advisory/global/packages/${id}/timelines/${showAddPractice}/practices`,
          body,
        )
      }
      const tlId = showAddPractice  // capture before reset
      setShowAddPractice(null)
      setEditingPractice(null)
      setPracticeForm({ l0_type: 'INPUT', l1_type: '', l2_type: '', display_order: '0', is_special_input: false, is_brand_locked: false })
      setL2Spec([]); setElementValues({})
      loadPractices(tlId)
    } catch (err: unknown) {
      setPracticeError(extractErrorMessage(err, editingPractice ? 'Failed to update practice.' : 'Failed to add practice.'))
    } finally { setAddingPractice(false) }
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

  const START_DATE_LABELS = [
    { cosh_id: 'label:sowing_date',   name: 'Sowing Date' },
    { cosh_id: 'label:planting_date', name: 'Planting Date' },
    { cosh_id: 'label:pruning_date',  name: 'Pruning Date' },
  ]

  function openEdit() {
    if (!pkg) return
    setEditForm({
      name: pkg.name,
      duration_days: String(pkg.duration_days),
      start_date_label_cosh_id: pkg.start_date_label_cosh_id || 'label:sowing_date',
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

  async function handlePushToClient(clientId: string) {
    setPushingClientId(clientId)
    setPushError('')
    try {
      await api.post(`/client/${clientId}/packages/${id}/push`)
      await loadPushStatus()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string | { code?: string; message?: string } } } })?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : detail?.message
      setPushError(msg || 'Push failed.')
    } finally { setPushingClientId(null) }
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

  if (!pkg) return <AdminLayout><div className="pt-20 text-center text-slate-400">Loading…</div></AdminLayout>

  return (
    <AdminLayout>
      <div className="max-w-4xl space-y-6">
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
              <button onClick={handlePublish} disabled={publishing}
                className="bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
                {publishing ? 'Publishing…' : '✓ Publish'}
              </button>
            )}
            <Link href={`/advisory/global/${id}/preview`}
              className="border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 text-center">
              👁 Preview
            </Link>
            <button
              onClick={openEdit}
              className="border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50">
              ✎ Edit details
            </button>
            <button
              onClick={() => { setShowSignature(true); setPvSaveError('') }}
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
            <button onClick={openAddTimeline}
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
                    <button onClick={e => { e.stopPropagation(); openEditTimeline(tl) }}
                      className="text-slate-300 hover:text-blue-500 p-1" title="Edit timeline">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDeleteTL(tl) }} className="text-slate-300 hover:text-red-400 p-1" title="Delete timeline">
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
                                  <button onClick={e => { e.stopPropagation(); openEditPractice(tl.id, p) }}
                                    className="text-slate-300 hover:text-blue-500 p-1" title="Edit practice">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); handleDeletePractice(tl.id, p.id) }}
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
                                              <HyperlinkPreview url={url} />
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
                      <button onClick={() => setShowAddPractice(tl.id)} className="text-xs font-medium text-blue-600 mt-2 hover:underline">
                        + Add Practice
                      </button>

                      {/* Batch 39B — Relations on this Timeline. Pure
                          AND and pure OR are authorable here; mixed
                          AND-OR (Batch 39C) and IF (Batch 39D) will
                          extend the modal. */}
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Relations</h4>
                          <button onClick={() => openAddRelation(tl.id)}
                            className="text-xs font-medium text-blue-600 hover:underline">
                            + Add Relation
                          </button>
                        </div>
                        {!relationsByTimeline[tl.id] || relationsByTimeline[tl.id].length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No Relations on this Timeline yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {relationsByTimeline[tl.id].map(rel => {
                              // Batch 39C-rev2: bracketed walker + L2 / Common Name / Trade Name labels.
                              // parts × options × positions → "(A+B) or (C) or (D) + ..."
                              const labelFor = (pid: string): string => {
                                const p = (practiceMap[tl.id] || []).find(x => x.id === pid)
                                if (!p) return pid.slice(0, 8)
                                return practiceLabel(p)
                              }
                              const renderParts = (): string => {
                                const partTexts: string[] = []
                                for (const part of rel.parts) {
                                  const optTexts: string[] = []
                                  for (const opt of part) {
                                    if (opt.length === 0) continue
                                    if (opt.length === 1) optTexts.push(labelFor(opt[0]))
                                    else optTexts.push('(' + opt.map(labelFor).join(' + ') + ')')
                                  }
                                  if (optTexts.length === 0) continue
                                  partTexts.push(optTexts.length === 1 ? optTexts[0] : optTexts.join(' or '))
                                }
                                const outer = rel.relation_type === 'OR' ? ' or ' : ' + '
                                return partTexts.join(outer)
                              }
                              const text = rel.expression || renderParts()
                              const typeColour = rel.relation_type === 'AND'
                                ? 'bg-blue-100 text-blue-700'
                                : rel.relation_type === 'OR'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-purple-100 text-purple-700'
                              return (
                                <div key={rel.id} className="flex items-start gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${typeColour} shrink-0`}>
                                    {rel.relation_type}
                                  </span>
                                  <span className="text-slate-700 flex-1 min-w-0 break-words">{text}</span>
                                  <button onClick={() => handleDeleteRelation(tl.id, rel.id)}
                                    className="text-slate-300 hover:text-red-500 shrink-0"
                                    title="Delete Relation">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Batch 39E — Conditional Questions on this Timeline.
                          Each CQ gates a Practice or Relation on YES / NO
                          (Paths A + B). */}
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Conditional Questions</h4>
                          <button onClick={() => openAddCQ(tl.id)}
                            className="text-xs font-medium text-blue-600 hover:underline">
                            + Add Conditional Question
                          </button>
                        </div>
                        {!cqsByTimeline[tl.id] || cqsByTimeline[tl.id].length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No Conditional Questions on this Timeline yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {cqsByTimeline[tl.id].map(cq => {
                              const practices = practiceMap[tl.id] || []
                              const relations = relationsByTimeline[tl.id] || []
                              const labelForAttachment = (att: CQAttachment | null): string => {
                                if (!att) return '—'
                                if (att.kind === 'practice') {
                                  const p = practices.find(x => x.id === att.id)
                                  return p ? practiceLabel(p) : att.id.slice(0, 8)
                                }
                                const r = relations.find(x => x.id === att.id)
                                return r?.expression || `Relation ${att.id.slice(0, 8)}`
                              }
                              return (
                                <div key={cq.id} className="bg-purple-50/30 border border-purple-100 rounded-lg px-3 py-2">
                                  <div className="flex items-start gap-2">
                                    <span className="text-[10px] uppercase tracking-wider text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded font-semibold shrink-0">IF</span>
                                    <p className="text-xs font-medium text-slate-800 flex-1 min-w-0 break-words">{cq.question_text}</p>
                                    <button onClick={() => openEditCQ(tl.id, cq)}
                                      className="text-slate-300 hover:text-blue-500 shrink-0"
                                      title="Edit Conditional Question">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button onClick={() => handleDeleteCQ(tl.id, cq.id)}
                                      className="text-slate-300 hover:text-red-500 shrink-0"
                                      title="Delete Conditional Question">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                  <div className="mt-1.5 ml-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
                                    <div className="flex items-start gap-2 text-[11px]">
                                      <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${cq.yes ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>YES</span>
                                      <span className={`min-w-0 break-words ${cq.yes ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                                        {cq.yes ? `${cq.yes.kind === 'practice' ? 'Practice' : 'Relation'}: ${labelForAttachment(cq.yes)}` : '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-start gap-2 text-[11px]">
                                      <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${cq.no ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-400'}`}>NO</span>
                                      <span className={`min-w-0 break-words ${cq.no ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                                        {cq.no ? `${cq.no.kind === 'practice' ? 'Practice' : 'Relation'}: ${labelForAttachment(cq.no)}` : '—'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Timeline Modal */}
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
        {showAddPractice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">
                  {editingPractice ? 'Edit Practice' : 'Add Practice'}
                </h2>
                {/* Batch 35 — surface the timeline + package context the
                    SE is authoring against. Annual packages show the
                    reference type (DAS/DBS) so the SE knows whether
                    Day numbers are from sowing or before sowing;
                    Perennial timelines show the calendar window. */}
                {(() => {
                  const tl = timelines.find(t => t.id === showAddPractice)
                  if (!pkg || !tl) return null
                  const isPerennial = pkg.package_type === 'PERENNIAL'
                  const pkgLabel = isPerennial ? 'Perennial' : 'Annual'
                  const refLabel = tl.from_type === 'CALENDAR' ? 'Calendar'
                    : tl.from_type === 'DAS' ? 'DAS (days after sowing)'
                      : tl.from_type === 'DBS' ? 'DBS (days before sowing)'
                        : tl.from_type
                  const duration = Math.abs(tl.to_value - tl.from_value)
                  const range = formatTimelineRange(tl)
                  return (
                    <p className="text-xs text-slate-500 mt-1">
                      {pkgLabel} · <span className="font-medium text-slate-700">{tl.name}</span> · {refLabel} · {range}
                      {tl.from_type !== 'CALENDAR' && (
                        <> <span className="text-slate-400">({duration} day{duration === 1 ? '' : 's'})</span></>
                      )}
                    </p>
                  )
                })()}
              </div>
              <form onSubmit={handleAddPractice} className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type (L0)</label>
                  <select value={practiceForm.l0_type}
                    onChange={e => setPracticeForm(f => ({
                      ...f, l0_type: e.target.value,
                      // Reset L1/L2 when L0 changes — the cascades start fresh.
                      l1_type: '', l2_type: '',
                    }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {taxonomy.length > 0
                      ? taxonomy.map(l0 => <option key={l0.id} value={l0.id}>{l0.label}</option>)
                      : <option value="INPUT">INPUT</option>}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">L1 (category)</label>
                    <select value={practiceForm.l1_type}
                      onChange={e => setPracticeForm(f => ({
                        ...f, l1_type: e.target.value, l2_type: '',
                      }))}
                      disabled={!currentL0}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:text-slate-400">
                      <option value="">— Select category —</option>
                      {currentL0?.l1.map(l1 => (
                        <option key={l1.id} value={l1.id}>{l1.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">L2 (specific)</label>
                    <select value={practiceForm.l2_type}
                      onChange={e => setPracticeForm(f => ({
                        ...f, l2_type: e.target.value,
                        // Reset is_special_input when L2 changes; the
                        // new L2 may not even surface the checkbox.
                        is_special_input: false,
                      }))}
                      disabled={!currentL1}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:text-slate-400">
                      <option value="">— Select specific —</option>
                      {currentL1?.l2.map(l2 => (
                        <option key={l2.id} value={l2.id}>{l2.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Element form — driven by /practice-taxonomy/elements/{l2}.
                    Renders only when an L2 is selected. Cosh-backed dropdowns
                    fire against /cosh/options/*; parents drive children via
                    cascade_from. Slugs Cosh hasn't shipped yet (planting_material,
                    itk_name, maturity_index, …) fall back to free text. */}
                {practiceForm.l2_type && l2Spec.length > 0 && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-800">Elements</h3>
                    {l2Spec.map(field => {
                      const variant = elementInputVariant(field.source)
                      if (variant === 'auto') {
                        // Batch 34: NUMBER_OF_APPLICATIONS is auto but
                        // computed client-side from the interval + the
                        // active timeline's from/to so the SE sees the
                        // count update live as they type the interval.
                        // Backend recomputes server-side and gates
                        // submit at N < 2.
                        if (field.name === 'NUMBER_OF_APPLICATIONS') {
                          const tl = timelines.find(t => t.id === showAddPractice)
                          const intervalF = l2Spec.find(f => f.name.endsWith('_INTERVAL') && f.source === 'number_2dec')
                          const rawInterval = intervalF ? (elementValues[intervalF.name] || '') : ''
                          const interval = rawInterval ? parseInt(rawInterval, 10) : NaN
                          let n: number | null = null
                          if (tl && !Number.isNaN(interval) && interval > 0) {
                            const duration = Math.abs(tl.to_value - tl.from_value)
                            if (duration >= 1) n = Math.floor((duration - 1) / interval) + 1
                          }
                          return (
                            <div key={field.name}>
                              <label className="block text-xs font-medium text-slate-700 mb-1">{field.label}</label>
                              <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700">
                                {n === null
                                  ? <span className="text-slate-400 italic">set the interval above to see the count</span>
                                  : <>{n} application{n === 1 ? '' : 's'} <span className="text-slate-400">(first on Day {(timelines.find(t => t.id === showAddPractice)?.from_value || 0) + 1}, then every {interval} day{interval === 1 ? '' : 's'})</span></>}
                              </div>
                              {n !== null && n < 2 && (
                                <p className="text-[11px] text-red-600 mt-1">
                                  Interval too long for this timeline — frequency practices repeat at least twice. Shorten the interval or extend the timeline window.
                                </p>
                              )}
                            </div>
                          )
                        }
                        return (
                          <div key={field.name} className="text-xs text-slate-400 italic">
                            {field.label} — auto-calculated server-side
                          </div>
                        )
                      }
                      if (variant === 'media') {
                        // Batch 36: real upload widget. media_image →
                        // image picker + thumbnail preview; media_audio →
                        // audio picker + <audio> player. Selected file
                        // posts to /media/upload; the returned S3 URL
                        // becomes the element's stored value.
                        const isImage = field.source === 'media_image'
                        const accept = isImage ? 'image/*' : 'audio/*'
                        const folder = isImage ? 'advisory/images' : 'advisory/audio'
                        const url = (elementValues[field.name] || '').trim()
                        const uploading = !!uploadingByField[field.name]
                        return (
                          <div key={field.name}>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              {field.label}
                              {field.mandatory && <span className="text-red-500 ml-0.5">*</span>}
                            </label>
                            {url ? (
                              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                                {isImage ? (
                                  <img src={url} alt="" className="max-h-40 rounded" />
                                ) : (
                                  // eslint-disable-next-line jsx-a11y/media-has-caption
                                  <audio controls src={url} className="w-full" />
                                )}
                                <div className="flex items-center justify-between">
                                  <a href={url} target="_blank" rel="noopener noreferrer"
                                    className="text-[11px] text-slate-400 truncate max-w-[260px]">{url}</a>
                                  <button type="button"
                                    onClick={() => setElementValue(field.name, '')}
                                    className="text-[11px] text-red-500 hover:underline">Replace</button>
                                </div>
                              </div>
                            ) : (
                              <label className={`flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-3 text-xs cursor-pointer hover:border-blue-400 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9 5.5 5.5 0 0110.78 0A4 4 0 0117 16M9 12l3-3m0 0l3 3m-3-3v12" />
                                </svg>
                                <span className="text-slate-600">
                                  {uploading
                                    ? 'Uploading…'
                                    : isImage ? 'Choose an image (JPEG/PNG/WebP/GIF · up to 25 MB)'
                                      : 'Choose an audio file (MP3/AAC/OGG/WAV/WebM · up to 25 MB)'}
                                </span>
                                <input type="file" accept={accept} className="hidden"
                                  onChange={async e => {
                                    const f = e.target.files?.[0]
                                    if (!f) return
                                    try { await uploadMediaFile(field.name, f, folder) }
                                    catch (err) {
                                      setPracticeError(extractErrorMessage(err, 'Upload failed.'))
                                    }
                                    e.target.value = ''
                                  }} />
                              </label>
                            )}
                          </div>
                        )
                      }
                      const labelText = (
                        <>
                          {field.label}
                          {field.mandatory && <span className="text-red-500 ml-0.5">*</span>}
                          <span className="text-[11px] text-slate-400 font-normal">{coshHint(field.source)}</span>
                        </>
                      )
                      const onChange = (v: string) => setElementValue(field.name, v)
                      if (variant === 'hyperlink') {
                        // Batch 36: URL input + WhatsApp-style preview
                        // for YouTube (thumbnail + play overlay), generic
                        // domain card otherwise. The help text steers
                        // SEs toward this path for large video files
                        // they can't upload directly.
                        const url = elementValues[field.name] || ''
                        return (
                          <div key={field.name}>
                            <label className="block text-xs font-medium text-slate-700 mb-1">{labelText}</label>
                            <input type="url" placeholder="https://…"
                              value={url}
                              onChange={e => onChange(e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <p className="text-[11px] text-slate-500 mt-1">
                              For long videos, upload to YouTube, Google Drive, or similar and paste the link here. YouTube links get a thumbnail preview.
                            </p>
                            <HyperlinkPreview url={url} />
                          </div>
                        )
                      }
                      if (variant === 'select') {
                        const opts = optionsByField[field.name]
                        const parentBlocker = field.cascade_from.find(p => !(elementValues[p] || '').trim())
                        const disabled = !!parentBlocker
                        const placeholder = parentBlocker
                          ? `— select ${parentBlocker.toLowerCase().replace(/_/g, ' ')} first —`
                          : opts === undefined ? '— loading… —'
                            : opts.length === 0 ? '— no options for this L2 —'
                              : '— select —'
                        return (
                          <div key={field.name}>
                            <label className="block text-xs font-medium text-slate-700 mb-1">{labelText}</label>
                            <select value={elementValues[field.name] || ''}
                              disabled={disabled}
                              onChange={e => onChange(e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400">
                              <option value="">{placeholder}</option>
                              {(opts || []).map(o => (
                                <option key={o.cosh_id} value={o.cosh_id}>{o.name}</option>
                              ))}
                            </select>
                          </div>
                        )
                      }
                      if (variant === 'textarea') {
                        return (
                          <div key={field.name}>
                            <label className="block text-xs font-medium text-slate-700 mb-1">{labelText}</label>
                            <textarea value={elementValues[field.name] || ''}
                              onChange={e => onChange(e.target.value)}
                              rows={2}
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                          </div>
                        )
                      }
                      return (
                        <div key={field.name}>
                          <label className="block text-xs font-medium text-slate-700 mb-1">{labelText}</label>
                          <input
                            type={variant === 'number' ? 'number' : 'text'}
                            step={field.source === 'number_4dec' ? '0.0001' : field.source === 'number_2dec' ? '0.01' : undefined}
                            value={elementValues[field.name] || ''}
                            onChange={e => onChange(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      )
                    })}
                  </div>
                )}

                {l2Meta.is_special_input && (
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                    <input type="checkbox" checked={practiceForm.is_special_input}
                      onChange={e => setPracticeForm(f => ({ ...f, is_special_input: e.target.checked }))}
                      className="w-4 h-4 rounded" />
                    Special input (adjuvant — never suppressed by BL-03)
                  </label>
                )}
                {/* Batch 39I-a — Lock Brand. Disabled until BRAND_NAME
                    has a value; auto-clears if the SE wipes the brand.
                    Only renders for L2s that carry a BRAND_NAME field
                    (i.e. the input brand cascade is in the rule book). */}
                {l2Spec.some(f => f.name === 'BRAND_NAME') && (() => {
                  const hasBrand = !!(elementValues['BRAND_NAME'] || '').trim()
                  const lockChecked = hasBrand && practiceForm.is_brand_locked
                  // Auto-uncheck if BRAND_NAME just cleared.
                  if (!hasBrand && practiceForm.is_brand_locked) {
                    queueMicrotask(() => setPracticeForm(f => ({ ...f, is_brand_locked: false })))
                  }
                  return (
                    <label className={`flex items-center gap-2 text-sm ${hasBrand ? 'cursor-pointer text-slate-700' : 'cursor-not-allowed text-slate-400'}`}>
                      <input type="checkbox"
                        checked={lockChecked}
                        disabled={!hasBrand}
                        onChange={e => setPracticeForm(f => ({ ...f, is_brand_locked: e.target.checked }))}
                        className="w-4 h-4 rounded" />
                      Lock Brand
                      {hasBrand ? (
                        <span className="text-[11px] text-slate-400">— locks this Trade Name; orders route to the company's onboarded dealers only</span>
                      ) : (
                        <span className="text-[11px] text-slate-400">— pick a Trade Name first to enable</span>
                      )}
                    </label>
                  )
                })()}
                {practiceError && <p className="text-sm text-red-600">{practiceError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddPractice(null); setEditingPractice(null); setPracticeError('') }}
                    className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                  <button type="submit"
                    disabled={addingPractice || !practiceForm.l1_type || !practiceForm.l2_type}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {addingPractice
                      ? (editingPractice ? 'Saving…' : 'Adding…')
                      : (editingPractice ? 'Save Changes' : 'Add Practice')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
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
                    {START_DATE_LABELS.map(l => (
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
                  <input type="number" min="1" value={editForm.duration_days}
                    disabled={pkg.package_type === 'PERENNIAL'}
                    onChange={e => setEditForm(f => ({ ...f, duration_days: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400" />
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
        {showAddCQ && (() => {
          const tlId = showAddCQ
          const tl = timelines.find(t => t.id === tlId)
          const practices = practiceMap[tlId] || []
          const relations = relationsByTimeline[tlId] || []
          const alreadyBound = attachmentsAlreadyBoundOnTimeline(
            tlId, editingCQ?.cqId,
          )
          // Practices already in a Relation are handled via their
          // Relation's binding — we hide them from the per-Practice
          // dropdown to avoid double-attachment confusion.
          const pidsInAnyRelation = practiceIdsInAnyRelation(tlId)
          type Opt = { value: string; label: string; kind: 'practice' | 'relation'; disabled: boolean; reason?: string }
          const buildOpts = (otherPick: string): Opt[] => {
            const out: Opt[] = []
            for (const p of practices) {
              if (pidsInAnyRelation.has(p.id)) continue
              const value = `practice:${p.id}`
              const inOtherCQ = alreadyBound.has(value)
              const inThisSide = otherPick === value
              out.push({
                value, label: practiceLabel(p), kind: 'practice',
                disabled: inOtherCQ || inThisSide,
                reason: inOtherCQ ? 'bound to another CQ' : inThisSide ? 'picked on the other side' : undefined,
              })
            }
            for (const r of relations) {
              const value = `relation:${r.id}`
              const inOtherCQ = alreadyBound.has(value)
              const inThisSide = otherPick === value
              out.push({
                value, label: r.expression || `Relation ${r.id.slice(0, 8)}`, kind: 'relation',
                disabled: inOtherCQ || inThisSide,
                reason: inOtherCQ ? 'bound to another CQ' : inThisSide ? 'picked on the other side' : undefined,
              })
            }
            return out
          }
          const yesOpts = buildOpts(cqForm.no_attachment)
          const noOpts  = buildOpts(cqForm.yes_attachment)
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
                <div className="p-6 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900">
                    {editingCQ ? 'Edit Conditional Question' : 'Add Conditional Question'}
                  </h2>
                  {tl && (
                    <p className="text-xs text-slate-500 mt-1">
                      Timeline: <span className="font-medium text-slate-700">{tl.name}</span>
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    The farmer answers YES or NO. Attach a Practice or Relation to either side —
                    the attached entity only fires when the farmer's answer matches.
                  </p>
                </div>
                <form onSubmit={handleSaveCQ} className="overflow-y-auto p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Question</label>
                    <textarea
                      value={cqForm.question_text}
                      onChange={e => setCqForm(f => ({ ...f, question_text: e.target.value }))}
                      rows={2}
                      placeholder="e.g. Has it rained in the last 2 days?"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(['yes', 'no'] as const).map(side => {
                      const opts = side === 'yes' ? yesOpts : noOpts
                      const value = side === 'yes' ? cqForm.yes_attachment : cqForm.no_attachment
                      const setValue = (v: string) => setCqForm(f => side === 'yes'
                        ? { ...f, yes_attachment: v } : { ...f, no_attachment: v })
                      const colour = side === 'yes' ? 'emerald' : 'rose'
                      return (
                        <div key={side}>
                          <label className={`inline-block text-[10px] uppercase tracking-wider font-semibold rounded px-2 py-0.5 mb-2 ${
                            side === 'yes' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {side.toUpperCase()} — when farmer answers {side.toUpperCase()}
                          </label>
                          <select value={value}
                            onChange={e => setValue(e.target.value)}
                            className={`w-full border border-${colour}-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-${colour}-500`}>
                            <option value="">— nothing attached —</option>
                            {opts.length === 0 ? (
                              <option disabled>No eligible Practice or Relation yet</option>
                            ) : opts.map(o => (
                              <option key={o.value} value={o.value} disabled={o.disabled}>
                                {o.kind === 'practice' ? 'Practice: ' : 'Relation: '}
                                {o.label}
                                {o.reason ? ` — ${o.reason}` : ''}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Pick a Practice (Path B) or a Relation (Path A). Empty side = nothing fires
                            when the answer is {side.toUpperCase()}.
                          </p>
                        </div>
                      )
                    })}
                  </div>

                  {cqError && <p className="text-sm text-red-600">{cqError}</p>}

                  <div className="flex gap-3 pt-2">
                    <button type="button"
                      onClick={() => { setShowAddCQ(null); setEditingCQ(null); setCqError('') }}
                      className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">
                      Cancel
                    </button>
                    <button type="submit"
                      disabled={savingCQ || !cqForm.question_text.trim() ||
                                (!cqForm.yes_attachment && !cqForm.no_attachment)}
                      className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                      {savingCQ
                        ? 'Saving…'
                        : editingCQ ? 'Save Changes' : 'Save Conditional Question'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )
        })()}

        {/* Add Relation Modal — Batch 39C-rev2 (2026-05-15). Linear
            chain builder: dropdown slots joined by AND / OR ops; ADD TO
            LIST stores a sub-expression for reuse, SAVE composes the
            current chain and POSTs. */}
        {showAddRelation && (() => {
          const tlId = showAddRelation
          const tl = timelines.find(t => t.id === tlId)
          const practices = practiceMap[tlId] || []
          const liveExpression = renderChainText(chainSlots, chainOps, practices, listItems)
          // Where the chain is in its state machine:
          //   atSlotStateNeedFirst → no slots yet; show first slot dropdown
          //   atSlotStateNeedNext  → op was just picked; show next slot dropdown
          //   atSlotStateAtSlot    → just picked a slot; show + / ADD / SAVE
          //   atSlotStateAtOp      → SE clicked + ; show AND / OR buttons
          const slotsCount = chainSlots.length
          const opsCount = chainOps.length
          const atSlotStateNeedFirst = slotsCount === 0
          const atSlotStateNeedNext = !atSlotStateNeedFirst && opsCount === slotsCount
          const atSlotStateAtOp = !atSlotStateNeedFirst && !atSlotStateNeedNext && pickingOp
          const atSlotStateAtSlot = !atSlotStateNeedFirst && !atSlotStateNeedNext && !pickingOp
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
                <div className="p-6 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900">Add Relation</h2>
                  {tl && (
                    <p className="text-xs text-slate-500 mt-1">
                      Timeline: <span className="font-medium text-slate-700">{tl.name}</span>
                    </p>
                  )}
                </div>

                <form onSubmit={handleSaveRelation} className="overflow-y-auto p-6 space-y-5">
                  {/* Live expression preview */}
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Building</span>
                    <div className="mt-1 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-sm text-slate-700 min-h-[2.5rem] break-words">
                      {liveExpression || <span className="text-slate-400 italic">— pick a practice to start —</span>}
                    </div>
                  </div>

                  {practices.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">
                      No practices on this Timeline yet — add practices first, then come back.
                    </p>
                  ) : (
                    <>
                      {/* Chain editor */}
                      <div className="space-y-2">
                        {chainSlots.map((slot, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2">
                            {i > 0 && (
                              <span className="text-[10px] uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-semibold">
                                {chainOps[i - 1]}
                              </span>
                            )}
                            <span className={`inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 border ${slot.startsWith('list:') ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
                              <span className="font-medium">Slot {i + 1}:</span>
                              <span className="font-medium">{slotDisplay(slot, practices, listItems)}</span>
                            </span>
                          </div>
                        ))}

                        {/* Next-slot dropdown (after picking an op).
                            Filtered per the operator just chosen — OR
                            locks to the chain's L1 anchor; AND opens up
                            to every L0=INPUT practice. */}
                        {atSlotStateNeedNext && (() => {
                          const lastOp = chainOps[chainOps.length - 1]
                          const opts = slotOptions(tlId, false, lastOp)
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-semibold">
                                {lastOp}
                              </span>
                              <select autoFocus
                                value=""
                                onChange={e => {
                                  if (e.target.value) appendSlotValue(e.target.value)
                                }}
                                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[260px]">
                                <option value="">— pick practice or List item —</option>
                                {opts.map(opt => (
                                  <option key={opt.value} value={opt.value} disabled={!opt.eligible}>
                                    {opt.kind === 'LIST' ? '↪ ' : ''}{opt.label}
                                    {!opt.eligible && opt.reason ? ` — ${opt.reason}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )
                        })()}

                        {/* First-slot dropdown — L0=INPUT only. */}
                        {atSlotStateNeedFirst && (() => {
                          const opts = slotOptions(tlId, true, null)
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm text-slate-600">Pick a practice:</span>
                              <select autoFocus
                                value=""
                                onChange={e => {
                                  if (e.target.value) appendSlotValue(e.target.value)
                                }}
                                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[280px]">
                                <option value="">— pick practice —</option>
                                {opts.map(opt => (
                                  <option key={opt.value} value={opt.value} disabled={!opt.eligible}>
                                    {opt.kind === 'LIST' ? '↪ ' : ''}{opt.label}
                                    {!opt.eligible && opt.reason ? ` — ${opt.reason}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )
                        })()}

                        {/* AT_OP: AND / OR buttons after + */}
                        {atSlotStateAtOp && (() => {
                          const orAllowed = canPickOR(tlId)
                          return (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 mr-1">Next operator:</span>
                              {(['AND', 'OR'] as const).map(op => {
                                const disabled = op === 'OR' && !orAllowed
                                return (
                                  <button key={op} type="button"
                                    disabled={disabled}
                                    onClick={() => appendOp(op)}
                                    title={disabled ? 'OR not available — chain spans both Pesticides and Fertilizers.' : ''}
                                    className="text-sm font-semibold px-4 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed">
                                    {op}
                                  </button>
                                )
                              })}
                              <button type="button" onClick={() => setPickingOp(false)}
                                className="text-xs text-slate-400 hover:text-slate-600 ml-2">cancel</button>
                            </div>
                          )
                        })()}

                        {/* AT_SLOT: AND/OR auto if only one slot so far */}
                        {atSlotStateAtSlot && slotsCount === 1 && (() => {
                          const orAllowed = canPickOR(tlId)
                          return (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 mr-1">Pick operator:</span>
                              {(['AND', 'OR'] as const).map(op => {
                                const disabled = op === 'OR' && !orAllowed
                                return (
                                  <button key={op} type="button"
                                    disabled={disabled}
                                    onClick={() => appendOp(op)}
                                    title={disabled ? 'OR not available — chain spans both Pesticides and Fertilizers.' : ''}
                                    className="text-sm font-semibold px-4 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed">
                                    {op}
                                  </button>
                                )
                              })}
                            </div>
                          )
                        })()}

                        {atSlotStateAtSlot && slotsCount >= 2 && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button type="button"
                              onClick={addCurrentChainToList}
                              disabled={!canAddToList(tlId)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
                              title={addToListBlockedReason(tlId)}>
                              + Add to List
                            </button>
                            <button type="button"
                              onClick={() => setPickingOp(true)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100">
                              + Extend chain
                            </button>
                            <button type="button"
                              onClick={backOneSlot}
                              className="text-xs text-slate-500 hover:text-red-500 px-2 py-1.5">
                              ← Remove last
                            </button>
                            <div className="flex-1" />
                            <span className="text-[11px] text-slate-400">
                              {chainIsPure()
                                ? `pure ${chainIsPureAND() ? 'AND' : 'OR'} chain`
                                : 'mixed AND/OR — only SAVE is allowed'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* List of stored sub-expressions */}
                      {listItems.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                            List <span className="text-slate-400 font-normal">(reusable in slots above)</span>
                          </h3>
                          <div className="space-y-1.5">
                            {listItems.map(item => (
                              <div key={item.id} className="flex items-start gap-2 text-xs bg-purple-50 border border-purple-100 rounded-lg px-3 py-1.5">
                                <span className="font-bold text-purple-700 shrink-0">{item.id}:</span>
                                <span className="text-slate-700 flex-1 min-w-0 break-words">
                                  {renderChainText(item.slots, item.ops, practices, listItems)}
                                </span>
                                <button type="button"
                                  onClick={() => deleteListItem(item.id)}
                                  className="text-purple-300 hover:text-red-500 shrink-0"
                                  title="Delete List item">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Expression override */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Expression label <span className="text-slate-400 font-normal">(optional override)</span>
                    </label>
                    <input type="text"
                      placeholder={liveExpression || '— auto-built from the chain —'}
                      value={relationForm.expression}
                      onChange={e => setRelationForm(f => ({ ...f, expression: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {relationError && <p className="text-sm text-red-600">{relationError}</p>}

                  <div className="flex gap-3 pt-2">
                    <button type="button"
                      onClick={() => { setShowAddRelation(null); setRelationError('') }}
                      className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">
                      Cancel
                    </button>
                    <button type="submit"
                      disabled={savingRelation || !canSave(tlId)}
                      title={saveBlockedReason(tlId)}
                      className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                      {savingRelation ? 'Saving…' : 'SAVE Relation'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )
        })()}

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
                        {isCustom && !isEditingThisParam && (
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
                        <button
                          onClick={() => {
                            setNewVarForParamId(newVarForParamId === param.id ? null : param.id)
                            setNewVarName('')
                          }}
                          className="text-xs text-blue-600 hover:underline">
                          {newVarForParamId === param.id ? 'Cancel' : '+ Variable'}
                        </button>
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
                                  const editingThis = editingVarKey === key
                                  const isAssigned = v.id === assignedId
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

                {newVarForParamId && (
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
                    sub-form. */}
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
                        disabled={pushingClientId === row.client_id}
                        className="text-sm font-semibold text-white bg-blue-600 px-4 py-1.5 rounded-xl disabled:opacity-50">
                        {pushingClientId === row.client_id ? 'Pushing…' : 'Push'}
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
      </div>
    </AdminLayout>
  )
}
