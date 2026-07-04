'use client'
import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface MissingBrandReport {
  id: string
  dealer_user_id: string
  dealer_name: string | null
  dealer_phone: string | null
  order_item_id: string | null
  brand_name_reported: string; manufacturer_name: string | null
  l1_type: string | null
  l2_practice: string | null; additional_info: string | null
  photos: string[]
  status: string; cm_notes: string | null
  reviewed_at: string | null
  created_at: string
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
  const [reports, setReports] = useState<MissingBrandReport[]>([])
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = () =>
    api.get<MissingBrandReport[]>('/admin/missing-brand-reports')
      .then(r => setReports(r.data))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  async function updateStatus(id: string, status: string) {
    setActingOn(id)
    try {
      await api.put(`/admin/missing-brand-reports/${id}`, { status, cm_notes: notes[id] || '' })
      load()
    } finally { setActingOn(null) }
  }

  const pending = reports.filter(r => r.status === 'PENDING')
  const done = reports.filter(r => r.status !== 'PENDING')

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Brand Handling</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Review and action brand submissions from dealers who couldn&apos;t find a required brand
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
                {pending.map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900">{r.brand_name_reported}</p>
                        {r.manufacturer_name && <p className="text-xs text-slate-500 mt-0.5">Manufacturer: {r.manufacturer_name}</p>}
                        {(r.l1_type || r.l2_practice) && (
                          <p className="text-xs text-slate-500">
                            {r.l1_type ? <>Category: {r.l1_type}{r.l2_practice ? ' · ' : ''}</> : null}
                            {r.l2_practice && <>Sub-category: {r.l2_practice}</>}
                          </p>
                        )}
                        {r.additional_info && <p className="text-xs text-slate-400 mt-1 italic">{r.additional_info}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOUR[r.status]}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                    {/* 2026-07-04 — dealer contact block so SA can call
                        the submitter for clarification before deciding. */}
                    {(r.dealer_name || r.dealer_phone) && (
                      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-3 text-xs flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700 truncate">{r.dealer_name || 'Dealer'}</p>
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
                    {/* 2026-07-04 — product photo gallery (standalone
                        submissions ship 2-4; legacy order-context rows
                        may have zero — hidden when empty). */}
                    {r.photos && r.photos.length > 0 && (
                      <div className="flex gap-2 mb-3 overflow-x-auto">
                        {r.photos.map((url, i) => (
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
                      rows={2} placeholder="Note to the dealer (optional; shown on rejection)…"
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
                ))}
              </div>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Reviewed ({done.length})</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
                {done.map(r => (
                  <div key={r.id} className="px-5 py-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{r.brand_name_reported}</p>
                      {r.dealer_name && <p className="text-xs text-slate-500 mt-0.5">{r.dealer_name}{r.dealer_phone ? ` · ${r.dealer_phone}` : ''}</p>}
                      {r.cm_notes && <p className="text-xs text-slate-400 mt-0.5 italic">{r.cm_notes}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOUR[r.status]}`}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AdminLayout>
  )
}
