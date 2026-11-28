'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface UserResult {
  id: string; name: string | null; phone: string | null; email: string | null
  district: string | null; state: string | null; clients: string[]
}

// 2026-11-28 — Cross-tenant summary powering the home tiles +
// Top-5 clients strip. Endpoint `/admin/rm/alerts-summary` does
// one DB round-trip and mirrors the five CA Farmer Support alert
// types. `sub_scan_capped` warns the SA that input_due /
// missed_inputs are approximate (capped at 500 subs scanned).
interface AlertsSummary {
  totals: {
    start_date_pending: number
    input_due: number
    missed_inputs: number
    open_expert_queries: number
    lapsed_farmers: number
    open_cases: number
  }
  top_clients: Array<{ client_id: string; client_name: string; total_alerts: number }>
  sub_scan_capped: boolean
}

// Each tile's icon — inline heroicons-style stroke paths, no
// library dep (matches the CA Dashboard treatment).
const ICON: Record<string, React.ReactNode> = {
  start_date_pending: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
  input_due: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  missed_inputs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
  open_expert_queries: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  ),
  lapsed_farmers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
  open_cases: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
}

export default function RMHomePage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserResult[]>([])
  const [searching, setSearching] = useState(false)
  const [summary, setSummary] = useState<AlertsSummary | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 2026-11-28 — Single summary endpoint replaces the earlier 3
    // separate list-then-length calls. Also gives us lapsed_farmers
    // and open_expert_queries + a top-clients breakdown we didn't
    // have before.
    api.get<AlertsSummary>('/admin/rm/alerts-summary')
      .then(r => setSummary(r.data))
      .catch(() => {/* leave null; tiles show '…' */})
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  function onSearch(value: string) {
    setQuery(value)
    if (timer.current) clearTimeout(timer.current)
    if (value.trim().length < 2) { setResults([]); return }
    setSearching(true)
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get<UserResult[]>(`/admin/rm/users/search?q=${encodeURIComponent(value.trim())}`)
        setResults(data)
      } finally { setSearching(false) }
    }, 300)
  }

  // Two-row grid: top 3 are farmer-signal "do we need to act",
  // bottom 3 are SA-maintained state / historical. Both rows have
  // their own accent colour so the grouping reads visually.
  // (Matches the pattern we shipped for CA Dashboard same day.)
  const tiles: Array<{
    key: keyof AlertsSummary['totals']
    label: string; hint: string; href: string
    accent: string; iconClass: string
  }> = [
    { key: 'start_date_pending',  label: 'Start Date Pending', hint: 'Subscribed but no sow date',
      href: '/rm/alerts?type=START_DATE', accent: '#D97706', iconClass: 'text-amber-500' },
    { key: 'input_due',           label: 'Input Due',          hint: 'Advisory window open, no order',
      href: '/rm/alerts?type=INPUT_DUE',  accent: '#D97706', iconClass: 'text-amber-500' },
    { key: 'missed_inputs',       label: 'Missed Inputs',      hint: 'Window closed, still no order',
      href: '/rm/alerts?type=INPUT_DUE',  accent: '#D97706', iconClass: 'text-amber-500' },
    { key: 'open_expert_queries', label: 'Open Expert Queries', hint: 'Past default 48h SLA',
      href: '/rm/alerts',                 accent: '#6B7280', iconClass: 'text-slate-500' },
    { key: 'lapsed_farmers',      label: 'Lapsed Farmers',     hint: 'Ever subscribed, none active',
      href: '/rm/alerts',                 accent: '#6B7280', iconClass: 'text-slate-500' },
    { key: 'open_cases',          label: 'Open Cases',         hint: 'Pending resolution',
      href: '/rm/cases',                  accent: '#6B7280', iconClass: 'text-slate-500' },
  ]

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">RM Support Desk</h1>
          <p className="text-slate-500 text-sm mt-0.5">Search any user or monitor alerts across all clients</p>
        </div>

        {/* Summary cards — 2 rows × 3. Row 1 is farmer-signal
            (amber accent), row 2 is SA-maintained state (slate). */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {tiles.map(t => (
            <button key={t.key} onClick={() => router.push(t.href)}
              className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow text-left relative overflow-hidden"
              style={{ borderLeftWidth: 3, borderLeftColor: t.accent }}>
              <div className={`absolute top-3 right-3 w-6 h-6 ${t.iconClass}`} aria-hidden="true">
                {ICON[t.key]}
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {summary ? summary.totals[t.key] : '…'}
              </p>
              <p className="text-xs font-semibold text-slate-600 mt-1">{t.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{t.hint}</p>
            </button>
          ))}
        </div>

        {/* Top 5 clients by alert volume — SA-only cross-tenant
            triage signal. Click → alerts page filtered to that client. */}
        {summary && summary.top_clients.length > 0 && (
          <div className="mb-7 bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top clients by alert volume</p>
              {summary.sub_scan_capped && (
                <p className="text-[10px] text-amber-600" title="Input-due and missed-inputs counts capped at the first 500 subscriptions scanned. Drill into /rm/alerts for exact per-client totals.">
                  approx · sub scan capped
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              {summary.top_clients.map((c, i) => {
                const max = summary.top_clients[0].total_alerts || 1
                const pct = Math.max(2, Math.round((c.total_alerts / max) * 100))
                return (
                  <button key={c.client_id}
                    onClick={() => router.push(`/rm/alerts?client_id=${c.client_id}`)}
                    className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left">
                    <span className="text-xs font-mono text-slate-400 w-5">{i + 1}</span>
                    <span className="flex-1 text-sm text-slate-700 truncate">{c.client_name}</span>
                    <div className="w-40 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-slate-800 w-10 text-right">{c.total_alerts}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Search — the primary UX */}
        <div className="relative">
          <div className="flex items-center bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 gap-3 focus-within:border-blue-400 transition-colors shadow-sm">
            <span className="text-slate-400 text-lg">🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => onSearch(e.target.value)}
              placeholder="Search by name or phone number…"
              className="flex-1 text-base text-slate-800 focus:outline-none placeholder:text-slate-300"
            />
            {searching && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
            {query && !searching && (
              <button onClick={() => { setQuery(''); setResults([]) }} className="text-slate-400 hover:text-slate-600">✕</button>
            )}
          </div>

          {/* Results dropdown */}
          {results.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl mt-2 z-20 overflow-hidden max-h-96 overflow-y-auto">
              {results.map(user => (
                <button key={user.id}
                  onClick={() => router.push(`/rm/users/${user.id}`)}
                  className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-sky-200 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                    {(user.name || user.phone || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{user.name || 'No name'}</p>
                    <p className="text-xs text-slate-400">{user.phone}{user.district ? ` · ${user.district}` : ''}</p>
                    {user.clients.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {user.clients.map(c => (
                          <span key={c} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-slate-300 text-lg self-center">›</span>
                </button>
              ))}
            </div>
          )}

          {query.length >= 2 && !searching && results.length === 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl mt-2 z-20 px-5 py-8 text-center">
              <p className="text-slate-400">No users found for &quot;{query}&quot;</p>
            </div>
          )}
        </div>

        {/* Quick nav */}
        <div className="flex gap-3 mt-6">
          <button onClick={() => router.push('/rm/alerts')}
            className="flex-1 py-3 text-sm font-medium bg-slate-100 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-200">
            📢 Alert Queue
          </button>
          <button onClick={() => router.push('/rm/cases')}
            className="flex-1 py-3 text-sm font-medium bg-slate-100 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-200">
            📋 All Cases
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}
