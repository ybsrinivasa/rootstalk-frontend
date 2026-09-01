'use client'

// Coaching Session detail — driver page for a single session across
// its three lifecycle states (Phase 4b).
//
//   DRAFT:  add invites, review/approve/reject submitted invites,
//           delete empty draft, Start session (freezes roster).
//   ACTIVE: roster + workspace links, PWA role picker per student,
//           Close session.
//   CLOSED: roster with Certify/Uncertify per student.
//
// Backend endpoints:
//   GET    /coaching/sessions/{id}
//   DELETE /coaching/sessions/{id}
//   POST   /coaching/sessions/{id}/start
//   POST   /coaching/sessions/{id}/close
//   POST   /coaching/sessions/{id}/invites
//   POST   /coaching/sessions/{id}/invites/{iid}/approve
//   POST   /coaching/sessions/{id}/invites/{iid}/reject
//   PUT    /coaching/sessions/{id}/students/{sid}/pwa-roles
//   POST   /coaching/sessions/{id}/students/{sid}/certify

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'


interface ReferenceClientMini { id: string; full_name: string; short_name: string }
interface CoachMini { id: string; name: string | null; email: string | null }
interface InviteDetail {
  id: string
  email: string
  status: string
  submitted_form: {
    name?: string
    year_of_birth?: number
    address?: string
    organization?: string
    phone?: string
  } | null
  created_at: string
  submitted_at: string | null
  approved_at: string | null
  expires_at: string
}
interface StudentDetail {
  id: string
  user_id: string
  workspace_client_id: string
  workspace_short_name: string
  student_name: string | null
  student_email: string | null
  approved_phone: string
  assigned_pwa_roles: string[]
  certified_at: string | null
  created_at: string
}
interface SessionDetail {
  id: string
  reference_client: ReferenceClientMini
  coach: CoachMini
  status: string
  created_at: string
  started_at: string | null
  closed_at: string | null
  invites: InviteDetail[]
  students: StudentDetail[]
}


const STATUS_COLOURS: Record<string, string> = {
  DRAFT:          'bg-slate-100 text-slate-600',
  ACTIVE:         'bg-emerald-100 text-emerald-700',
  CLOSED_MANUAL:  'bg-blue-100 text-blue-700',
  CLOSED_AUTO:    'bg-blue-100 text-blue-700',
}
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', ACTIVE: 'Active',
  CLOSED_MANUAL: 'Closed (manual)', CLOSED_AUTO: 'Auto-closed',
}

const INVITE_STATUS_COLOURS: Record<string, string> = {
  INVITED:   'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  APPROVED:  'bg-emerald-100 text-emerald-700',
  REJECTED:  'bg-red-100 text-red-600',
}

const PWA_ROLES = [
  { value: 'FARMER',      label: 'Farmer' },
  { value: 'DEALER',      label: 'Dealer' },
  { value: 'FACILITATOR', label: 'Facilitator' },
  { value: 'FARM_PUNDIT', label: 'FarmPundit' },
]


function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}


export default function CoachingSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data } = await api.get<SessionDetail>(`/coaching/sessions/${sessionId}`)
      setSession(data)
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to load session'))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  // ── Actions ────────────────────────────────────────────────────────────

  async function inviteStudent() {
    if (!inviteEmail.trim()) return
    setBusyAction('invite'); setError('')
    try {
      const { data } = await api.post(
        `/coaching/sessions/${sessionId}/invites`,
        { email: inviteEmail.trim() },
      )
      setLastInviteLink(data.invite_link)
      setInviteEmail('')
      await load()
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to send invite'))
    } finally {
      setBusyAction(null)
    }
  }

  async function approveInvite(iid: string) {
    setBusyAction(`approve-${iid}`); setError('')
    try {
      await api.post(`/coaching/sessions/${sessionId}/invites/${iid}/approve`)
      await load()
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to approve'))
    } finally { setBusyAction(null) }
  }

  async function rejectInvite(iid: string) {
    if (!confirm('Reject this invite? The student will not be provisioned.')) return
    setBusyAction(`reject-${iid}`); setError('')
    try {
      await api.post(`/coaching/sessions/${sessionId}/invites/${iid}/reject`)
      await load()
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to reject'))
    } finally { setBusyAction(null) }
  }

  async function startSession() {
    if (!confirm('Starting freezes the roster — no new students can be added. The 30-day session clock begins now. Proceed?')) return
    setBusyAction('start'); setError('')
    try {
      await api.post(`/coaching/sessions/${sessionId}/start`)
      await load()
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to start session'))
    } finally { setBusyAction(null) }
  }

  async function closeSession() {
    if (!confirm('Close this session now? Students will lose login access. You can still review workspaces and certify students after close.')) return
    setBusyAction('close'); setError('')
    try {
      await api.post(`/coaching/sessions/${sessionId}/close`)
      await load()
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to close session'))
    } finally { setBusyAction(null) }
  }

  async function deleteSession() {
    if (!confirm('Delete this draft session? All pending invites will be lost.')) return
    setBusyAction('delete'); setError('')
    try {
      await api.delete(`/coaching/sessions/${sessionId}`)
      router.push('/coaching')
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to delete session'))
      setBusyAction(null)
    }
  }

  async function setPwaRoles(sid: string, roles: string[]) {
    setBusyAction(`roles-${sid}`); setError('')
    try {
      await api.put(
        `/coaching/sessions/${sessionId}/students/${sid}/pwa-roles`,
        { roles },
      )
      await load()
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to update PWA roles'))
    } finally { setBusyAction(null) }
  }

  async function toggleCertification(sid: string, certified: boolean) {
    setBusyAction(`cert-${sid}`); setError('')
    try {
      await api.post(
        `/coaching/sessions/${sessionId}/students/${sid}/certify`,
        { certified },
      )
      await load()
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to update certification'))
    } finally { setBusyAction(null) }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6 text-slate-500 text-sm">Loading…</div>
    </AdminLayout>
  )
  if (!session) return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6 text-red-600 text-sm">{error || 'Session not found'}</div>
    </AdminLayout>
  )

  const isDraft = session.status === 'DRAFT'
  const isActive = session.status === 'ACTIVE'
  const isClosed = session.status.startsWith('CLOSED_')
  const approvedInvites = session.invites.filter(i => i.status === 'APPROVED')
  const pendingInvites = session.invites.filter(i => i.status === 'SUBMITTED')
  const openInvites = session.invites.filter(i => i.status === 'INVITED')
  const rejectedInvites = session.invites.filter(i => i.status === 'REJECTED')

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6">
        {/* Breadcrumb + header */}
        <Link href="/coaching" className="text-sm text-slate-500 hover:text-slate-800">← All sessions</Link>
        <div className="flex items-start justify-between mt-2 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-800">
                {session.reference_client.full_name}
              </h1>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[session.status]}`}>
                {STATUS_LABEL[session.status] || session.status}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Coached by <strong>{session.coach.name || session.coach.email}</strong>
              {' · '}Created {formatDateTime(session.created_at)}
              {session.started_at && <> · Started {formatDateTime(session.started_at)}</>}
              {session.closed_at && <> · Closed {formatDateTime(session.closed_at)}</>}
            </p>
          </div>

          {/* Lifecycle CTAs */}
          <div className="flex gap-2 flex-shrink-0">
            {isDraft && (
              <>
                <button onClick={startSession}
                  disabled={busyAction !== null || approvedInvites.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                  title={approvedInvites.length === 0 ? 'Approve at least one student first' : 'Start the coaching session'}>
                  Start Session →
                </button>
                {approvedInvites.length === 0 && (
                  <button onClick={deleteSession} disabled={busyAction !== null}
                    className="text-red-600 hover:bg-red-50 text-sm px-3 py-2 rounded-lg border border-red-200 disabled:opacity-50">
                    Delete Draft
                  </button>
                )}
              </>
            )}
            {isActive && (
              <button onClick={closeSession} disabled={busyAction !== null}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                Close Session
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Add-invite form (DRAFT only) ─────────────────────────── */}
        {isDraft && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
            <h2 className="font-semibold text-slate-800 mb-1">Invite a student</h2>
            <p className="text-xs text-slate-500 mb-3">
              Enter the student&apos;s email. They&apos;ll receive a self-registration link. Once they submit their details, you&apos;ll see them below and can approve.
            </p>
            <div className="flex gap-2">
              <input type="email" value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="student@example.com"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={inviteStudent}
                disabled={busyAction === 'invite' || !inviteEmail.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                {busyAction === 'invite' ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
            {lastInviteLink && (
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                <p className="text-slate-500 mb-1">Invite link (email sent; copy manually if delivery is flaky):</p>
                <code className="text-slate-800 break-all">{lastInviteLink}</code>
              </div>
            )}
          </div>
        )}

        {/* ── Pending approval queue (SUBMITTED invites) ──────────── */}
        {pendingInvites.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-slate-800 mb-2">
              Pending your approval ({pendingInvites.length})
            </h2>
            <div className="space-y-3">
              {pendingInvites.map(inv => (
                <div key={inv.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-800">{inv.submitted_form?.name || '—'}</p>
                      <p className="text-sm text-slate-500">{inv.email}</p>
                    </div>
                    {isDraft && (
                      <div className="flex gap-2">
                        <button onClick={() => approveInvite(inv.id)}
                          disabled={busyAction !== null}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
                          Approve
                        </button>
                        <button onClick={() => rejectInvite(inv.id)}
                          disabled={busyAction !== null}
                          className="text-red-600 hover:bg-red-100 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 disabled:opacity-50">
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600 mt-3 pt-3 border-t border-amber-200">
                    <div><span className="text-slate-500">Year of birth:</span> <strong>{inv.submitted_form?.year_of_birth || '—'}</strong></div>
                    <div><span className="text-slate-500">Phone:</span> <strong>{inv.submitted_form?.phone || '—'}</strong></div>
                    <div className="col-span-2"><span className="text-slate-500">Organization:</span> <strong>{inv.submitted_form?.organization || '—'}</strong></div>
                    <div className="col-span-2"><span className="text-slate-500">Address:</span> <strong>{inv.submitted_form?.address || '—'}</strong></div>
                    <div className="col-span-2 text-slate-400">Submitted {formatDateTime(inv.submitted_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Approved students roster ────────────────────────────── */}
        <div className="mb-6">
          <h2 className="font-semibold text-slate-800 mb-2">
            Students {session.students.length ? `(${session.students.length})` : ''}
          </h2>
          {session.students.length === 0 ? (
            <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">
              No approved students yet.
              {isDraft && ' Invite students above; approve their submissions once they self-register.'}
            </p>
          ) : (
            <div className="space-y-3">
              {session.students.map(st => (
                <StudentRow key={st.id} student={st}
                  sessionStatus={session.status}
                  busyAction={busyAction}
                  onRolesChange={setPwaRoles}
                  onCertify={toggleCertification} />
              ))}
            </div>
          )}
        </div>

        {/* ── Open invites (INVITED, not yet submitted) ───────────── */}
        {openInvites.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-slate-800 mb-2">
              Awaiting student self-registration ({openInvites.length})
            </h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {openInvites.map(inv => (
                <div key={inv.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm text-slate-800">{inv.email}</p>
                    <p className="text-xs text-slate-500">
                      Invited {formatDateTime(inv.created_at)} · Expires {formatDateTime(inv.expires_at)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${INVITE_STATUS_COLOURS[inv.status]}`}>
                    Not submitted yet
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Rejected invites (audit trail) ──────────────────────── */}
        {rejectedInvites.length > 0 && (
          <details className="mb-6">
            <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-800">
              Rejected invites ({rejectedInvites.length})
            </summary>
            <div className="mt-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
              {rejectedInvites.map(inv => (
                <div key={inv.id} className="px-4 py-2 border-b border-slate-100 last:border-0 text-xs text-slate-500">
                  {inv.email} — rejected {formatDateTime(inv.approved_at)}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </AdminLayout>
  )
}


// ── Per-student row with PWA-role toggles + certification ─────────────────

function StudentRow({
  student, sessionStatus, busyAction, onRolesChange, onCertify,
}: {
  student: StudentDetail
  sessionStatus: string
  busyAction: string | null
  onRolesChange: (sid: string, roles: string[]) => void
  onCertify: (sid: string, certified: boolean) => void
}) {
  const isDraft = sessionStatus === 'DRAFT'
  const isActive = sessionStatus === 'ACTIVE'
  const isClosed = sessionStatus.startsWith('CLOSED_')
  const currentRoles = new Set(student.assigned_pwa_roles || [])

  function toggleRole(role: string) {
    const next = new Set(currentRoles)
    if (next.has(role)) next.delete(role)
    else next.add(role)
    onRolesChange(student.id, Array.from(next))
  }

  return (
    <div className={`bg-white border rounded-xl p-4 ${student.certified_at ? 'border-emerald-200' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-semibold text-slate-800">
            {student.student_name || '—'}
            {student.certified_at && (
              <span className="ml-2 text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                ✓ Certified
              </span>
            )}
          </p>
          <p className="text-sm text-slate-500">{student.student_email}</p>
          <p className="text-xs text-slate-500 mt-1">
            <span className="text-slate-400">Workspace:</span> <code className="text-slate-700">{student.workspace_short_name}</code>
            <span className="text-slate-400 ml-3">Phone:</span> <code className="text-slate-700">{student.approved_phone}</code>
          </p>
        </div>
        {isClosed && (
          <button onClick={() => onCertify(student.id, !student.certified_at)}
            disabled={busyAction !== null}
            className={`text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 ${
              student.certified_at
                ? 'text-slate-600 hover:bg-slate-100 border border-slate-300'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}>
            {busyAction === `cert-${student.id}` ? '…' : (student.certified_at ? 'Uncertify' : 'Certify')}
          </button>
        )}
      </div>

      {(isDraft || isActive) && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">
            PWA roles
          </p>
          <div className="flex flex-wrap gap-2">
            {PWA_ROLES.map(r => (
              <button key={r.value} onClick={() => toggleRole(r.value)}
                disabled={busyAction !== null}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  currentRoles.has(r.value)
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}>
                {currentRoles.has(r.value) ? '✓ ' : ''}{r.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2 italic">
            Additive — previously granted roles that aren&apos;t toggled off stay. Dealer + Facilitator can coexist in coaching.
          </p>
        </div>
      )}
    </div>
  )
}
