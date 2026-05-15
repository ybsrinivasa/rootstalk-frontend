'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface GlobalCcaCrop {
  crop_cosh_id: string
  name_en: string
  package_counts: Record<string, number>
  last_edited: string | null
}

export default function GlobalCcaCropsPage() {
  const [crops, setCrops] = useState<GlobalCcaCrop[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api.get<GlobalCcaCrop[]>('/advisory/global/cca/crops')
      .then(r => setCrops(r.data))
      .finally(() => setLoading(false))
  }, [])

  const lower = filter.trim().toLowerCase()
  const visible = lower
    ? crops.filter(c =>
        c.name_en.toLowerCase().includes(lower) ||
        c.crop_cosh_id.toLowerCase().includes(lower))
    : crops

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global CCA · Crops</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Every Cosh-classified crop. Click any crop to see (or start) its Global Packages.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/advisory/cosh-quality"
            className="text-xs font-medium border border-slate-200 hover:border-blue-300 hover:text-blue-700 rounded-xl px-3 py-2 text-slate-600">
            Cosh Data Quality →
          </Link>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by name…"
            className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">Loading…</div>
      ) : crops.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
          <p className="text-slate-600 font-medium">No Cosh crops synced yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Cosh hasn&apos;t classified any <code>biological_names</code> as Crop yet, or the sync
            hasn&apos;t run. Check Sync Log on the sidebar.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-dashed border-slate-200">
          No crops match “{filter}”.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map(c => {
            const total = Object.values(c.package_counts).reduce((a, b) => a + b, 0)
            return (
              <Link
                key={c.crop_cosh_id}
                href={`/advisory/global/packages?crop=${encodeURIComponent(c.crop_cosh_id)}`}
                className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{c.name_en}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate">{c.crop_cosh_id}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0 ml-2">
                    {total === 0 ? 'no packages' : `${total} pkg${total === 1 ? '' : 's'}`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {c.package_counts.DRAFT ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      {c.package_counts.DRAFT} DRAFT
                    </span>
                  ) : null}
                  {c.package_counts.ACTIVE ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      {c.package_counts.ACTIVE} ACTIVE
                    </span>
                  ) : null}
                  {c.package_counts.INACTIVE ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                      {c.package_counts.INACTIVE} INACTIVE
                    </span>
                  ) : null}
                  {total === 0 && (
                    <span className="text-[10px] text-slate-400 italic">no Global Package yet — click to start one</span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </AdminLayout>
  )
}
