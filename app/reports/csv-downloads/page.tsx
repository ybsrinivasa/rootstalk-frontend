'use client'

// CSV Download Audit (SA-only, 2026-11-21).
//
// Reads `report_csv_downloads` populated by every CP CSV export.
// Generic by design — any future audited CSV endpoint (farmer
// activity, orders, promoters, etc.) shows up here with its own
// `report_name`, no UI change required.
//
// Access: SA-only; backend enforces via `_require_sa` on
// /admin/sa/reports/csv-downloads. Sidebar entry at /reports/csv-
// downloads is also gated to SA.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'

interface AuditRow {
  id: string
  downloaded_at: string | null
  report_name: string
  row_count: number | null
  filters_json: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  user: { id: string; name: string; email: string; phone: string } | null
  client: { id: string; display_name: string } | null
}

interface AuditPayload {
  rows: AuditRow[]
  total: number
  page: number
  page_size: number
  report_names: string[]
}

const PAGE_SIZE = 50

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function CsvDownloadsAuditPage() {
  const [data, setData] = useState<AuditPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [reportName, setReportName] = useState('')
  const [clientId, setClientId] = useState('')
  const [userId, setUserId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const filterSignature = `${reportName}|${clientId}|${userId}|${fromDate}|${toDate}`

  useEffect(() => { setPage(1) }, [filterSignature])

  const fetchGen = useRef(0)
  useEffect(() => {
    const myGen = ++fetchGen.current
    setLoading(true); setError('')
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('page_size', String(PAGE_SIZE))
    if (reportName) params.set('report_name', reportName)
    if (clientId) params.set('client_id', clientId)
    if (userId) params.set('user_id', userId)
    if (fromDate) params.set('period_from', new Date(`${fromDate}T00:00:00`).toISOString())
    if (toDate) {
      const d = new Date(`${toDate}T00:00:00`)
      d.setDate(d.getDate() + 1)
      params.set('period_to', d.toISOString())
    }
    api
      .get<AuditPayload>(`/admin/sa/reports/csv-downloads?${params.toString()}`)
      .then(res => {
        if (fetchGen.current !== myGen) return
        setData(res.data)
        setExpanded(new Set())
      })
      .catch(err => {
        if (fetchGen.current !== myGen) return
        setError(extractErrorMessage(err, 'Could not load the audit log.'))
      })
      .finally(() => {
        if (fetchGen.current !== myGen) return
        setLoading(false)
      })
  }, [page, reportName, clientId, userId, fromDate, toDate])

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setReportName(''); setClientId(''); setUserId('')
    setFromDate(''); setToDate('')
  }, [])

  const anyFilter = !!(reportName || clientId || userId || fromDate || toDate)
  const total = data?.total ?? 0
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1
  const rows = data?.rows ?? []

  const reportNameOptions = useMemo(
    () => data?.report_names ?? [],
    [data?.report_names],
  )

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Audit
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            CSV download audit
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Every CSV export from every CA Portal is logged here with the
            filters used and the originating IP. Kept for compliance review;
            no automatic retention.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-slate-500">Report</span>
              <select
                value={reportName}
                onChange={e => setReportName(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="">All reports</option>
                {reportNameOptions.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-slate-500">Company (client_id)</span>
              <input
                type="text"
                value={clientId}
                onChange={e => setClientId(e.target.value.trim())}
                placeholder="uuid"
                className="border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-slate-500">User (user_id)</span>
              <input
                type="text"
                value={userId}
                onChange={e => setUserId(e.target.value.trim())}
                placeholder="uuid"
                className="border border-slate-200 rounded-lg px-3 py-2 bg-white font-mono text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-slate-500">From</span>
              <input
                type="date"
                value={fromDate}
                max={toDate || toYmd(new Date())}
                onChange={e => setFromDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-slate-500">To</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                max={toYmd(new Date())}
                onChange={e => setToDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
              />
            </label>
            {anyFilter && (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm text-slate-600">
              {loading ? 'Loading…' : `${total.toLocaleString()} download${total === 1 ? '' : 's'}`}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              Page {page} of {totalPages}
            </span>
          </header>

          {error && (
            <div className="mx-5 my-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {rows.length === 0 && !loading && (
              <p className="px-5 py-12 text-center text-sm text-slate-400">
                No CSV downloads match the current filters.
              </p>
            )}
            {rows.map(r => {
              const isOpen = expanded.has(r.id)
              return (
                <div key={r.id} className="px-5 py-3 text-sm">
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    className="w-full text-left"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="text-xs text-slate-400 tabular-nums w-44 shrink-0">
                        {fmtDateTime(r.downloaded_at)}
                      </span>
                      <span className="font-medium text-slate-800 min-w-[9rem]">
                        {r.user?.name || '—'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {r.user?.email || r.user?.phone || ''}
                      </span>
                      <span className="text-xs text-slate-500">
                        · {r.client?.display_name || '—'}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-3 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
                          {r.report_name}
                        </span>
                        {r.row_count !== null && (
                          <span className="text-slate-500 tabular-nums">
                            {r.row_count.toLocaleString()} rows
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="mt-3 ml-44 pl-4 border-l-2 border-slate-100 text-xs text-slate-700 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-slate-500">
                        <div>
                          <span className="uppercase tracking-wider text-[10px] text-slate-400 font-semibold">User id</span>
                          <p className="font-mono">{r.user?.id || '—'}</p>
                        </div>
                        <div>
                          <span className="uppercase tracking-wider text-[10px] text-slate-400 font-semibold">Client id</span>
                          <p className="font-mono">{r.client?.id || '—'}</p>
                        </div>
                        <div>
                          <span className="uppercase tracking-wider text-[10px] text-slate-400 font-semibold">IP</span>
                          <p className="font-mono">{r.ip_address || '—'}</p>
                        </div>
                        <div>
                          <span className="uppercase tracking-wider text-[10px] text-slate-400 font-semibold">User agent</span>
                          <p className="font-mono break-all">{r.user_agent || '—'}</p>
                        </div>
                      </div>
                      <div>
                        <span className="uppercase tracking-wider text-[10px] text-slate-400 font-semibold">Filters applied</span>
                        <pre className="mt-1 bg-slate-50 border border-slate-100 rounded-lg p-3 text-[11px] font-mono overflow-x-auto">
{JSON.stringify(r.filters_json || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-sm">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:border-slate-400 disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-xs text-slate-500 tabular-nums">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:border-slate-400 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}
