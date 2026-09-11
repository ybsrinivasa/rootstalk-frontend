'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type Metrics = {
  farmers_active: number
  farmers_newly_registered: number
  active_subscriptions: number
  total_subscriptions: number
  dealers_onboarded: number
  facilitators_onboarded: number
  purchase_orders_generated: number
  promoters_designated: number
  promoter_pundits: number
  primary_experts: number
  panel_experts: number
  queries_raised: number
  queries_responded: number
  queries_pending: number
  pests_diagnosed: number
}

type SummaryResponse = {
  generated_at: string
  filters_applied: {
    period_from: string
    period_to: string
    state_cosh_id: string | null
    district_cosh_id: string | null
    client_ids: string[]
    include_sandboxes: boolean
  }
  prior_window: { period_from: string; period_to: string }
  current: Metrics
  prior: Metrics
}

type ClientRow = { id: string; name: string; short_name: string }
type StateRow = { cosh_id: string; name: string | null; districts: { cosh_id: string; name: string | null }[] }

const TILE_ORDER: { key: keyof Metrics; label: string }[] = [
  { key: 'farmers_active',             label: 'Farmers — Active' },
  { key: 'farmers_newly_registered',   label: 'Farmers — Newly Registered' },
  { key: 'active_subscriptions',       label: 'Active Subscriptions' },
  { key: 'total_subscriptions',        label: 'Total Subscriptions (in window)' },
  { key: 'purchase_orders_generated',  label: 'Purchase Orders Generated' },
  { key: 'dealers_onboarded',          label: 'Dealers Onboarded' },
  { key: 'facilitators_onboarded',     label: 'Facilitators Onboarded' },
  { key: 'promoters_designated',       label: 'Promoters Designated' },
  { key: 'promoter_pundits',           label: 'Promoter-Pundits' },
  { key: 'primary_experts',            label: 'Primary Experts' },
  { key: 'panel_experts',              label: 'Panel Experts' },
  { key: 'queries_raised',             label: 'Queries Raised' },
  { key: 'queries_responded',          label: 'Queries Responded' },
  { key: 'queries_pending',            label: 'Queries Pending' },
  { key: 'pests_diagnosed',            label: 'Pests Diagnosed' },
]

function isoDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { from: isoDate(from), to: isoDate(now) }
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<AdminLayout><div className="bg-white rounded-xl p-10 text-center text-slate-400 border border-slate-200">Loading reports…</div></AdminLayout>}>
      <ReportsContent />
    </Suspense>
  )
}

function ReportsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const defaults = defaultRange()
  const [from, setFrom] = useState(searchParams.get('from') || defaults.from)
  const [to, setTo] = useState(searchParams.get('to') || defaults.to)
  const [stateId, setStateId] = useState(searchParams.get('state') || '')
  const [districtId, setDistrictId] = useState(searchParams.get('district') || '')
  const [inclSandboxes, setInclSandboxes] = useState(searchParams.get('sb') === '1')

  // Client selection is tri-state:
  //   null            → default (all real clients — backend gets no client_ids)
  //   []              → explicit zero (backend gets `__none__` → 0s for
  //                      every client-scoped metric)
  //   [id, id, …]     → explicit subset
  // Derive the display Set from this + the loaded clients list so we
  // never race a fetch against a useEffect setter.
  const initialClientsParam = searchParams.get('clients') || ''
  const initialExplicit: string[] | null =
    initialClientsParam === '__none__'
      ? []
      : initialClientsParam
        ? initialClientsParam.split(',').map(s => s.trim()).filter(Boolean)
        : null
  const [explicitClientIds, setExplicitClientIds] = useState<string[] | null>(initialExplicit)

  const [clients, setClients] = useState<ClientRow[]>([])
  const [states, setStates] = useState<StateRow[]>([])
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── Load static pick-lists once ─────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get<ClientRow[]>('/admin/sa/reports/clients').catch(() => ({ data: [] })),
      api.get<{ states: StateRow[] }>('/cosh/locations/india').catch(() => ({ data: { states: [] } })),
    ]).then(([c, l]) => {
      setClients(c.data as ClientRow[])
      setStates((l.data as { states: StateRow[] }).states || [])
    })
  }, [])

  const selectedClients = useMemo(() => {
    if (explicitClientIds === null) return new Set(clients.map(c => c.id))
    return new Set(explicitClientIds)
  }, [explicitClientIds, clients])

  const districts = useMemo(() => {
    if (!stateId) return []
    return states.find(s => s.cosh_id === stateId)?.districts || []
  }, [states, stateId])

  const clientCsv = useMemo(() => {
    if (explicitClientIds === null) return ''       // default → all real clients
    if (explicitClientIds.length === 0) return '__none__' // explicit zero
    return explicitClientIds.join(',')
  }, [explicitClientIds])

  // ── Fetch summary when filters change ───────────────────────────────
  useEffect(() => {
    setLoading(true); setError('')
    const params: Record<string, string> = {
      period_from: from + 'T00:00:00Z',
      period_to: to + 'T23:59:59Z',
    }
    if (stateId) params.state_cosh_id = stateId
    if (districtId) params.district_cosh_id = districtId
    if (clientCsv) params.client_ids = clientCsv
    if (inclSandboxes) params.include_sandboxes = 'true'

    api.get<SummaryResponse>('/admin/sa/reports/summary', { params })
      .then(r => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail || 'Failed to load reports'))
      .finally(() => setLoading(false))
  }, [from, to, stateId, districtId, clientCsv, inclSandboxes])

  // ── Keep URL in sync (bookmarkable / shareable) ─────────────────────
  useEffect(() => {
    const usp = new URLSearchParams()
    usp.set('from', from); usp.set('to', to)
    if (stateId) usp.set('state', stateId)
    if (districtId) usp.set('district', districtId)
    if (clientCsv) usp.set('clients', clientCsv)
    if (inclSandboxes) usp.set('sb', '1')
    router.replace(`/reports?${usp.toString()}`, { scroll: false })
  }, [from, to, stateId, districtId, clientCsv, inclSandboxes, router])

  function toggleClient(id: string) {
    // Materialise the current selection into an explicit list on first
    // toggle so subsequent toggles have a stable starting set.
    const base = explicitClientIds === null ? clients.map(c => c.id) : explicitClientIds
    const set = new Set(base)
    if (set.has(id)) set.delete(id); else set.add(id)
    setExplicitClientIds(Array.from(set))
  }

  function selectAllClients(check: boolean) {
    // check=true  → default (all real clients — collapse URL param)
    // check=false → explicit zero (URL gets `clients=__none__`)
    setExplicitClientIds(check ? null : [])
  }

  function downloadCsv() {
    if (!data) return
    const f = data.filters_applied
    const meta = [
      `# RootsTalk SA Report — generated ${data.generated_at}`,
      `# Window: ${f.period_from} → ${f.period_to}`,
      `# Prior window: ${data.prior_window.period_from} → ${data.prior_window.period_to}`,
      `# State: ${f.state_cosh_id || 'all'}    District: ${f.district_cosh_id || 'all'}    Sandboxes: ${f.include_sandboxes ? 'included' : 'excluded'}`,
      `# Clients: ${f.client_ids.length} selected`,
      '',
      'Metric,Current,Prior,Delta,Delta %',
    ]
    const rows = TILE_ORDER.map(t => {
      const cur = data.current[t.key] || 0
      const pri = data.prior[t.key] || 0
      const delta = cur - pri
      const pct = pri === 0 ? (cur === 0 ? '0.0%' : 'n/a') : `${(((cur - pri) / pri) * 100).toFixed(1)}%`
      return `"${t.label}",${cur},${pri},${delta},${pct}`
    })
    const csv = [...meta, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rootstalk-report_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const generatedIST = data ? new Date(data.generated_at).toLocaleString('en-IN', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
  }) : ''

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Platform-wide activity across the selected window.</p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-slate-500">As of {generatedIST} IST</span>
          )}
          <button
            onClick={downloadCsv}
            disabled={!data}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 text-white disabled:opacity-40"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">State</label>
            <select value={stateId}
              onChange={e => { setStateId(e.target.value); setDistrictId('') }}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5">
              <option value="">All states</option>
              {states.map(s => (
                <option key={s.cosh_id} value={s.cosh_id}>{s.name || '(unnamed)'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">District</label>
            <select value={districtId}
              onChange={e => setDistrictId(e.target.value)}
              disabled={!stateId}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">All districts</option>
              {districts.map(d => (
                <option key={d.cosh_id} value={d.cosh_id}>{d.name || '(unnamed)'}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Client multi-select */}
        <div>
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Clients</label>
              <span className="text-xs text-slate-500">
                {selectedClients.size} of {clients.length} selected
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => selectAllClients(true)}
                className="text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                Select all
              </button>
              <button type="button" onClick={() => selectAllClients(false)}
                className="text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                Clear
              </button>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox"
                  checked={inclSandboxes}
                  onChange={e => setInclSandboxes(e.target.checked)} />
                Include sandboxes
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-md p-2 bg-slate-50">
            {clients.length === 0 && <span className="text-xs text-slate-400">Loading clients…</span>}
            {clients.map(c => {
              const on = selectedClients.has(c.id)
              return (
                <button key={c.id}
                  onClick={() => toggleClient(c.id)}
                  className={on
                    ? 'text-xs px-2 py-1 rounded border bg-emerald-600 border-emerald-600 text-white'
                    : 'text-xs px-2 py-1 rounded border bg-white border-slate-300 text-slate-700'}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
          {clients.length > 0 && selectedClients.size === 0 && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              No clients selected — every client-scoped tile below will show 0. Click <b>Select all</b> to include all real clients, or pick specific ones.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">{error}</div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {TILE_ORDER.map(t => {
          const cur = data?.current[t.key] ?? 0
          const pri = data?.prior[t.key] ?? 0
          const delta = cur - pri
          const pct = pri === 0
            ? (cur === 0 ? null : '↑ new')
            : `${delta >= 0 ? '↑' : '↓'} ${Math.abs(((cur - pri) / pri) * 100).toFixed(1)}%`
          const deltaColour = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-slate-400'

          return (
            <div key={t.key} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t.label}</p>
              {loading && !data ? (
                <div className="h-8 mt-2 bg-slate-100 rounded animate-pulse" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{cur.toLocaleString()}</p>
                  <p className={`text-xs mt-1 ${deltaColour}`}>
                    {pct ? (
                      <>{pct} <span className="text-slate-400">vs prior {pri.toLocaleString()}</span></>
                    ) : (
                      <span className="text-slate-400">No activity prior period</span>
                    )}
                  </p>
                </>
              )}
            </div>
          )
        })}
      </div>
    </AdminLayout>
  )
}
