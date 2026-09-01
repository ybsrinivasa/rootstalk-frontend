'use client'

// Coaching Sessions list — coach dashboard for the Coaching Sandbox
// (Phase 4a). Non-SA coaches see only their own sessions; SA sees
// all. New Session button opens a dialog to pick the Reference
// Client, POSTs /coaching/sessions, and routes to the detail page.
//
// Backend endpoints consumed:
//   GET  /coaching/sessions[?status=...]  — list
//   POST /coaching/sessions               — create DRAFT
//   GET  /admin/clients                   — Reference Client picker

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'


interface ReferenceClientMini { id: string; full_name: string; short_name: string }
interface CoachMini { id: string; name: string | null; email: string | null }
interface SessionListItem {
  id: string
  reference_client: ReferenceClientMini
  coach: CoachMini
  status: string
  student_count: number
  approved_student_count: number
  created_at: string
  started_at: string | null
  closed_at: string | null
}

interface ClientMini { id: string; full_name: string; short_name: string }

const STATUS_COLOURS: Record<string, string> = {
  DRAFT:          'bg-slate-100 text-slate-600',
  ACTIVE:         'bg-emerald-100 text-emerald-700',
  CLOSED_MANUAL:  'bg-blue-100 text-blue-700',
  CLOSED_AUTO:    'bg-blue-100 text-blue-700',
}
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  CLOSED_MANUAL: 'Closed',
  CLOSED_AUTO: 'Auto-closed',
}


function StatusPill({ status }: { status: string }) {
  const cls = STATUS_COLOURS[status] || 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}


function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}


export default function CoachingSessionsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')

  const [showNewModal, setShowNewModal] = useState(false)
  const [clients, setClients] = useState<ClientMini[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    try {
      const params = statusFilter ? `?status=${statusFilter}` : ''
      const { data } = await api.get<SessionListItem[]>(`/coaching/sessions${params}`)
      setSessions(data)
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to load coaching sessions'))
    } finally {
      setLoading(false)
    }
  }

  async function openNewModal() {
    setShowNewModal(true)
    setError('')
    setSelectedClientId('')
    if (clients.length === 0) {
      try {
        // Coach-scoped endpoint — returns only ACTIVE real clients
        // (not training children, not coaching workspaces) that
        // can host a session. Works for both SA and COACH-role
        // users; /admin/clients would 403 for a non-SA coach.
        const { data } = await api.get<ClientMini[]>('/coaching/reference-clients')
        setClients(data)
      } catch (e) {
        setError(extractErrorMessage(e, 'Failed to load clients'))
      }
    }
  }

  async function createSession() {
    if (!selectedClientId) return
    setCreating(true); setError('')
    try {
      const { data } = await api.post<{ id: string }>('/coaching/sessions', {
        reference_client_id: selectedClientId,
      })
      setShowNewModal(false)
      router.push(`/coaching/${data.id}`)
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to create session'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Coaching Sessions</h1>
            <p className="text-sm text-slate-500 mt-1">
              Run 30-day cohort-based coaching for agriculture graduate students. Each student gets their own isolated coaching workspace.
            </p>
          </div>
          <button onClick={openNewModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            + New Session
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mb-4">
          {[
            { label: 'All', value: '' },
            { label: 'Draft', value: 'DRAFT' },
            { label: 'Active', value: 'ACTIVE' },
            { label: 'Closed (manual)', value: 'CLOSED_MANUAL' },
            { label: 'Closed (auto)', value: 'CLOSED_AUTO' },
          ].map(c => (
            <button key={c.value} onClick={() => setStatusFilter(c.value)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                statusFilter === c.value
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}>
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-slate-500 text-sm p-8 text-center">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <p className="text-slate-600 font-medium mb-1">No coaching sessions yet</p>
            <p className="text-sm text-slate-500 mb-4">
              Create a session against a real onboarded client to start coaching students.
            </p>
            <button onClick={openNewModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
              + New Session
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Reference Client</th>
                  <th className="text-left px-4 py-3 font-medium">Coach</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Students</th>
                  <th className="text-left px-4 py-3 font-medium">Started</th>
                  <th className="text-left px-4 py-3 font-medium">Closed</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/coaching/${s.id}`} className="text-slate-800 font-medium hover:text-emerald-700">
                        {s.reference_client.full_name}
                      </Link>
                      <p className="text-xs text-slate-500">{s.reference_client.short_name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {s.coach.name || s.coach.email || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                      {s.approved_student_count}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(s.started_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(s.closed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && !showNewModal && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* New Session modal */}
        {showNewModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 px-4"
            onClick={() => !creating && setShowNewModal(false)}>
            <div onClick={e => e.stopPropagation()}
              className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-1">New Coaching Session</h2>
              <p className="text-sm text-slate-500 mb-4">
                Pick the real client this cohort is being groomed to work with. Only one open session per client at a time.
              </p>
              <label className="block text-xs uppercase tracking-wider text-slate-500 font-medium mb-1">
                Reference Client
              </label>
              <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-4">
                <option value="">Select a client…</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} · {c.short_name}
                  </option>
                ))}
              </select>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 mb-4">
                  {error}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNewModal(false)} disabled={creating}
                  className="text-sm text-slate-600 hover:text-slate-800 px-3 py-2">
                  Cancel
                </button>
                <button onClick={createSession} disabled={creating || !selectedClientId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create Session'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
