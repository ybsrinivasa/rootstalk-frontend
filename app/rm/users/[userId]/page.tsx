'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface Profile { id: string; name: string | null; phone: string | null; email: string | null; language_code: string; state: string | null; district: string | null; address: string | null; gps_lat: number | null; gps_lng: number | null }
interface Subscription { id: string; status: string; reference_number: string | null; crop_start_date: string | null; client_name: string | null; package_name: string | null; crop_cosh_id: string | null }
interface Order { id: string; status: string; date_from: string; date_to: string; dealer_user_id: string | null }
interface Query { id: string; status: string; title: string; created_at: string }
interface Case { id: string; category: string; description: string; resolution_status: string; is_escalated: boolean; created_at: string }

interface Context { profile: Profile; subscriptions: Subscription[]; active_orders: Order[]; query_history: Query[]; promoter_assignments: { subscription_id: string; type: string; assigned_at: string }[]; case_log: Case[] }

const STATUS_COLOUR: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700', WAITLISTED: 'bg-amber-100 text-amber-700',
  SUSPENDED: 'bg-orange-100 text-orange-700', CANCELLED: 'bg-slate-100 text-slate-400',
  SENT: 'bg-purple-100 text-purple-700', PROCESSING: 'bg-sky-100 text-sky-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700', OPEN: 'bg-amber-100 text-amber-700',
  RESOLVED: 'bg-green-100 text-green-700',
}

export default function UserContextPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCase, setShowCase] = useState(false)
  const [caseForm, setCaseForm] = useState({ category: 'OTHER', description: '', call_log: '' })
  const [saving, setSaving] = useState(false)

  const load = () =>
    api.get<Context>(`/admin/rm/users/${userId}/context`)
      .then(r => setCtx(r.data))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [userId])

  async function createCase() {
    if (!caseForm.description.trim()) return
    setSaving(true)
    try {
      await api.post('/admin/rm/cases', { user_id: userId, ...caseForm })
      setShowCase(false)
      setCaseForm({ category: 'OTHER', description: '', call_log: '' })
      load()
    } finally { setSaving(false) }
  }

  async function toggleCase(caseId: string, current: string) {
    await api.put(`/admin/rm/cases/${caseId}`, { resolution_status: current === 'OPEN' ? 'RESOLVED' : 'OPEN' })
    load()
  }

  if (loading) return <AdminLayout><div className="py-20 text-center text-slate-400">Loading…</div></AdminLayout>
  if (!ctx) return <AdminLayout><div className="py-20 text-center text-red-500">User not found</div></AdminLayout>

  const p = ctx.profile

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 text-sm">← Back</button>
          <span className="text-slate-200">|</span>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-sky-200 flex items-center justify-center font-bold text-blue-700">
            {(p.name || p.phone || '?')[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{p.name || 'No name'}</h1>
            <p className="text-sm text-slate-400">{p.phone}{p.district ? ` · ${p.district}` : ''}{p.state ? `, ${p.state}` : ''}</p>
          </div>
          <div className="ml-auto flex gap-2">
            {p.phone && (
              <a href={`tel:${p.phone}`}
                className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800">
                📞 Call
              </a>
            )}
            <button onClick={() => setShowCase(true)}
              className="px-4 py-2 border border-blue-200 text-blue-600 text-sm font-semibold rounded-lg hover:bg-blue-50">
              + Log Case
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Profile */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Profile</p>
            <Row label="Phone" value={p.phone} />
            <Row label="Email" value={p.email} />
            <Row label="Language" value={p.language_code} />
            <Row label="Address" value={p.address} />
            {p.gps_lat && <Row label="GPS" value={`${p.gps_lat?.toFixed(4)}, ${p.gps_lng?.toFixed(4)}`} />}
          </div>

          {/* Subscriptions */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Subscriptions ({ctx.subscriptions.length})</p>
            {ctx.subscriptions.length === 0
              ? <p className="text-sm text-slate-400 italic">None</p>
              : ctx.subscriptions.map(s => (
                <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm text-slate-700">{s.client_name || '—'}</p>
                    <p className="text-xs text-slate-400">{s.package_name} · {s.crop_cosh_id}</p>
                    {s.crop_start_date
                      ? <p className="text-xs text-slate-400">Started {new Date(s.crop_start_date).toLocaleDateString()}</p>
                      : <p className="text-xs text-amber-500">⚠ No start date</p>
                    }
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOUR[s.status] || 'bg-slate-100 text-slate-500'}`}>{s.status}</span>
                </div>
              ))
            }
          </div>

          {/* Active Orders */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Active Orders ({ctx.active_orders.length})</p>
            {ctx.active_orders.length === 0
              ? <p className="text-sm text-slate-400 italic">None</p>
              : ctx.active_orders.map(o => (
                <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-xs font-mono text-slate-500">{o.id.slice(0, 8)}…</p>
                    <p className="text-xs text-slate-400">{new Date(o.date_from).toLocaleDateString()} — {new Date(o.date_to).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOUR[o.status] || 'bg-slate-100 text-slate-500'}`}>{o.status.replace(/_/g, ' ')}</span>
                </div>
              ))
            }
          </div>

          {/* FarmPundit Queries */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Query History ({ctx.query_history.length})</p>
            {ctx.query_history.length === 0
              ? <p className="text-sm text-slate-400 italic">None</p>
              : ctx.query_history.map(q => (
                <div key={q.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm text-slate-700 truncate max-w-40">{q.title}</p>
                    <p className="text-xs text-slate-400">{new Date(q.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{q.status}</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Case log */}
        <div className="mt-5 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Case Log ({ctx.case_log.length})</p>
            <button onClick={() => setShowCase(true)}
              className="text-xs text-blue-600 font-medium hover:underline">+ New case</button>
          </div>
          {ctx.case_log.length === 0
            ? <p className="text-sm text-slate-400 italic">No cases logged yet</p>
            : (
              <div className="space-y-3">
                {ctx.case_log.map(c => (
                  <div key={c.id} className="border border-slate-100 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-500 uppercase">{c.category.replace(/_/g, ' ')}</span>
                      <div className="flex gap-2">
                        {c.is_escalated && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Escalated</span>}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOUR[c.resolution_status] || ''}`}>{c.resolution_status}</span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700">{c.description}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString()}</p>
                      <button onClick={() => toggleCase(c.id, c.resolution_status)}
                        className={`text-xs font-medium ${c.resolution_status === 'OPEN' ? 'text-green-600 hover:underline' : 'text-slate-400 hover:underline'}`}>
                        {c.resolution_status === 'OPEN' ? 'Mark Resolved' : 'Reopen'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Log case modal */}
      {showCase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="font-bold text-slate-900 text-lg mb-4">Log Support Case</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                <select value={caseForm.category} onChange={e => setCaseForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none">
                  <option value="ADVISORY_QUERY">Advisory Query</option>
                  <option value="ORDER_ISSUE">Order Issue</option>
                  <option value="TECHNICAL">Technical</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
                <textarea value={caseForm.description} onChange={e => setCaseForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder="Describe the issue and what was done…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Call log (optional)</label>
                <input value={caseForm.call_log} onChange={e => setCaseForm(f => ({ ...f, call_log: e.target.value }))}
                  placeholder="Called farmer — explained next steps"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCase(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={createCase} disabled={!caseForm.description.trim() || saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {saving ? 'Saving…' : 'Log Case'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 w-20 shrink-0">{label}</span>
      <span className="text-sm text-slate-700">{value}</span>
    </div>
  )
}
