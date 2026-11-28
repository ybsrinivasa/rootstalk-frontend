'use client'
import { Suspense, useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface Alert {
  alert_type: string; subscription_id: string
  farmer_id: string; farmer_name: string | null; farmer_phone: string | null
  farmer_district: string | null; farmer_state: string | null
  farmer_district_name: string | null; farmer_state_name: string | null
  client_name: string | null; days_pending: number
  overdue_practice: string | null
  alert_receiver_name: string | null; alert_receiver_phone: string | null; alert_receiver_type: string | null
}

// Cosh India locations shape (from /cosh/locations/india). Used for
// the cascading state → district picker that replaces the earlier
// free-text cosh_id inputs.
interface CoshDistrict { cosh_id: string; name: string | null }
interface CoshState { cosh_id: string; name: string | null; districts: CoshDistrict[] }
interface CoshLocations { states: CoshState[] }

// Next.js 16 forbids useSearchParams() at the page-component level
// during prerender. The hook has to live inside a Suspense boundary
// so the prerender produces the fallback HTML and the client takes
// over for the params-dependent UI.
export default function AlertQueuePage() {
  return (
    <Suspense fallback={<AdminLayout><div className="py-20 text-center text-slate-400">Loading…</div></AdminLayout>}>
      <AlertQueueContent />
    </Suspense>
  )
}

function AlertQueueContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [locations, setLocations] = useState<CoshLocations>({ states: [] })
  const [filters, setFilters] = useState({
    alert_type: searchParams.get('type') || 'ALL',
    state_cosh_id: '',
    district_cosh_id: '',
    days_pending_min: '',
  })

  // Load the Cosh India locations once — same endpoint the CA Portal
  // uses for its own cascading picker. Returns {states:[{cosh_id,
  // name, districts:[{cosh_id, name}]}]}.
  useEffect(() => {
    api.get<CoshLocations>('/cosh/locations/india')
      .then(r => setLocations(r.data))
      .catch(() => {/* leave empty; selects stay empty, filters still work */})
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.alert_type !== 'ALL') params.set('alert_type', filters.alert_type)
      if (filters.state_cosh_id) params.set('state_cosh_id', filters.state_cosh_id)
      if (filters.district_cosh_id) params.set('district_cosh_id', filters.district_cosh_id)
      if (filters.days_pending_min) params.set('days_pending_min', filters.days_pending_min)
      const { data } = await api.get<Alert[]>(`/admin/rm/alerts?${params}`)
      setAlerts(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Districts visible in the second dropdown depend on which state
  // is picked. If no state picked, show no districts (prevents a
  // huge all-india dropdown that would be unusable).
  const districtOptions = useMemo(() => {
    if (!filters.state_cosh_id) return []
    const st = locations.states.find(s => s.cosh_id === filters.state_cosh_id)
    return st ? st.districts : []
  }, [filters.state_cosh_id, locations])

  const TYPE_COLOUR: Record<string, string> = {
    START_DATE: 'bg-amber-100 text-amber-700',
    INPUT_DUE: 'bg-red-100 text-red-700',
  }

  const urgency = (days: number) =>
    days >= 14 ? 'text-red-600 font-bold' : days >= 7 ? 'text-amber-600 font-semibold' : 'text-slate-500'

  return (
    <AdminLayout>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Alert Queue</h1>
          <p className="text-slate-500 text-sm mt-0.5">{alerts.length} farmers need attention</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Alert Type</label>
          <select value={filters.alert_type}
            onChange={e => setFilters(f => ({ ...f, alert_type: e.target.value }))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
            <option value="ALL">All</option>
            <option value="START_DATE">Start Date Pending</option>
            <option value="INPUT_DUE">Input Due</option>
          </select>
        </div>
        {/* 2026-11-28 — cascading state → district picker.
            Was free-text cosh_id inputs ("e.g. state_telangana") which
            users had no way to know. Picks cascade so changing state
            resets the district selection. */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">State</label>
          <select value={filters.state_cosh_id}
            onChange={e => setFilters(f => ({ ...f, state_cosh_id: e.target.value, district_cosh_id: '' }))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none min-w-[180px]">
            <option value="">All states</option>
            {locations.states.map(s => (
              <option key={s.cosh_id} value={s.cosh_id}>{s.name || s.cosh_id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">District</label>
          <select value={filters.district_cosh_id}
            disabled={!filters.state_cosh_id}
            onChange={e => setFilters(f => ({ ...f, district_cosh_id: e.target.value }))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none min-w-[180px] disabled:bg-slate-50 disabled:text-slate-400">
            <option value="">{filters.state_cosh_id ? 'All districts' : 'Pick a state first'}</option>
            {districtOptions.map(d => (
              <option key={d.cosh_id} value={d.cosh_id}>{d.name || d.cosh_id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Min Days Pending</label>
          <input type="number" value={filters.days_pending_min}
            onChange={e => setFilters(f => ({ ...f, days_pending_min: e.target.value }))}
            placeholder="7"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-20 focus:outline-none" />
        </div>
        <button onClick={load}
          className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800">
          Apply
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <p className="text-3xl mb-3">✓</p>
          <p className="text-slate-500 font-medium">No alerts for these filters</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Type', 'Farmer', 'District', 'Company', 'Days Pending', 'Alert Receiver', 'Action'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {alerts.map((a, i) => (
                <tr key={`${a.subscription_id}-${i}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOUR[a.alert_type] || 'bg-slate-100 text-slate-500'}`}>
                      {a.alert_type.replace('_', ' ')}
                    </span>
                    {a.overdue_practice && <p className="text-xs text-red-500 mt-0.5">{a.overdue_practice}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{a.farmer_name || '—'}</p>
                    <a href={`tel:${a.farmer_phone}`} className="text-xs text-blue-600 hover:underline">{a.farmer_phone}</a>
                  </td>
                  {/* 2026-11-28 — render resolved district + state
                      name from backend. Fallback to raw id only when
                      the cosh catalog is missing the entry. */}
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <p>{a.farmer_district_name || a.farmer_district || '—'}</p>
                    {a.farmer_state_name && <p className="text-[11px] text-slate-400">{a.farmer_state_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{a.client_name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm ${urgency(a.days_pending)}`}>{a.days_pending}d</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {a.alert_receiver_name
                      ? <><p>{a.alert_receiver_name}</p><a href={`tel:${a.alert_receiver_phone}`} className="text-blue-600 hover:underline">{a.alert_receiver_phone}</a></>
                      : <span className="text-slate-300">None assigned</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => router.push(`/rm/users/${a.farmer_id}`)}
                      className="text-xs text-blue-600 font-medium hover:underline">View →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
