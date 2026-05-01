'use client'
import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface PGRec {
  id: string; problem_group_cosh_id: string; application_type: string
  status: string; version: number; created_at: string; client_id: string | null
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
}

const APP_TYPES = ['SPRAY', 'DRENCH', 'SOIL', 'FOLIAR', 'SEED_TREATMENT', 'FERTIGATION', 'BASAL']

export default function GlobalCHAPage() {
  const [recs, setRecs] = useState<PGRec[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ problem_group_cosh_id: '', application_type: 'SPRAY' })

  const load = () => {
    api.get<PGRec[]>('/advisory/global/pg-recommendations')
      .then(r => setRecs(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true); setError('')
    try {
      await api.post('/advisory/global/pg-recommendations', form)
      setShowCreate(false)
      setForm({ problem_group_cosh_id: '', application_type: 'SPRAY' })
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to create.')
    } finally { setCreating(false) }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global CHA Library</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Standard treatment protocols for Problem Groups. Clients import and customise these for their territory.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
          + New PG Protocol
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">Loading…</div>
      ) : recs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
          <p className="text-slate-600 font-medium">No global CHA protocols yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Create standard treatment recommendations for common disease/pest Problem Groups. Clients will import and adapt them.
          </p>
          <button onClick={() => setShowCreate(true)}
            className="mt-4 bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
            Create First Protocol
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Problem Group ID</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Application</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">v</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recs.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5">
                    <Link href={`/cha/global/${r.id}`} className="font-mono text-sm text-slate-800 hover:text-blue-600">
                      {r.problem_group_cosh_id}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 hidden sm:table-cell text-xs">{r.application_type}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOUR[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-slate-400 text-xs">v{r.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">New Global PG Protocol</h2>
              <p className="text-slate-500 text-sm mt-0.5">Standard treatment for a Problem Group — will be available to all clients</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Problem Group Cosh ID</label>
                <input value={form.problem_group_cosh_id}
                  onChange={e => setForm(f => ({ ...f, problem_group_cosh_id: e.target.value }))}
                  required placeholder="e.g. pg_blast_rice"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                <p className="text-xs text-slate-400 mt-1">Use the Cosh reference ID for the Problem Group</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Application Type</label>
                <select value={form.application_type}
                  onChange={e => setForm(f => ({ ...f, application_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {APP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); setError('') }}
                  className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={creating}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create Protocol'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
