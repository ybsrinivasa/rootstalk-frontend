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
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'

interface PGRec {
  id: string
  problem_group_cosh_id: string
  area_or_plant: string | null
  status: string
  version: number
}

interface ProblemGroup { cosh_id: string; name_en: string }

interface PGPractice {
  id: string
  l0_type: string
  l1_type: string | null
  l2_type: string | null
  display_order: number
  is_special_input: boolean
}

interface PGTimeline {
  id: string
  pg_recommendation_id: string
  name: string
  from_type: string
  from_value: number
  to_value: number
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
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  const [showAddTL, setShowAddTL] = useState(false)
  const [addingTL, setAddingTL] = useState(false)
  const [tlError, setTlError] = useState('')
  const [tlForm, setTlForm] = useState({ name: '', from_type: 'DAYS_AFTER_DETECTION', from_value: '0', to_value: '7' })

  const [showAddPractice, setShowAddPractice] = useState<string | null>(null)
  const [addingPractice, setAddingPractice] = useState(false)
  const [practiceError, setPracticeError] = useState('')
  const [practiceForm, setPracticeForm] = useState({ l0_type: 'INPUT', l1_type: '', l2_type: '', display_order: '0', is_special_input: false })

  const loadTimelines = async () => {
    const { data } = await api.get<PGTimeline[]>(
      `/advisory/global/pg-recommendations/${pgId}/timelines`,
    ).catch(() => ({ data: [] as PGTimeline[] }))
    setTimelines(data)
    const map: Record<string, PGPractice[]> = {}
    for (const tl of data) {
      if (tl.practices) map[tl.id] = tl.practices
    }
    setPracticeMap(map)
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
    setExpanded(prev => prev === id ? null : id)
  }

  async function handlePublish() {
    setPublishing(true); setPublishError('')
    try {
      const { data } = await api.post<PGRec>(
        `/advisory/global/pg-recommendations/${pgId}/publish`,
      )
      setPg(data)
    } catch (err: unknown) {
      setPublishError(extractErrorMessage(err, 'Failed to publish.'))
    } finally { setPublishing(false) }
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

  async function handleAddPractice(e: FormEvent) {
    e.preventDefault()
    if (!showAddPractice) return
    setAddingPractice(true); setPracticeError('')
    try {
      await api.post(`/advisory/global/pg-recommendations/${pgId}/timelines/${showAddPractice}/practices`, {
        l0_type: practiceForm.l0_type, l1_type: practiceForm.l1_type || null,
        l2_type: practiceForm.l2_type || null, display_order: parseInt(practiceForm.display_order),
        is_special_input: practiceForm.is_special_input, elements: [],
      })
      setShowAddPractice(null)
      setPracticeForm({ l0_type: 'INPUT', l1_type: '', l2_type: '', display_order: '0', is_special_input: false })
      await loadTimelines()
    } catch (err: unknown) {
      setPracticeError(extractErrorMessage(err, 'Failed to add practice.'))
    } finally { setAddingPractice(false) }
  }

  async function deleteTL(tl: PGTimeline) {
    if (!confirm(`Delete timeline "${tl.name}"?`)) return
    await api.delete(`/advisory/global/pg-recommendations/${pgId}/timelines/${tl.id}`)
    await loadTimelines()
  }

  if (!pg) return <AdminLayout><div className="pt-20 text-center text-slate-400">Loading…</div></AdminLayout>

  return (
    <AdminLayout>
      <div className="max-w-4xl space-y-6">
        <div>
          <Link href="/cha/global" className="text-xs text-slate-500 hover:text-slate-700">
            ← Back to CHA Library
          </Link>
        </div>
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
            </div>
            <p className="text-slate-500 text-sm mt-1">
              {AREA_PLANT_LABEL[pg.area_or_plant || ''] || '—'} · v{pg.version}
            </p>
            {!pgName && (
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                {pg.problem_group_cosh_id}
              </p>
            )}
          </div>
          {pg.status === 'DRAFT' && (
            <button onClick={handlePublish} disabled={publishing}
              className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
              {publishing ? 'Publishing…' : '✓ Publish'}
            </button>
          )}
        </div>

        {publishError && <p className="text-sm text-red-600">{publishError}</p>}

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
                <div key={tl.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50" onClick={() => toggle(tl.id)}>
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 text-sm">{tl.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{tl.from_type} · Day {tl.from_value} → {tl.to_value}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteTL(tl) }} className="text-slate-300 hover:text-red-400 p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded === tl.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {expanded === tl.id && (
                    <div className="border-t border-slate-100 px-5 py-4 space-y-2">
                      {!practiceMap[tl.id] ? <p className="text-xs text-slate-400">Loading…</p>
                       : practiceMap[tl.id].length === 0 ? <p className="text-xs text-slate-400">No practices yet.</p>
                       : practiceMap[tl.id].map(p => (
                        <div key={p.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${L0_COLOUR[p.l0_type] || 'bg-slate-100'}`}>{p.l0_type}</span>
                          <span className="text-sm text-slate-700 flex-1">{[p.l1_type, p.l2_type].filter(Boolean).join(' › ') || <span className="text-slate-400 italic">No sub-type</span>}</span>
                        </div>
                      ))}
                      <button onClick={() => setShowAddPractice(tl.id)} className="text-xs font-medium text-blue-600 mt-2">+ Add Practice</button>
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
                  <select value={tlForm.from_type} onChange={e => setTlForm(f => ({ ...f, from_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="DAYS_AFTER_DETECTION">Days After Detection</option>
                    <option value="DAYS_BEFORE_DETECTION">Days Before Detection</option>
                  </select>
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

        {showAddPractice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="p-6 border-b border-slate-100"><h2 className="font-bold text-slate-900">Add Practice</h2></div>
              <form onSubmit={handleAddPractice} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type (L0)</label>
                  <select value={practiceForm.l0_type} onChange={e => setPracticeForm(f => ({ ...f, l0_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="INPUT">INPUT</option>
                    <option value="NON_INPUT">NON_INPUT</option>
                    <option value="INSTRUCTION">INSTRUCTION</option>
                    <option value="MEDIA">MEDIA</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">L1</label>
                    <input value={practiceForm.l1_type} onChange={e => setPracticeForm(f => ({ ...f, l1_type: e.target.value }))}
                      placeholder="e.g. FUNGICIDE" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">L2</label>
                    <input value={practiceForm.l2_type} onChange={e => setPracticeForm(f => ({ ...f, l2_type: e.target.value }))}
                      placeholder="e.g. PROPICONAZOLE" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                  <input type="checkbox" checked={practiceForm.is_special_input}
                    onChange={e => setPracticeForm(f => ({ ...f, is_special_input: e.target.checked }))} className="w-4 h-4 rounded" />
                  Special input (adjuvant / never suppressed)
                </label>
                {practiceError && <p className="text-sm text-red-600">{practiceError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddPractice(null); setPracticeError('') }}
                    className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm">Cancel</button>
                  <button type="submit" disabled={addingPractice}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {addingPractice ? 'Adding…' : 'Add Practice'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
