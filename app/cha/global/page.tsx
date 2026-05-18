'use client'

// Batch V (2026-05-18) — SA-portal Global CHA-PG entry rebuilt to
// mirror the CA-PG flow shipped today (Batch T):
//
//   /cha/global                  → Problems grid (one card per Cosh PG,
//                                  showing Area-wise + Plant-wise status
//                                  pills). Click a card → /cha/global?pg=…
//
//   /cha/global?pg=<pg_cosh_id>  → Two side-by-side bundle cards
//                                  (Area-wise + Plant-wise) for the
//                                  selected PG. No Import / Export
//                                  (SA-side has none).
//
//   /cha/global/<rec_id>         → Existing detail editor (Timelines /
//                                  Practices / Version history) — its
//                                  back-arrow preserves the ?pg= filter.
//
// Behind the scenes: collapse the recommendation list to one head
// per (pg × bundle) lineage (DRAFT > ACTIVE > most recent INACTIVE),
// so the SA never sees the "4 v1 rows" pattern even after many
// edit-publish cycles.

import { useEffect, useMemo, useState, Suspense, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'

interface PGRec {
  id: string
  problem_group_cosh_id: string
  area_or_plant: 'AREA_WISE' | 'PLANT_WISE' | null
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  version: number
  created_at: string
  client_id: string | null
}

interface ProblemGroup {
  cosh_id: string
  name_en: string
  status: string
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
}

const BUNDLE_PILL: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
}

function bundleBadge(label: string, status: string | null) {
  if (!status) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-dashed border-slate-200 font-medium">
        {label}: not started
      </span>
    )
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${BUNDLE_PILL[status] || 'bg-slate-100 text-slate-500'}`}>
      {label}: {status}
    </span>
  )
}

function GlobalCHAContent() {
  const router = useRouter()
  const params = useSearchParams()
  const pgFilter = params.get('pg') || ''

  const [recs, setRecs] = useState<PGRec[]>([])
  const [problemGroups, setProblemGroups] = useState<ProblemGroup[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<{
    problem_group_cosh_id: string
    area_or_plant: 'AREA_WISE' | 'PLANT_WISE'
  }>({ problem_group_cosh_id: '', area_or_plant: 'AREA_WISE' })

  const load = () => {
    Promise.all([
      api.get<PGRec[]>('/advisory/global/pg-recommendations?include_drafts=true')
        .then(r => setRecs(r.data)),
      api.get<ProblemGroup[]>('/advisory/global/problem-groups')
        .then(r => setProblemGroups(r.data))
        .catch(() => setProblemGroups([])),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Batch V: collapse to one row per (pg × bundle) lineage. Head
  // precedence DRAFT > ACTIVE > most-recent INACTIVE. INACTIVE rows
  // are hidden — accessible from the detail page's Version History.
  const collapsedRecs = useMemo(() => {
    const STATUS_RANK: Record<string, number> = { DRAFT: 0, ACTIVE: 1, INACTIVE: 2 }
    const byLineage = new Map<string, PGRec>()
    for (const r of recs) {
      const key = `${r.problem_group_cosh_id}::${r.area_or_plant ?? ''}`
      const cur = byLineage.get(key)
      if (!cur) { byLineage.set(key, r); continue }
      const a = STATUS_RANK[r.status] ?? 99
      const b = STATUS_RANK[cur.status] ?? 99
      if (a < b) { byLineage.set(key, r); continue }
      if (a === b && new Date(r.created_at) > new Date(cur.created_at)) {
        byLineage.set(key, r)
      }
    }
    return Array.from(byLineage.values())
  }, [recs])

  const filteredPgName = useMemo(
    () => problemGroups.find(p => p.cosh_id === pgFilter)?.name_en || '',
    [pgFilter, problemGroups],
  )

  const openCreate = (preselect?: { pgId?: string; bundle?: 'AREA_WISE' | 'PLANT_WISE' }) => {
    setForm({
      problem_group_cosh_id: preselect?.pgId || pgFilter || '',
      area_or_plant: preselect?.bundle || 'AREA_WISE',
    })
    setError('')
    setShowCreate(true)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true); setError('')
    try {
      const { data: created } = await api.post<PGRec>(
        '/advisory/global/pg-recommendations',
        {
          problem_group_cosh_id: form.problem_group_cosh_id,
          area_or_plant: form.area_or_plant,
        },
      )
      setShowCreate(false)
      setForm({ problem_group_cosh_id: '', area_or_plant: 'AREA_WISE' })
      if (created?.id) {
        router.push(`/cha/global/${created.id}`)
      } else { load() }
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to create.'))
    } finally { setCreating(false) }
  }

  // ── Problems-grid view (no ?pg= filter) ────────────────────────
  const problemsWithStatus = useMemo(() => {
    return problemGroups.map(pg => {
      const area = collapsedRecs.find(
        r => r.problem_group_cosh_id === pg.cosh_id && r.area_or_plant === 'AREA_WISE',
      )
      const plant = collapsedRecs.find(
        r => r.problem_group_cosh_id === pg.cosh_id && r.area_or_plant === 'PLANT_WISE',
      )
      return {
        ...pg,
        area_status: area?.status || null,
        plant_status: plant?.status || null,
      }
    }).sort((a, b) => a.name_en.localeCompare(b.name_en))
  }, [problemGroups, collapsedRecs])

  if (loading) {
    return (
      <AdminLayout>
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">Loading…</div>
      </AdminLayout>
    )
  }

  // ── Bundle-cards view (one PG selected) ────────────────────────
  if (pgFilter) {
    const areaHead = collapsedRecs.find(
      r => r.problem_group_cosh_id === pgFilter && r.area_or_plant === 'AREA_WISE',
    )
    const plantHead = collapsedRecs.find(
      r => r.problem_group_cosh_id === pgFilter && r.area_or_plant === 'PLANT_WISE',
    )

    const renderCard = (
      bundle: 'AREA_WISE' | 'PLANT_WISE',
      head: PGRec | undefined,
    ) => {
      const label = bundle === 'AREA_WISE'
        ? 'Recommendations for Area-wise Crops'
        : 'Recommendations for Plant-wise Crops'
      const icon = bundle === 'AREA_WISE' ? '🟧' : '🟪'
      if (!head) {
        return (
          <div key={bundle}
            className="bg-white rounded-2xl border border-dashed border-slate-200 p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{icon}</span>
              <h3 className="font-semibold text-slate-800">{label}</h3>
            </div>
            <p className="text-slate-400 text-sm mb-6">Not started</p>
            <div className="mt-auto">
              <button onClick={() => openCreate({ pgId: pgFilter, bundle })}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
                + Add Recommendations
              </button>
            </div>
          </div>
        )
      }
      return (
        <Link key={bundle} href={`/cha/global/${encodeURIComponent(head.id)}`}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:border-blue-200 hover:shadow-md transition group">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{icon}</span>
            <h3 className="font-semibold text-slate-800">{label}</h3>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOUR[head.status]}`}>
              {head.status}
            </span>
            <span className="text-xs text-slate-500">v{head.version}</span>
          </div>
          <dl className="text-sm text-slate-600 space-y-1 mb-4">
            <div className="flex justify-between">
              <dt className="text-slate-400">Created</dt>
              <dd>{new Date(head.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>
          <div className="text-sm font-medium text-blue-600 group-hover:underline">
            Open Recommendations →
          </div>
        </Link>
      )
    }

    return (
      <AdminLayout>
        <div className="max-w-4xl space-y-6">
          <div className="flex items-start gap-3">
            <Link href="/cha/global"
              className="mt-1 text-slate-400 hover:text-slate-600"
              title="Back to all Problems">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900">
                {filteredPgName || pgFilter}
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">
                Global PG recommendations — up to two bundles, one for
                Area-wise crops and one for Plant-wise.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderCard('AREA_WISE', areaHead)}
            {renderCard('PLANT_WISE', plantHead)}
          </div>
        </div>

        {showCreate && renderCreateModal()}
      </AdminLayout>
    )
  }

  // ── Default: Problems grid ─────────────────────────────────────
  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global CHA Library</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Standard treatment recommendations per Problem Group. Each PG has
            two bundles — Area-wise and Plant-wise — that progress
            independently. Click a Problem Group to author or review.
          </p>
        </div>
      </div>

      {problemsWithStatus.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
          <p className="text-slate-400 text-4xl mb-3">🩺</p>
          <p className="text-slate-600 font-medium">No problem groups synced yet from Cosh.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {problemsWithStatus.map(p => {
            const activeCount =
              (p.area_status === 'ACTIVE' ? 1 : 0) +
              (p.plant_status === 'ACTIVE' ? 1 : 0)
            const draftCount =
              (p.area_status === 'DRAFT' ? 1 : 0) +
              (p.plant_status === 'DRAFT' ? 1 : 0)
            return (
              <Link key={p.cosh_id}
                href={`/cha/global?pg=${encodeURIComponent(p.cosh_id)}`}
                className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-3">
                  <p className="font-semibold text-slate-900 truncate">{p.name_en}</p>
                  <span className="text-xs text-slate-400 shrink-0 ml-2">
                    {activeCount > 0 && <>{activeCount} active</>}
                    {activeCount > 0 && draftCount > 0 && ' · '}
                    {draftCount > 0 && <>{draftCount} draft</>}
                    {activeCount === 0 && draftCount === 0 && <>not started</>}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {bundleBadge('Area', p.area_status)}
                  {bundleBadge('Plant', p.plant_status)}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {showCreate && renderCreateModal()}
    </AdminLayout>
  )

  function renderCreateModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div className="p-6 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">New Global PG Recommendation</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              Standard treatment for a Problem Group — clients import and
              adapt it for their crops + districts.
            </p>
          </div>
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Problem Group</label>
              <select value={form.problem_group_cosh_id}
                onChange={e => setForm(f => ({ ...f, problem_group_cosh_id: e.target.value }))}
                required disabled={!!pgFilter}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
                <option value="">— Pick a Problem Group —</option>
                {problemGroups.map(pg => (
                  <option key={pg.cosh_id} value={pg.cosh_id}>{pg.name_en}</option>
                ))}
              </select>
              {problemGroups.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">No problem groups loaded.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Bundle</label>
              <div className="flex gap-3">
                {(['AREA_WISE', 'PLANT_WISE'] as const).map(ap => (
                  <label key={ap} className="flex items-center gap-2 text-sm flex-1 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input type="radio" name="area_or_plant"
                      checked={form.area_or_plant === ap}
                      onChange={() => setForm(f => ({ ...f, area_or_plant: ap }))}
                    />
                    <span>{ap === 'AREA_WISE' ? 'Area-wise' : 'Plant-wise'}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Each (PG, bundle) is its own recommendation with its own publish lifecycle.
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowCreate(false); setError('') }}
                className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={creating || !form.problem_group_cosh_id}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }
}

export default function GlobalCHAPage() {
  return (
    <Suspense fallback={<AdminLayout><div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">Loading…</div></AdminLayout>}>
      <GlobalCHAContent />
    </Suspense>
  )
}
