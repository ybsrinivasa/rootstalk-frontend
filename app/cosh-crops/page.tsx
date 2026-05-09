'use client'
import { useState, useEffect, useMemo } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type CoshCrop = {
  cosh_id: string
  name_en: string
  status: string
}

export default function CoshCropsPage() {
  const [crops, setCrops] = useState<CoshCrop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/admin/cosh/crops')
      setCrops(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load crops')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!filter.trim()) return crops
    const q = filter.toLowerCase()
    return crops.filter(c =>
      c.name_en.toLowerCase().includes(q) || c.cosh_id.toLowerCase().includes(q),
    )
  }, [crops, filter])

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cosh Crops</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Crops Cosh has classified — pickable by CAs when they add a crop to their company.
          </p>
        </div>
        <button onClick={load}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium">
          ↻ Refresh
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5 text-sm text-blue-800">
        <strong>Source:</strong> Cosh&apos;s `biological_names` Core, filtered to items
        classified with role <em>Crop</em> via the
        `biological_names_and_roles` Connect.
        <br />
        <span className="text-blue-600 text-xs mt-1 block">
          Translations, area-wise / plant-wise typing, and scientific names will arrive in subsequent Cosh syncs.
          Until area/plant typing lands, CA &quot;Add Crop&quot; will surface a 422 (`crop_missing_measure`) when
          a CA picks any crop here — by design.
        </span>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or cosh_id…"
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
        <span className="text-xs text-slate-500">
          {filtered.length}{filtered.length !== crops.length ? ` of ${crops.length}` : ''} crops
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {error
          ? <p className="text-center py-12 text-red-500 text-sm">{error}</p>
          : loading
            ? <p className="text-center py-12 text-slate-400">Loading…</p>
            : filtered.length === 0
              ? <p className="text-center py-12 text-slate-400">
                  {crops.length === 0
                    ? 'No crops have been synced from Cosh yet.'
                    : 'No crops match the current filter.'}
                </p>
              : <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Name (English)</th>
                    <th className="px-5 py-3 text-left font-semibold">Cosh ID</th>
                    <th className="px-5 py-3 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.cosh_id} className="border-t border-slate-100">
                      <td className="px-5 py-3 text-slate-900">{c.name_en}</td>
                      <td className="px-5 py-3 text-slate-500 font-mono text-xs">{c.cosh_id}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        }
      </div>
    </AdminLayout>
  )
}
