'use client'
import { useEffect, useState, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
interface Practice {
  id: string; l0_type: string; l1_type: string | null; l2_type: string | null
  display_order: number; is_special_input: boolean
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
  const [expanded, setExpanded] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

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
    l0_type: 'INPUT', l1_type: '', l2_type: '', display_order: '0', is_special_input: false,
  })

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
        for (const f of r.data.elements) fresh[f.name] = ''
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
        // 2026-05-14. SE can still uncheck for any edge case.
        setPracticeForm(prev => ({ ...prev, is_special_input: newMeta.is_special_input }))
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
  useEffect(() => {
    if (l2Spec.length === 0) return
    if (!commonName) return
    const cnEnc = encodeURIComponent(commonName)
    const tnSuffix = brandName ? `&trade_name=${encodeURIComponent(brandName)}` : ''
    const url_form = `/cosh/options/formulations?common_name=${cnEnc}${tnSuffix}`
    const url_ai = `/cosh/options/ai-concentrations?common_name=${cnEnc}${tnSuffix}`
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
    api.get<CoshOption[]>(`/cosh/options/manufacturers?common_name=${cnEnc}${tnSuffix}`)
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
    api.get<CoshOption[]>(`/cosh/options/trade-names?common_name=${cnEnc}${mfrSuffix}`)
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
    const cnChildren = ['MANUFACTURER', 'BRAND_NAME', 'FORMULATION', 'AI_CONCENTRATION']
    const tnChildren = ['FORMULATION', 'AI_CONCENTRATION']
    const childrenToClear = fieldName === 'COMMON_NAME' ? cnChildren
      : fieldName === 'BRAND_NAME' ? tnChildren
        : []
    setElementValues(prev => {
      const next = { ...prev, [fieldName]: value }
      for (const c of childrenToClear) if (c in next) next[c] = ''
      return next
    })
    if (childrenToClear.length > 0 && !value) {
      setOptionsByField(prev => {
        const next = { ...prev }
        for (const c of childrenToClear) delete next[c]
        return next
      })
    }
  }

  // Helper: source-string → input variant.
  function elementInputVariant(source: string): 'text' | 'textarea' | 'number' | 'media' | 'auto' | 'select' {
    if (source === 'auto_calculated') return 'auto'
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

  const toggle = (tlId: string) => {
    if (expanded === tlId) { setExpanded(null); return }
    setExpanded(tlId)
    if (!practiceMap[tlId]) loadPractices(tlId)
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
      if (variant === 'auto' || variant === 'media') continue
      const raw = elementValues[field.name]
      if (raw === undefined || raw.trim() === '') continue
      if (variant === 'select') {
        elements.push({ element_type: field.name, cosh_ref: raw.trim() })
      } else {
        elements.push({ element_type: field.name, value: raw.trim() })
      }
    }

    try {
      await api.post(`/advisory/global/packages/${id}/timelines/${showAddPractice}/practices`, {
        l0_type: practiceForm.l0_type,
        l1_type: practiceForm.l1_type || null,
        l2_type: practiceForm.l2_type || null,
        display_order: parseInt(practiceForm.display_order),
        is_special_input: practiceForm.is_special_input,
        elements,
      })
      setShowAddPractice(null)
      setPracticeForm({ l0_type: 'INPUT', l1_type: '', l2_type: '', display_order: '0', is_special_input: false })
      setL2Spec([]); setElementValues({})
      loadPractices(showAddPractice)
    } catch (err: unknown) {
      setPracticeError(extractErrorMessage(err, 'Failed to add practice.'))
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
                          : practiceMap[tl.id].map(p => (
                            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${L0_COLOUR[p.l0_type] || 'bg-slate-100'}`}>{p.l0_type}</span>
                              <span className="text-sm text-slate-700 flex-1">
                                {[p.l1_type, p.l2_type].filter(Boolean).join(' › ') || <span className="text-slate-400 italic">No sub-type</span>}
                              </span>
                              {p.is_special_input && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">special</span>}
                              <button onClick={() => handleDeletePractice(tl.id, p.id)} className="text-slate-300 hover:text-red-400 p-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))
                      }
                      <button onClick={() => setShowAddPractice(tl.id)} className="text-xs font-medium text-blue-600 mt-2 hover:underline">
                        + Add Practice
                      </button>
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

        {/* Add Practice Modal */}
        {showAddPractice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Add Practice</h2>
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
                        return (
                          <div key={field.name} className="text-xs text-slate-400 italic">
                            {field.label} — auto-calculated server-side
                          </div>
                        )
                      }
                      if (variant === 'media') {
                        return (
                          <div key={field.name} className="text-xs text-slate-400 italic">
                            {field.label} — media upload not yet wired (deferred)
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
                {practiceError && <p className="text-sm text-red-600">{practiceError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddPractice(null); setPracticeError('') }}
                    className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={addingPractice}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {addingPractice ? 'Adding…' : 'Add Practice'}
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
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {parameters.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">
                    No parameters yet for <span className="font-mono">{pkg.crop_cosh_id}</span>.
                    Add one below (e.g. Irrigation) and give it a couple of variables
                    (e.g. Drip, Flood).
                  </p>
                ) : parameters.map(param => {
                  const vars = variablesByParam[param.id] || []
                  const assignedId = getAssignedVariableId(param.id)
                  const isCustom = param.source === 'CUSTOM'
                  const isEditingThisParam = editingParamId === param.id
                  return (
                    <div key={param.id} className="py-3 border-b border-slate-50 last:border-0">
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
                      {/* Variable pills (only on CUSTOM — Cosh variables are
                          read-only; renaming them locally would drift away
                          from upstream Cosh translations). */}
                      {isCustom && vars.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                          {vars.map(v => {
                            const key = `${param.id}:${v.id}`
                            const editingThis = editingVarKey === key
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
                              <span key={v.id} className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[11px] rounded-full pl-2.5 pr-1 py-0.5">
                                <button onClick={() => { setEditingVarKey(key); setEditingVarName(v.name) }}
                                  className="hover:text-blue-600">{v.name}</button>
                                <button onClick={() => handleDeleteVariable(param.id, v.id, v.name)}
                                  className="text-slate-400 hover:text-red-500 ml-0.5 leading-none"
                                  title="Delete variable">
                                  ×
                                </button>
                              </span>
                            )
                          })}
                        </div>
                      )}
                      {!isCustom && vars.length > 0 && (
                        <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                          {vars.length} variable{vars.length === 1 ? '' : 's'}: {vars.map(v => v.name).join(', ')}
                        </p>
                      )}
                    </div>
                  )
                })}

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
