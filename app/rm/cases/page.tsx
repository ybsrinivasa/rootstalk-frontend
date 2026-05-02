'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface Case {
  id: string; user_id: string; user_name: string | null; user_phone: string | null
  category: string; description: string; call_log: string | null
  resolution_status: string; is_escalated: boolean; escalated_note: string | null
  created_at: string; updated_at: string
}

const STATUS_COLOUR: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700',
  RESOLVED: 'bg-green-100 text-green-700',
}
const CAT_LABEL: Record<string, string> = {
  ADVISORY_QUERY: 'Advisory', ORDER_ISSUE: 'Order', TECHNICAL: 'Technical', OTHER: 'Other'
}

export default function CasesPage() {
  const router = useRouter()
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('OPEN')
  const [escalatedOnly, setEscalatedOnly] = useState(false)
  const [editing, setEditing] = useState<Case | null>(null)
  const [editForm, setEditForm] = useState({ call_log: '', resolution_status: '', escalated_note: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('resolution_status', statusFilter)
      if (escalatedOnly) params.set('is_escalated', 'true')
      const { data } = await api.get<Case[]>(`/admin/rm/cases?${params}`)
      setCases(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [statusFilter, escalatedOnly])

  function openEdit(c: Case) {
    setEditing(c)
    setEditForm({ call_log: c.call_log || '', resolution_status: c.resolution_status, escalated_note: c.escalated_note || '' })
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    try {
      await api.put(`/admin/rm/cases/${editing.id}`, editForm)
      setEditing(null)
      load()
    } finally { setSaving(false) }
  }

  return (
    <AdminLayout>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Case Log</h1>
          <p className="text-slate-500 text-sm mt-0.5">{cases.length} cases</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 mb-5 items-center flex-wrap">
        <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden">
          {(['ALL', 'OPEN', 'RESOLVED'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${statusFilter === s ? 'bg-green-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {s}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={escalatedOnly} onChange={e => setEscalatedOnly(e.target.checked)}
            className="w-4 h-4 rounded accent-red-600" />
          <span className="text-sm text-slate-600">Escalated only</span>
        </label>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : cases.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-slate-400">No cases found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['User', 'Category', 'Description', 'Status', 'Date', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cases.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button onClick={() => router.push(`/rm/users/${c.user_id}`)}
                      className="text-left hover:underline">
                      <p className="font-medium text-slate-800">{c.user_name || '—'}</p>
                      <p className="text-xs text-slate-400">{c.user_phone}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {CAT_LABEL[c.category] || c.category}
                    </span>
                    {c.is_escalated && (
                      <span className="ml-1 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">⬆ Escalated</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-sm text-slate-700 line-clamp-2">{c.description}</p>
                    {c.call_log && <p className="text-xs text-slate-400 mt-0.5 italic">{c.call_log}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOUR[c.resolution_status] || ''}`}>
                      {c.resolution_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(c)} className="text-xs text-blue-600 hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit case modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="font-bold text-slate-900 text-lg mb-1">Update Case</h2>
            <p className="text-sm text-slate-500 mb-4">{editing.user_name} — {CAT_LABEL[editing.category]}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <div className="flex gap-2">
                  {['OPEN', 'RESOLVED'].map(s => (
                    <button key={s} onClick={() => setEditForm(f => ({ ...f, resolution_status: s }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-xl border-2 transition-all ${editForm.resolution_status === s ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Call Log</label>
                <input value={editForm.call_log} onChange={e => setEditForm(f => ({ ...f, call_log: e.target.value }))}
                  placeholder="Outcome of call…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Escalation Note</label>
                <input value={editForm.escalated_note} onChange={e => setEditForm(f => ({ ...f, escalated_note: e.target.value }))}
                  placeholder="Reason for escalation (if any)"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={saveEdit} disabled={saving}
                className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 font-medium">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
