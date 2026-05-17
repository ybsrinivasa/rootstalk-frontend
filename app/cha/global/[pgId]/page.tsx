'use client'

// Batch 39P-a (2026-05-16) — SA-portal Global PG detail page base.
//
// Header rewritten to show PG name + bundle + status (was raw
// cosh_id + non-existent application_type). Timelines + practices
// read through the new `/advisory/global/pg-recommendations/{id}/
// timelines` endpoint which mirrors the CA-side shape and returns
// practices nested per timeline in one round-trip.
//
// Practice authoring is intentionally still bare-bones in this
// batch; cascading L0/L1/L2 + element form + relations + CQs land
// in 39P-b/c/d (port from CCA's authoring depth — backend tables
// already shared after Batch 39O UCAT unification).

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { RelationsSection, type RelationOut } from '@/components/advisory-authoring/RelationsSection'
import { CQsSection, type CQOut } from '@/components/advisory-authoring/CQsSection'
import { PublishModal } from '@/components/advisory-authoring/PublishModal'
import {
  ReadOnlyBanner, VersionHistorySection,
  type LineageRow,
} from '@/components/advisory-authoring/LineageSection'
import { PracticeFormModal, type ExistingPractice } from '@/components/advisory-authoring/PracticeFormModal'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'

interface PGRec {
  id: string
  problem_group_cosh_id: string
  area_or_plant: string | null
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  version: number
}

interface ProblemGroup { cosh_id: string; name_en: string }

interface PracticeElement {
  element_type: string
  label: string
  cosh_ref: string | null
  value: string | null
  unit_cosh_id: string | null
  display_value: string | null
  display_order: number
}

interface PGPractice {
  id: string
  l0_type: string
  l1_type: string | null
  l2_type: string | null
  display_order: number
  is_special_input: boolean
  is_brand_locked?: boolean
  frequency_days?: number | null
  elements?: PracticeElement[]
}

interface PGTimeline {
  id: string
  pg_recommendation_id: string
  name: string
  from_type: string
  from_value: number
  to_value: number
  status?: 'ACTIVE' | 'INACTIVE'
  practices?: PGPractice[]
}

const L0_COLOUR: Record<string, string> = {
  INPUT: 'bg-blue-100 text-blue-700', NON_INPUT: 'bg-purple-100 text-purple-700',
  INSTRUCTION: 'bg-amber-100 text-amber-700', MEDIA: 'bg-pink-100 text-pink-700',
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
}

const AREA_PLANT_LABEL: Record<string, string> = {
  AREA_WISE: 'Area-wise',
  PLANT_WISE: 'Plant-wise',
}

export default function GlobalPGDetailPage() {
  const { pgId } = useParams<{ pgId: string }>()
  const router = useRouter()

  const [pg, setPg] = useState<PGRec | null>(null)
  const [pgName, setPgName] = useState('')
  const [timelines, setTimelines] = useState<PGTimeline[]>([])
  const [practiceMap, setPracticeMap] = useState<Record<string, PGPractice[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedPractice, setExpandedPractice] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  const [showAddTL, setShowAddTL] = useState(false)
  const [addingTL, setAddingTL] = useState(false)
  const [tlError, setTlError] = useState('')
  const [tlForm, setTlForm] = useState({ name: '', from_type: 'DAYS_AFTER_DETECTION', from_value: '0', to_value: '7' })

  // Practice authoring goes through the shared `<PracticeFormModal>`
  // (Batch 39P-e). `showAddPractice` carries the timeline id when
  // the modal is open; `editingPractice` carries the practice row
  // when the modal opens in edit mode.
  const [showAddPractice, setShowAddPractice] = useState<string | null>(null)
  const [editingPractice, setEditingPractice] = useState<{ timelineId: string; practice: PGPractice } | null>(null)

  // Relations + Conditional Questions are rendered inside each
  // expanded Timeline via shared components (39P-b2 + 39P-c). The
  // same components drive CCA's Global Package authoring; PG just
  // passes `pipe: 'PG_GLOBAL'`. The `relationsByTimeline` mirror
  // map is needed by the CQ section's attachment picker (relations
  // are valid YES/NO targets); we keep it via the callback.
  const [relationsByTimeline, setRelationsByTimeline] = useState<Record<string, RelationOut[]>>({})
  const [cqsByTimeline, setCqsByTimeline] = useState<Record<string, CQOut[]>>({})

  // Batch 39P-d (2026-05-16) — publish lifecycle.
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishBlockers, setPublishBlockers] = useState<{ code: string; message: string }[]>([])
  const [lineage, setLineage] = useState<LineageRow[]>([])
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState('')
  const [makingEditable, setMakingEditable] = useState<string | null>(null)

  // Batch 39R (2026-05-17) — PG + Timeline ACTIVE ↔ INACTIVE toggle.
  const [togglingPg, setTogglingPg] = useState(false)
  const [togglingTl, setTogglingTl] = useState<string | null>(null)

  async function togglePgStatus(next: 'ACTIVE' | 'INACTIVE') {
    if (!pg) return
    if (!confirm(
      next === 'INACTIVE'
        ? 'Mark this Global PG recommendation Inactive? Clients will stop seeing it as available to pull, but existing imports stay live.'
        : 'Reactivate this Global PG recommendation? It will surface again on the import list.'
    )) return
    setTogglingPg(true)
    try {
      const { data } = await api.put(
        `/advisory/global/pg-recommendations/${pgId}`, { status: next },
      )
      setPg(data)
      api.get<LineageRow[]>(`/advisory/global/pg-recommendations/${pgId}/lineage`)
        .then(r => setLineage(r.data))
        .catch(() => {})
    } catch (err: unknown) {
      alert(extractErrorMessage(err, 'Failed to update status.'))
    } finally {
      setTogglingPg(false)
    }
  }

  async function toggleTimelineStatus(tl: PGTimeline, next: 'ACTIVE' | 'INACTIVE') {
    setTogglingTl(tl.id)
    try {
      await api.put(
        `/advisory/global/pg-recommendations/${pgId}/timelines/${tl.id}`,
        { status: next },
      )
      await loadTimelines()
    } catch (err: unknown) {
      alert(extractErrorMessage(err, 'Failed to update timeline status.'))
    } finally {
      setTogglingTl(null)
    }
  }

  const loadTimelines = async () => {
    const { data } = await api.get<PGTimeline[]>(
      `/advisory/global/pg-recommendations/${pgId}/timelines`,
    ).catch(() => ({ data: [] as PGTimeline[] }))
    setTimelines(data)
    // Seed practiceMap from the nested-on-timeline shape so the
    // "+ Add Practice" affordance and counts render before the user
    // expands. Per-timeline element-rich fetch (loadPractices) runs
    // on expand + after every save so element values stay fresh.
    const map: Record<string, PGPractice[]> = {}
    for (const tl of data) {
      if (tl.practices) map[tl.id] = tl.practices
    }
    setPracticeMap(map)
  }

  // Per-timeline practices with elements + server-resolved labels.
  // Mirrors the CCA pattern (Batch 32) — element values aren't on the
  // timelines-list payload; we fetch them on expand so the practice
  // row can show "label: value" detail and the Edit modal pre-fills.
  const loadPractices = async (tlId: string) => {
    try {
      const { data } = await api.get<PGPractice[]>(
        `/advisory/global/pg-recommendations/${pgId}/timelines/${tlId}/practices`,
      )
      setPracticeMap(m => ({ ...m, [tlId]: data }))
    } catch {
      /* leave existing map entry alone on failure */
    }
  }

  useEffect(() => {
    if (!pgId) return
    api.get<PGRec>(`/advisory/global/pg-recommendations/${pgId}`)
      .then(r => setPg(r.data))
      .catch(() => router.replace('/cha/global'))
    loadTimelines()
    // Resolve PG display name from the catalogue so the header isn't
    // a raw cosh_id.
    api.get<ProblemGroup[]>('/advisory/global/problem-groups')
      .then(r => {
        const match = r.data.find(p => p.cosh_id === pg?.problem_group_cosh_id)
        if (match) setPgName(match.name_en)
      })
      .catch(() => {})
    // Lineage drives the read-only banner + version history panel.
    api.get<LineageRow[]>(`/advisory/global/pg-recommendations/${pgId}/lineage`)
      .then(r => setLineage(r.data))
      .catch(() => setLineage([]))
  }, [pgId])

  // Re-resolve PG name when the recommendation row loads (the catalogue
  // fetch may complete first or second).
  useEffect(() => {
    if (!pg?.problem_group_cosh_id || pgName) return
    api.get<ProblemGroup[]>('/advisory/global/problem-groups')
      .then(r => {
        const match = r.data.find(p => p.cosh_id === pg.problem_group_cosh_id)
        if (match) setPgName(match.name_en)
      })
      .catch(() => {})
  }, [pg?.problem_group_cosh_id])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = prev === id ? null : id
      if (next === id) loadPractices(id)
      return next
    })
  }

  async function handlePublish() {
    setPublishing(true); setPublishError(''); setPublishBlockers([])
    try {
      const { data } = await api.post<PGRec>(
        `/advisory/global/pg-recommendations/${pgId}/publish`,
      )
      setPg(data)
      setShowPublishModal(false)
      // Reload lineage — the newly-published row replaces the prior
      // ACTIVE in the same lineage.
      api.get<LineageRow[]>(`/advisory/global/pg-recommendations/${pgId}/lineage`)
        .then(r => setLineage(r.data))
        .catch(() => {})
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: { code?: string; missing?: { code: string; message: string }[] } | string } } })
        ?.response?.data?.detail
      if (typeof detail === 'object' && detail?.code === 'publish_blocked' && Array.isArray(detail.missing)) {
        setPublishBlockers(detail.missing.map(m => ({ code: m.code, message: m.message })))
      } else {
        setPublishError(extractErrorMessage(err, 'Failed to publish.'))
      }
    } finally { setPublishing(false) }
  }

  async function handleCloneToDraft() {
    setCloning(true); setCloneError('')
    try {
      const { data } = await api.post<PGRec>(
        `/advisory/global/pg-recommendations/${pgId}/clone-to-draft`,
      )
      router.push(`/cha/global/${data.id}`)
    } catch (err: unknown) {
      setCloneError(extractErrorMessage(err, 'Failed to start a new draft.'))
    } finally { setCloning(false) }
  }

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
      const { data } = await api.post<PGRec>(
        `/advisory/global/pg-recommendations/${srcId}/clone-to-draft`,
      )
      router.push(`/cha/global/${data.id}`)
    } catch (err: unknown) {
      setCloneError(extractErrorMessage(err, 'Failed to make this version editable.'))
    } finally { setMakingEditable(null) }
  }

  async function handleAddTimeline(e: FormEvent) {
    e.preventDefault()
    setAddingTL(true); setTlError('')
    try {
      await api.post(
        `/advisory/global/pg-recommendations/${pgId}/timelines`, {
          name: tlForm.name, from_type: tlForm.from_type,
          from_value: parseInt(tlForm.from_value), to_value: parseInt(tlForm.to_value),
        })
      setShowAddTL(false)
      setTlForm({ name: '', from_type: 'DAYS_AFTER_DETECTION', from_value: '0', to_value: '7' })
      await loadTimelines()
    } catch (err: unknown) {
      setTlError(extractErrorMessage(err, 'Failed to add timeline.'))
    } finally { setAddingTL(false) }
  }

  async function handleDeletePractice(tlId: string, practiceId: string) {
    if (!confirm('Delete this practice?')) return
    await api.delete(
      `/advisory/global/pg-recommendations/${pgId}/timelines/${tlId}/practices/${practiceId}`,
    )
    await loadTimelines()
  }

  async function deleteTL(tl: PGTimeline) {
    if (!confirm(`Delete timeline "${tl.name}"?`)) return
    await api.delete(`/advisory/global/pg-recommendations/${pgId}/timelines/${tl.id}`)
    await loadTimelines()
  }

  if (!pg) return <AdminLayout><div className="pt-20 text-center text-slate-400">Loading…</div></AdminLayout>

  const existingDraft = lineage.find(r => r.status === 'DRAFT' && r.id !== pg.id) || null
  const nextVersion = pg.status === 'DRAFT'
    ? pg.version
    : Math.max(...lineage.map(r => r.version), pg.version) + 1

  return (
    <AdminLayout>
      <div className="max-w-4xl space-y-6">
        <div>
          <Link href="/cha/global" className="text-xs text-slate-500 hover:text-slate-700">
            ← Back to CHA Library
          </Link>
        </div>

        <ReadOnlyBanner
          status={pg.status}
          currentVersion={pg.version}
          nextVersion={nextVersion}
          existingDraft={existingDraft}
          continueDraftHref={(draft) => `/cha/global/${draft.id}`}
          cloning={cloning}
          cloneError={cloneError}
          onCloneToDraft={handleCloneToDraft}
        />

        <VersionHistorySection
          lineage={lineage}
          rowDetailUrl={(row) => `/cha/global/${row.id}`}
          makingEditable={makingEditable}
          onMakeEditable={handleMakeEditable}
        />

        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">
                {pgName || pg.problem_group_cosh_id}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">GLOBAL PG</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOUR[pg.status] || 'bg-slate-100 text-slate-600'}`}>
                {pg.status}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white">
                v{pg.version}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              {AREA_PLANT_LABEL[pg.area_or_plant || ''] || '—'}
            </p>
            {!pgName && (
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                {pg.problem_group_cosh_id}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href={`/cha/global/${pgId}/preview`}
              className="border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50">
              👁 Preview
            </Link>
            {pg.status === 'DRAFT' && (
              <button onClick={() => {
                setPublishError(''); setPublishBlockers([]); setShowPublishModal(true)
              }}
                className="bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
                ✓ Publish
              </button>
            )}
            {pg.status === 'ACTIVE' && (
              <button onClick={() => togglePgStatus('INACTIVE')} disabled={togglingPg}
                className="border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 disabled:opacity-50">
                {togglingPg ? 'Saving…' : '⊘ Mark Inactive'}
              </button>
            )}
            {pg.status === 'INACTIVE' && (
              <button onClick={() => togglePgStatus('ACTIVE')} disabled={togglingPg}
                className="border border-green-300 text-green-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-green-50 disabled:opacity-50">
                {togglingPg ? 'Saving…' : '↺ Reactivate'}
              </button>
            )}
          </div>
        </div>

        {publishError && !showPublishModal && <p className="text-sm text-red-600">{publishError}</p>}

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <strong>Global PG recommendation</strong> — Clients import and customise this for their crops + districts. Practice authoring depth (Brand Lock, cascading L0/L1/L2, element form, Relations, Conditional Questions) lands in later batches.
        </div>

        {/* Timelines */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">Timelines <span className="text-slate-400 font-normal text-sm">({timelines.length})</span></h2>
            <button onClick={() => setShowAddTL(true)}
              className="text-sm font-medium px-3 py-1.5 rounded-xl border border-blue-300 text-blue-600">
              + Add Timeline
            </button>
          </div>

          {timelines.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-200">
              <p className="text-slate-500 text-sm">No treatment timelines yet. Add windows like "Day 0–3 after detection" with treatment practices.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {timelines.map(tl => (
                <div key={tl.id} className={`rounded-2xl border shadow-sm overflow-hidden ${tl.status === 'INACTIVE' ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-100'}`}>
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50" onClick={() => toggle(tl.id)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium text-sm ${tl.status === 'INACTIVE' ? 'text-slate-500' : 'text-slate-800'}`}>{tl.name}</p>
                        {tl.status === 'INACTIVE' && (
                          <span className="text-[10px] font-semibold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">INACTIVE</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{tl.from_type} · Day {tl.from_value} → {tl.to_value}</p>
                    </div>
                    {tl.status === 'INACTIVE' ? (
                      <button
                        onClick={e => { e.stopPropagation(); toggleTimelineStatus(tl, 'ACTIVE') }}
                        disabled={togglingTl === tl.id}
                        className="text-[11px] font-medium text-green-700 border border-green-300 px-2 py-1 rounded-lg hover:bg-green-50 disabled:opacity-50"
                        title="Reactivate this timeline"
                      >{togglingTl === tl.id ? '…' : '↺ Reactivate'}</button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); toggleTimelineStatus(tl, 'INACTIVE') }}
                        disabled={togglingTl === tl.id}
                        className="text-[11px] font-medium text-slate-500 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                        title="Retire this timeline (excluded from farmer advisory; history preserved)"
                      >{togglingTl === tl.id ? '…' : '⊘ Inactive'}</button>
                    )}
                    <button onClick={e => { e.stopPropagation(); deleteTL(tl) }} className="text-slate-300 hover:text-red-400 p-1" title="Delete (cannot undo)">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded === tl.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {expanded === tl.id && (
                    <div className="border-t border-slate-100 px-5 py-4 space-y-4">
                      {/* Practices subsection */}
                      <div>
                        {!practiceMap[tl.id] ? <p className="text-xs text-slate-400">Loading…</p>
                         : practiceMap[tl.id].length === 0 ? <p className="text-xs text-slate-400">No practices yet.</p>
                         : practiceMap[tl.id].map(p => {
                          const isPExpanded = expandedPractice === p.id
                          const hasElements = (p.elements?.length || 0) > 0
                          return (
                            <div key={p.id} className="border-b border-slate-50 last:border-0">
                              <div
                                className="flex items-center gap-3 py-2 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded"
                                onClick={() => setExpandedPractice(isPExpanded ? null : p.id)}>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${L0_COLOUR[p.l0_type] || 'bg-slate-100'}`}>{p.l0_type}</span>
                                <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{[p.l1_type, p.l2_type].filter(Boolean).join(' › ') || <span className="text-slate-400 italic">No sub-type</span>}</span>
                                {p.is_special_input && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">special</span>}
                                {p.is_brand_locked && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full" title="Locked brand">🔒 locked</span>}
                                <span className="text-[11px] text-slate-400">
                                  {hasElements ? `${p.elements!.length} element${p.elements!.length === 1 ? '' : 's'}` : 'no elements'}
                                </span>
                                <button onClick={e => {
                                  e.stopPropagation()
                                  setEditingPractice({ timelineId: tl.id, practice: p })
                                  setShowAddPractice(tl.id)
                                }}
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
                                <svg className={`w-3.5 h-3.5 text-slate-300 transition-transform ${isPExpanded ? 'rotate-180' : ''}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                              {isPExpanded && (
                                <div className="ml-2 pl-3 border-l-2 border-slate-100 py-2 space-y-1 mb-2">
                                  {hasElements ? p.elements!.map(el => (
                                    <div key={el.element_type} className="flex items-baseline gap-2 text-xs">
                                      <span className="text-slate-500 min-w-[140px] shrink-0">{el.label}:</span>
                                      <span className="text-slate-800 font-medium min-w-0">
                                        {el.display_value || <span className="text-slate-300 italic">—</span>}
                                      </span>
                                    </div>
                                  )) : (
                                    <p className="text-xs text-slate-400 italic">No elements on this Practice.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                        <button onClick={() => {
                          setEditingPractice(null)
                          setShowAddPractice(tl.id)
                        }}
                          className="text-xs font-medium text-blue-600 mt-2">+ Add Practice</button>
                      </div>

                      {/* Relations + Conditional Questions — shared
                          with CCA via the same components (Batches
                          39P-b2 + 39P-c). */}
                      <RelationsSection
                        timelineId={tl.id}
                        timelineName={tl.name}
                        practices={practiceMap[tl.id] || []}
                        pipe={{ pipe: 'PG_GLOBAL', parentId: pgId }}
                        onRelationsChange={(tid, rels) =>
                          setRelationsByTimeline(m => ({ ...m, [tid]: rels }))
                        }
                      />
                      <CQsSection
                        timelineId={tl.id}
                        timelineName={tl.name}
                        practices={practiceMap[tl.id] || []}
                        relations={relationsByTimeline[tl.id] || []}
                        pipe={{ pipe: 'PG_GLOBAL', parentId: pgId }}
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

        {showAddTL && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="p-6 border-b border-slate-100"><h2 className="font-bold text-slate-900">Add Treatment Timeline</h2></div>
              <form onSubmit={handleAddTimeline} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
                  <input value={tlForm.name} onChange={e => setTlForm(f => ({ ...f, name: e.target.value }))}
                    required placeholder="e.g. Immediate Treatment (Day 0–3)"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Reference</label>
                  <div className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 text-sm text-slate-600">
                    Days After Detection
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    CHA timelines anchor only on the day the problem is detected — there is no &ldquo;before&rdquo; window (a prescription follows diagnosis).
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">From (day)</label>
                    <input type="number" value={tlForm.from_value} onChange={e => setTlForm(f => ({ ...f, from_value: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">To (day)</label>
                    <input type="number" value={tlForm.to_value} onChange={e => setTlForm(f => ({ ...f, to_value: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
                  </div>
                </div>
                {tlError && <p className="text-sm text-red-600">{tlError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddTL(false); setTlError('') }}
                    className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm">Cancel</button>
                  <button type="submit" disabled={addingTL}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {addingTL ? 'Adding…' : 'Add Timeline'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <PracticeFormModal
          open={!!showAddPractice}
          mode={editingPractice ? 'edit' : 'create'}
          timelineId={showAddPractice || ''}
          cropCoshId={''} /* PG protocols aren't crop-bound; spec applies plant-wise extras only when crop measure says so */
          existingPractice={editingPractice?.practice as ExistingPractice | undefined}
          contextSubtitle={(() => {
            if (!showAddPractice) return undefined
            const tl = timelines.find(t => t.id === showAddPractice)
            if (!tl) return undefined
            return `${tl.name} · Day ${tl.from_value} → ${tl.to_value} after detection`
          })()}
          pipe={{ pipe: 'PG_GLOBAL', parentId: pgId }}
          onClose={() => {
            setShowAddPractice(null)
            setEditingPractice(null)
          }}
          onSaved={() => {
            // Refresh the timeline list (covers nested-shape consumers
            // like the publish-readiness counts) AND the element-rich
            // per-timeline practice list so the just-saved practice
            // shows its elements when the row is expanded.
            const tlId = showAddPractice
            loadTimelines()
            if (tlId) loadPractices(tlId)
          }}
        />

        {showPublishModal && (() => {
          let tlCount = 0, practiceCount = 0, relCount = 0, cqCount = 0
          for (const tl of timelines) {
            tlCount++
            practiceCount += (practiceMap[tl.id] || []).length
            relCount += (relationsByTimeline[tl.id] || []).length
            cqCount += (cqsByTimeline[tl.id] || []).length
          }
          return (
            <PublishModal
              entityLabel="PG Recommendation"
              currentVersion={pg.version}
              // PG has no `published_at`; the "first publish" signal
              // is "still in DRAFT for the first time". After the
              // first publish, status flips to ACTIVE / INACTIVE.
              isFirstPublish={pg.status === 'DRAFT' && pg.version === 1}
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
      </div>
    </AdminLayout>
  )
}
