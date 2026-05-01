'use client'
import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface Package {
  id: string; name: string; crop_cosh_id: string
  package_type: 'ANNUAL' | 'PERENNIAL'
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  duration_days: number; version: number; description: string | null; created_at: string
}

const STATUS_COLOUR = {
  DRAFT: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
}

export default function GlobalPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '', crop_cosh_id: '', package_type: 'ANNUAL',
    duration_days: '120', description: '',
  })

  const load = () => {
    api.get<Package[]>('/advisory/global/packages')
      .then(r => setPackages(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true); setError('')
    try {
      await api.post('/advisory/global/packages', {
        ...form, duration_days: parseInt(form.duration_days),
      })
      setShowCreate(false)
      setForm({ name: '', crop_cosh_id: '', package_type: 'ANNUAL', duration_days: '120', description: '' })
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to create package.')
    } finally { setCreating(false) }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global CCA Library</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Master Package of Practices templates. Clients fork these to create their own customised copies.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
          + New Global Package
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">Loading…</div>
      ) : packages.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
          <p className="text-slate-600 font-medium">No global packages yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Create standard Package of Practices templates here. Clients will import and customise them for their territory.
          </p>
          <button onClick={() => setShowCreate(true)}
            className="mt-4 bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
            Create First Template
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Package Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Crop ID</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {packages.map(pkg => (
                <tr key={pkg.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5">
                    <Link href={`/advisory/global/${pkg.id}`}
                      className="font-medium text-slate-800 hover:text-blue-600">{pkg.name}</Link>
                    {pkg.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{pkg.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 hidden md:table-cell font-mono text-xs">{pkg.crop_cosh_id}</td>
                  <td className="px-5 py-3.5 text-slate-500 hidden sm:table-cell capitalize text-xs">{pkg.package_type.toLowerCase()}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOUR[pkg.status]}`}>{pkg.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-slate-400 text-xs">{pkg.duration_days}d</td>
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
              <h2 className="font-bold text-slate-900">New Global Package Template</h2>
              <p className="text-slate-500 text-sm mt-0.5">This package will be available to all clients to fork and customise</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Package Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required placeholder="e.g. Standard Kharif Paddy PoP"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Crop ID (Cosh)</label>
                <input value={form.crop_cosh_id} onChange={e => setForm(f => ({ ...f, crop_cosh_id: e.target.value }))}
                  required placeholder="e.g. crop_paddy_kharif"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
                  <select value={form.package_type} onChange={e => setForm(f => ({ ...f, package_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="ANNUAL">Annual</option>
                    <option value="PERENNIAL">Perennial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Duration (days)</label>
                  <input type="number" min="1" value={form.duration_days}
                    onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description (optional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="What crop stage does this cover?"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); setError('') }}
                  className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={creating}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
