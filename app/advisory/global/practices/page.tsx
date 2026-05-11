'use client'
import { useEffect, useState, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface PracticeElement {
  element_type: string
  value: string | null
  unit_cosh_id: string | null
  cosh_ref: string | null
}

interface GlobalPractice {
  id: string
  l0_type: 'INPUT' | 'NON_INPUT' | 'INSTRUCTION' | 'MEDIA'
  l1_type: string | null
  l2_type: string | null
  display_order: number
  is_special_input: boolean
  frequency_days: number | null
  timeline_id: string
  timeline_name: string
  package_id: string
  package_name: string
  package_status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  crop_cosh_id: string
  crop_name_en: string
  element_summary: PracticeElement[]
}

interface PracticesResp {
  items: GlobalPractice[]
  total: number
  limit: number
  offset: number
}

const L0_COLOUR: Record<string, string> = {
  INPUT: 'bg-blue-100 text-blue-700',
  NON_INPUT: 'bg-purple-100 text-purple-700',
  INSTRUCTION: 'bg-amber-100 text-amber-700',
  MEDIA: 'bg-pink-100 text-pink-700',
}

function GlobalPracticesContent() {
  const router = useRouter()
  const params = useSearchParams()
  const cropFilter = params.get('crop') || ''
  const packageFilter = params.get('package') || ''
  const timelineFilter = params.get('timeline') || ''
  const l0Filter = params.get('l0') || ''
  const l1Filter = params.get('l1') || ''

  const [data, setData] = useState<PracticesResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 100

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (cropFilter) qs.set('crop_cosh_id', cropFilter)
    if (packageFilter) qs.set('package_id', packageFilter)
    if (timelineFilter) qs.set('timeline_id', timelineFilter)
    if (l0Filter) qs.set('l0', l0Filter)
    if (l1Filter) qs.set('l1', l1Filter)
    qs.set('limit', String(limit))
    qs.set('offset', String(offset))
    api.get<PracticesResp>(`/advisory/global/cca/practices?${qs.toString()}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [cropFilter, packageFilter, timelineFilter, l0Filter, l1Filter, offset])

  const rows = data?.items || []
  const total = data?.total || 0

  const chips = useMemo(() => {
    const out: { key: string; label: string }[] = []
    if (cropFilter) out.push({ key: 'crop', label: `Crop: ${rows[0]?.crop_name_en || cropFilter}` })
    if (packageFilter) out.push({ key: 'package', label: `Package: ${rows[0]?.package_name || packageFilter}` })
    if (timelineFilter) out.push({ key: 'timeline', label: `Timeline: ${rows[0]?.timeline_name || timelineFilter}` })
    if (l0Filter) out.push({ key: 'l0', label: `L0: ${l0Filter}` })
    if (l1Filter) out.push({ key: 'l1', label: `L1: ${l1Filter}` })
    return out
  }, [cropFilter, packageFilter, timelineFilter, l0Filter, l1Filter, rows])

  function removeChip(key: string) {
    const qs = new URLSearchParams(params.toString())
    qs.delete(key)
    const q = qs.toString()
    router.replace('/advisory/global/practices' + (q ? `?${q}` : ''))
    setOffset(0)
  }

  return (
    <AdminLayout>
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">Global CCA · Practices</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Every practice across every Global Package. {total > 0 && <>Showing {rows.length} of {total}.</>}
        </p>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {chips.map(c => (
            <button key={c.key} onClick={() => removeChip(c.key)}
              className="inline-flex items-center gap-2 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-100">
              {c.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
          <p className="text-slate-600 font-medium">
            {chips.length > 0 ? 'No practices match the active filters.' : 'No practices yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Practice</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Timeline</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Package</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Crop</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-700">
                      {[p.l1_type, p.l2_type].filter(Boolean).join(' › ') || <span className="text-slate-400 italic">No sub-type</span>}
                    </span>
                    {p.is_special_input && (
                      <span className="ml-2 text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">special</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 hidden sm:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${L0_COLOUR[p.l0_type] || 'bg-slate-100'}`}>
                      {p.l0_type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/advisory/global/timelines?package=${encodeURIComponent(p.package_id)}`}
                      className="text-slate-600 text-xs hover:text-blue-600">
                      {p.timeline_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <Link href={`/advisory/global/${p.package_id}`}
                      className="text-slate-600 text-xs hover:text-blue-600">
                      {p.package_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 hidden lg:table-cell text-xs">{p.crop_name_en}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > limit && (
            <div className="px-5 py-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
              <span>{offset + 1}–{Math.min(offset + rows.length, total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-50">Prev</button>
                <button onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  )
}

export default function GlobalPracticesPage() {
  return (
    <Suspense fallback={<AdminLayout><div className="pt-20 text-center text-slate-400">Loading…</div></AdminLayout>}>
      <GlobalPracticesContent />
    </Suspense>
  )
}
