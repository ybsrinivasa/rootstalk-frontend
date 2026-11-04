'use client'
import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

// 2026-11-04 — Split into summary (list payload) + detail (lazy-fetched
// on expand). The list used to carry manufacturer / l1-l2 taxonomy /
// additional_info / photos for every row, which bloated as the archive
// grew. Now the heavy fields come down one row at a time, when the SA
// actually expands the row.

interface MissingBrandSummary {
  id: string
  // 2026-09-24: `dealer_user_id` / `dealer_name` / `dealer_phone` are
  // legacy column names — they hold the SUBMITTER's identity, which
  // can be a Dealer OR a Farmer since the v2 Checkbox 3 arc added the
  // farmer purchase-ack "Other" free-text path. `source` disambiguates.
  dealer_user_id: string
  dealer_name: string | null
  dealer_phone: string | null
  source: 'DEALER' | 'FARMER'
  brand_name_reported: string
  status: string
  cm_notes: string | null
  reviewed_at: string | null
  created_at: string
}

interface MissingBrandDetail extends MissingBrandSummary {
  order_item_id: string | null
  manufacturer_name: string | null
  l1_type: string | null
  l2_practice: string | null
  additional_info: string | null
  photos: string[]
}

type DetailState = 'loading' | 'error' | MissingBrandDetail

const SOURCE_LABEL: Record<string, string> = {
  DEALER: 'Dealer',
  FARMER: 'Farmer',
}
const SOURCE_COLOUR: Record<string, string> = {
  DEALER: 'bg-purple-100 text-purple-700 border border-purple-200',
  FARMER: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
}

// 2026-07-04 — user-facing terminology maps PENDING→"Submitted",
// APPROVED→"Included". The backend enum values stay stable.
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Submitted',
  REVIEWED: 'Under Review',
  APPROVED: 'Included',
  REJECTED: 'Rejected',
}
const STATUS_COLOUR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  REVIEWED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-600',
}

export default function BrandHandlingPage() {
  const [reports, setReports] = useState<MissingBrandSummary[]>([])
  const [details, setDetails] = useState<Record<string, DetailState>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [showRejected, setShowRejected] = useState(false)

  const load = () =>
    api.get<MissingBrandSummary[]>('/admin/missing-brand-reports')
      .then(r => setReports(r.data))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  // Auto-fetch detail for each PENDING row. SAs need manufacturer /
  // category / photos to decide whether to Include or Reject — making
  // them click to expand each one would just add friction without
  // saving meaningful bandwidth (PENDING is usually a short list).
  // REVIEWED stays lazy-fetch-on-expand.
  const fetchDetail = useCallback(async (id: string) => {
    setDetails(prev => {
      const current = prev[id]
      if (current === 'loading' || (current && current !== 'error')) return prev
      return { ...prev, [id]: 'loading' }
    })
    try {
      const { data } = await api.get<MissingBrandDetail>(
        `/admin/missing-brand-reports/${id}`,
      )
      setDetails(prev => ({ ...prev, [id]: data }))
    } catch {
      setDetails(prev => ({ ...prev, [id]: 'error' }))
    }
  }, [])

  useEffect(() => {
    for (const r of reports) {
      if (r.status === 'PENDING' && details[r.id] === undefined) {
        fetchDetail(r.id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next }
      next.add(id)
      if (details[id] === undefined || details[id] === 'error') fetchDetail(id)
      return next
    })
  }

  async function updateStatus(id: string, status: string) {
    setActingOn(id)
    try {
      await api.put(`/admin/missing-brand-reports/${id}`, {
        status, cm_notes: notes[id] || '',
      })
      load()
    } finally { setActingOn(null) }
  }

  async function deleteReport(id: string, brandName: string) {
    if (!confirm(`Delete rejected report "${brandName}"? This cannot be undone.`)) return
    setActingOn(id)
    try {
      await api.delete(`/admin/missing-brand-reports/${id}`)
      setReports(prev => prev.filter(r => r.id !== id))
      setDetails(prev => {
        const { [id]: _drop, ...rest } = prev
        return rest
      })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: { message?: string } | string } } }
      const detail = err?.response?.data?.detail
      const msg = typeof detail === 'object' ? detail?.message : (detail as string)
      alert(msg || 'Could not delete that report.')
    } finally { setActingOn(null) }
  }

  const pending = reports.filter(r => r.status === 'PENDING')
  const doneAll = reports.filter(r => r.status !== 'PENDING')
  const done = showRejected ? doneAll : doneAll.filter(r => r.status !== 'REJECTED')
  const rejectedHiddenCount = doneAll.length - done.length

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Brand Handling</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Review and action brand submissions from dealers and farmers who couldn&apos;t find a required brand
        </p>
        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <p className="text-xs text-blue-700">
            <strong>Privilege required:</strong> Brand Handling — when approved, the brand is added to Cosh so it appears in future orders.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <p className="text-3xl mb-3">✓</p>
          <p className="text-slate-500 font-medium">No missing brand reports</p>
        </div>
      ) : (
        <div className="space-y-5">
          {pending.length > 0 && (
            <section>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Pending Review ({pending.length})</p>
              <div className="space-y-3">
                {pending.map(r => {
                  const detail = details[r.id]
                  const loaded = detail && detail !== 'loading' && detail !== 'error' ? detail : null
                  return (
                    <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900">{r.brand_name_reported}</p>
                          {loaded?.manufacturer_name && <p className="text-xs text-slate-500 mt-0.5">Manufacturer: {loaded.manufacturer_name}</p>}
                          {loaded && (loaded.l1_type || loaded.l2_practice) && (
                            <p className="text-xs text-slate-500">
                              {loaded.l1_type ? <>Category: {loaded.l1_type}{loaded.l2_practice ? ' · ' : ''}</> : null}
                              {loaded.l2_practice && <>Sub-category: {loaded.l2_practice}</>}
                            </p>
                          )}
                          {loaded?.additional_info && <p className="text-xs text-slate-400 mt-1 italic">{loaded.additional_info}</p>}
                          {detail === 'loading' && <p className="text-xs text-slate-400 mt-1">Loading details…</p>}
                          {detail === 'error' && (
                            <button onClick={() => fetchDetail(r.id)}
                              className="text-xs text-red-600 hover:underline mt-1">
                              Details failed to load. Retry.
                            </button>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOUR[r.status]}`}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                      </div>
                      {/* Submitter contact block. */}
                      {(r.dealer_name || r.dealer_phone) && (
                        <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-3 text-xs flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-slate-700 truncate">
                                {r.dealer_name || SOURCE_LABEL[r.source] || 'Submitter'}
                              </p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${SOURCE_COLOUR[r.source] || 'bg-slate-100 text-slate-600'}`}>
                                {SOURCE_LABEL[r.source] || r.source}
                              </span>
                            </div>
                            {r.dealer_phone && <p className="text-slate-400 font-mono">{r.dealer_phone}</p>}
                          </div>
                          {r.dealer_phone && (
                            <a href={`tel:${r.dealer_phone}`}
                              className="shrink-0 text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-white font-medium">
                              📞 Call
                            </a>
                          )}
                        </div>
                      )}
                      {loaded && loaded.photos.length > 0 && (
                        <div className="flex gap-2 mb-3 overflow-x-auto">
                          {loaded.photos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              className="shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="" className="h-24 w-24 object-cover rounded-lg border border-slate-200" />
                            </a>
                          ))}
                        </div>
                      )}
                      <textarea value={notes[r.id] || ''}
                        onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
                        rows={2}
                        placeholder={`Note to the ${r.source === 'FARMER' ? 'farmer' : 'dealer'} (optional; shown on rejection)…`}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none mb-3 resize-none" />
                      <div className="flex gap-2">
                        <button onClick={() => updateStatus(r.id, 'APPROVED')} disabled={actingOn === r.id}
                          className="flex-1 py-2 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                          {actingOn === r.id ? '…' : '✓ Include'}
                        </button>
                        <button onClick={() => updateStatus(r.id, 'REJECTED')} disabled={actingOn === r.id}
                          className="flex-1 py-2 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
                          ✗ Reject
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          {(done.length > 0 || rejectedHiddenCount > 0) && (
            <section>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Reviewed ({done.length})
                </p>
                {(rejectedHiddenCount > 0 || showRejected) && (
                  <button onClick={() => setShowRejected(v => !v)}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline">
                    {showRejected
                      ? 'Hide rejected'
                      : `Show rejected (${rejectedHiddenCount})`}
                  </button>
                )}
              </div>
              {done.length === 0 ? (
                <p className="text-sm text-slate-400 italic">
                  No reviewed submissions outside the rejected ones.
                </p>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
                  {done.map(r => {
                    const isExpanded = expanded.has(r.id)
                    const detail = details[r.id]
                    const loaded = detail && detail !== 'loading' && detail !== 'error' ? detail : null
                    return (
                      <div key={r.id} className="px-5 py-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <button onClick={() => toggleExpand(r.id)}
                            className="min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-slate-400">{isExpanded ? '▼' : '▶'}</span>
                              <p className="text-sm font-semibold text-slate-700 truncate">{r.brand_name_reported}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${SOURCE_COLOUR[r.source] || 'bg-slate-100 text-slate-600'}`}>
                                {SOURCE_LABEL[r.source] || r.source}
                              </span>
                            </div>
                            {r.dealer_name && <p className="text-xs text-slate-500 mt-0.5 pl-5">{r.dealer_name}{r.dealer_phone ? ` · ${r.dealer_phone}` : ''}</p>}
                            {r.cm_notes && <p className="text-xs text-slate-400 mt-0.5 pl-5 italic">{r.cm_notes}</p>}
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOUR[r.status]}`}>
                              {STATUS_LABEL[r.status] || r.status}
                            </span>
                            {r.status === 'REJECTED' && (
                              <button
                                onClick={() => deleteReport(r.id, r.brand_name_reported)}
                                disabled={actingOn === r.id}
                                className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50">
                                {actingOn === r.id ? 'Deleting…' : 'Delete'}
                              </button>
                            )}
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="mt-3 ml-5 pt-3 border-t border-slate-100 text-xs space-y-2">
                            {detail === 'loading' && (
                              <p className="text-slate-400">Loading details…</p>
                            )}
                            {detail === 'error' && (
                              <button onClick={() => fetchDetail(r.id)}
                                className="text-red-600 hover:underline">
                                Could not load details. Retry.
                              </button>
                            )}
                            {loaded && (
                              <>
                                {loaded.manufacturer_name && (
                                  <p className="text-slate-600">
                                    <span className="font-semibold">Manufacturer:</span> {loaded.manufacturer_name}
                                  </p>
                                )}
                                {(loaded.l1_type || loaded.l2_practice) && (
                                  <p className="text-slate-600">
                                    <span className="font-semibold">Category:</span>{' '}
                                    {loaded.l1_type}
                                    {loaded.l2_practice ? ` · ${loaded.l2_practice}` : ''}
                                  </p>
                                )}
                                {loaded.additional_info && (
                                  <p className="text-slate-600">
                                    <span className="font-semibold">Additional info:</span>{' '}
                                    <span className="italic">{loaded.additional_info}</span>
                                  </p>
                                )}
                                {loaded.photos.length > 0 && (
                                  <div>
                                    <p className="font-semibold text-slate-600 mb-1.5">Photos</p>
                                    <div className="flex gap-2 overflow-x-auto">
                                      {loaded.photos.map((url, i) => (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                          className="shrink-0">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={url} alt="" className="h-24 w-24 object-cover rounded-lg border border-slate-200" />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {!loaded.manufacturer_name && !loaded.l1_type && !loaded.l2_practice
                                  && !loaded.additional_info && loaded.photos.length === 0 && (
                                  <p className="text-slate-400 italic">No additional details were submitted with this report.</p>
                                )}
                                {r.reviewed_at && (
                                  <p className="text-slate-400 text-[10px] pt-1">
                                    Reviewed {new Date(r.reviewed_at).toLocaleString()}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </AdminLayout>
  )
}
