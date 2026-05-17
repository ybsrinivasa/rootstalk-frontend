'use client'

// Batch 39P-a (2026-05-16) — SA-portal Global CHA-PG list.
//
// Authoring flow: pick a Problem Group from Cosh's catalogue, choose
// the bundle dimension (AREA_WISE / PLANT_WISE), and land on a fresh
// DRAFT recommendation row that the CM fills in with timelines /
// practices on the detail page. The PG detail editor reuses the
// same Timeline → Practice → Element schema as CCA after Batch 39O
// UCAT unification — same Brand Lock, frequency, Relations, CQs.

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'

interface PGRec {
  id: string
  problem_group_cosh_id: string
  area_or_plant: string | null
  status: string
  version: number
  created_at: string
  client_id: string | null
}

interface ProblemGroup {
  cosh_id: string
  name_en: string
  status: string
}

interface CropItem {
  cosh_id: string
  name_en: string
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

export default function GlobalCHAPage() {
  const router = useRouter()
  const [recs, setRecs] = useState<PGRec[]>([])
  const [problemGroups, setProblemGroups] = useState<ProblemGroup[]>([])
  const [cropsByPg, setCropsByPg] = useState<Record<string, CropItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<{
    problem_group_cosh_id: string
    area_or_plant: 'AREA_WISE' | 'PLANT_WISE'
  }>({ problem_group_cosh_id: '', area_or_plant: 'AREA_WISE' })

  const load = () => {
    // SA/CM admin view — show DRAFT + ACTIVE + INACTIVE rows.
    // The default ACTIVE-only filter is for the CA-portal SE
    // Import flow; here we need to see drafts being authored.
    api.get<PGRec[]>('/advisory/global/pg-recommendations?include_drafts=true')
      .then(r => setRecs(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    api.get<ProblemGroup[]>('/advisory/global/problem-groups')
      .then(r => setProblemGroups(r.data))
      .catch(() => setProblemGroups([]))
  }, [])

  // Map cosh_id → display name for the list rows.
  const pgNameMap = problemGroups.reduce<Record<string, string>>(
    (acc, p) => { acc[p.cosh_id] = p.name_en; return acc }, {},
  )

  // Fetch applicable crops per distinct PG cosh_id surfaced in the
  // recommendation list. One round-trip per unique PG; result cached
  // for the lifetime of this page mount. Empty array (rather than
  // missing key) lets us distinguish "no rows in sp_pg_crops" from
  // "still loading".
  useEffect(() => {
    const distinct = Array.from(new Set(recs.map(r => r.problem_group_cosh_id)))
    const pending = distinct.filter(id => !(id in cropsByPg))
    if (pending.length === 0) return
    pending.forEach(pgId => {
      api.get<{ items: CropItem[] }>(`/diagnosis/pg-crops?pg=${encodeURIComponent(pgId)}`)
        .then(r => setCropsByPg(prev => ({ ...prev, [pgId]: r.data.items || [] })))
        .catch(() => setCropsByPg(prev => ({ ...prev, [pgId]: [] })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs])

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
      // Land the CM on the new PG's editor so the "what next?" is
      // obvious (add timelines). Falls back to a list refresh if the
      // POST response is missing an id for any reason.
      if (created?.id) {
        router.push(`/cha/global/${created.id}`)
      } else {
        load()
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to create.'))
    } finally { setCreating(false) }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global CHA Library</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Standard treatment recommendations for Problem Groups. Clients
            import these into their scope and adapt for their territory.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
          + New PG Recommendation
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">Loading…</div>
      ) : recs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
          <p className="text-slate-600 font-medium">No global PG recommendations yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Create a recommendation for a Problem Group. Clients will import
            and adapt it for their crops + districts.
          </p>
          <button onClick={() => setShowCreate(true)}
            className="mt-4 bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
            Create First Recommendation
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Problem Group</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Bundle</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">v</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recs.map(r => {
                const crops = cropsByPg[r.problem_group_cosh_id]
                const cropsLoaded = crops !== undefined
                const visibleCrops = cropsLoaded ? crops.slice(0, 5) : []
                const overflowCount = cropsLoaded ? Math.max(0, crops.length - visibleCrops.length) : 0
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <Link href={`/cha/global/${r.id}`} className="text-sm font-medium text-slate-800 hover:text-blue-600">
                        {pgNameMap[r.problem_group_cosh_id] || r.problem_group_cosh_id}
                      </Link>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{r.problem_group_cosh_id}</p>
                      {cropsLoaded && crops.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1" title={`Applicable crops (from Cosh sp_pg_crops, ${crops.length} total)`}>
                          {visibleCrops.map(c => (
                            <span key={c.cosh_id} className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                              {c.name_en}
                            </span>
                          ))}
                          {overflowCount > 0 && (
                            <span className="text-[10px] text-slate-500 px-1.5 py-0.5">+{overflowCount} more</span>
                          )}
                        </div>
                      )}
                      {cropsLoaded && crops.length === 0 && (
                        <p className="text-[10px] text-slate-300 mt-1.5 italic">No crops linked in sp_pg_crops</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 hidden sm:table-cell text-xs">
                      {AREA_PLANT_LABEL[r.area_or_plant || ''] || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOUR[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-400 text-xs">v{r.version}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">New Global PG Recommendation</h2>
              <p className="text-slate-500 text-sm mt-0.5">Standard treatment for a Problem Group — will be available to all clients to import.</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Problem Group</label>
                <select value={form.problem_group_cosh_id}
                  onChange={e => setForm(f => ({ ...f, problem_group_cosh_id: e.target.value }))}
                  required
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
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
                      <span>{AREA_PLANT_LABEL[ap]}</span>
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
      )}
    </AdminLayout>
  )
}
