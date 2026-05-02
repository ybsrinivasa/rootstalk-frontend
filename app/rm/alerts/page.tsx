'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface Alert {
  alert_type: string; subscription_id: string
  farmer_id: string; farmer_name: string | null; farmer_phone: string | null
  farmer_district: string | null; farmer_state: string | null
  client_name: string | null; days_pending: number
  overdue_practice: string | null
  alert_receiver_name: string | null; alert_receiver_phone: string | null; alert_receiver_type: string | null
}

export default function AlertQueuePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    alert_type: searchParams.get('type') || 'ALL',
    state_cosh_id: '',
    district_cosh_id: '',
    days_pending_min: '',
  })

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

  useEffect(() => { load() }, [])

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
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">State</label>
          <input value={filters.state_cosh_id}
            onChange={e => setFilters(f => ({ ...f, state_cosh_id: e.target.value }))}
            placeholder="e.g. state_telangana"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none font-mono" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">District</label>
          <input value={filters.district_cosh_id}
            onChange={e => setFilters(f => ({ ...f, district_cosh_id: e.target.value }))}
            placeholder="e.g. dist_warangal"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none font-mono" />
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
                  <td className="px-4 py-3 text-xs text-slate-500">{a.farmer_district}</td>
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
