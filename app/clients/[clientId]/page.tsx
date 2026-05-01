'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type Client = {
  id: string; full_name: string; short_name: string; display_name: string | null
  ca_name: string; ca_email: string; ca_phone: string; status: string
  is_manufacturer: boolean; hq_address: string | null; gst_number: string | null
  pan_number: string | null; primary_colour: string | null; tagline: string | null
  website: string | null; support_phone: string | null; rejection_reason: string | null
  approved_at: string | null; created_at: string
}

export default function ClientDetailPage() {
  const { clientId } = useParams()
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)

  useEffect(() => { load() }, [clientId])

  async function load() {
    try {
      const { data } = await api.get(`/admin/clients/${clientId}`)
      setClient(data)
    } finally { setLoading(false) }
  }

  async function approve() {
    setActing(true)
    try {
      await api.put(`/admin/clients/${clientId}/approve`)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err.response?.data?.detail || 'Failed to approve')
    } finally { setActing(false) }
  }

  async function reject() {
    if (!rejectReason.trim()) return
    setActing(true)
    try {
      await api.put(`/admin/clients/${clientId}/reject`, { reason: rejectReason })
      setShowReject(false)
      load()
    } finally { setActing(false) }
  }

  async function toggleStatus() {
    if (!client) return
    const newStatus = client.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await api.put(`/admin/clients/${clientId}/status`, { status: newStatus })
    load()
  }

  if (loading) return <AdminLayout><div className="py-20 text-center text-slate-400">Loading…</div></AdminLayout>
  if (!client) return <AdminLayout><div className="py-20 text-center text-red-500">Not found</div></AdminLayout>

  const hasCaData = !!client.display_name || !!client.hq_address

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-700 text-sm">← Back</button>
        <span className="text-slate-300">|</span>
        <h1 className="text-xl font-bold text-slate-900">{client.full_name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          { ACTIVE: 'bg-emerald-100 text-emerald-700', PENDING_REVIEW: 'bg-amber-100 text-amber-700',
            INACTIVE: 'bg-slate-100 text-slate-500', REJECTED: 'bg-red-100 text-red-600' }[client.status] || ''
        }`}>{client.status.replace('_', ' ')}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {/* SA-side */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">SA Details</p>
          <Row label="Short name" value={<span className="font-mono bg-slate-100 px-1.5 rounded text-sm">{client.short_name}</span>} />
          <Row label="CA Name" value={client.ca_name} />
          <Row label="CA Email" value={client.ca_email} />
          <Row label="CA Phone" value={client.ca_phone} />
          <Row label="Manufacturer" value={client.is_manufacturer ? 'Yes' : 'No'} />
          <Row label="Registered" value={new Date(client.created_at).toLocaleDateString()} />
          {client.approved_at && <Row label="Approved" value={new Date(client.approved_at).toLocaleDateString()} />}
          {client.rejection_reason && <Row label="Rejection reason" value={client.rejection_reason} />}
        </div>

        {/* CA-side */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">CA Submission</p>
          {!hasCaData
            ? <p className="text-sm text-slate-400 italic">CA has not submitted their details yet.</p>
            : <>
              <Row label="Display Name" value={client.display_name} />
              <Row label="Tagline" value={client.tagline} />
              <Row label="Address" value={client.hq_address} />
              <Row label="GST Number" value={client.gst_number} />
              <Row label="PAN Number" value={client.pan_number} />
              <Row label="Website" value={client.website} />
              <Row label="Support Phone" value={client.support_phone} />
              {client.primary_colour && (
                <div className="flex items-center gap-2 py-1.5 border-b border-slate-50">
                  <span className="text-xs text-slate-400 w-32">Primary Colour</span>
                  <div className="w-5 h-5 rounded border border-slate-200" style={{ background: client.primary_colour }} />
                  <span className="text-sm font-mono text-slate-700">{client.primary_colour}</span>
                </div>
              )}
            </>
          }
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {client.status === 'PENDING_REVIEW' && hasCaData && (
          <>
            <button onClick={approve} disabled={acting}
              className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
              {acting ? 'Processing…' : 'Approve & Create CA Account'}
            </button>
            <button onClick={() => setShowReject(true)}
              className="px-5 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
              Reject
            </button>
          </>
        )}
        {(client.status === 'ACTIVE' || client.status === 'INACTIVE') && (
          <button onClick={toggleStatus}
            className={`px-5 py-2 text-sm rounded-lg font-medium ${
              client.status === 'ACTIVE'
                ? 'border border-red-200 text-red-500 hover:bg-red-50'
                : 'border border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            }`}>
            {client.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      {/* Reject modal */}
      {showReject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900 mb-3">Reject Application</h2>
            <p className="text-sm text-slate-500 mb-3">Please provide a reason (sent to the CA):</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="Reason for rejection…" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowReject(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={reject} disabled={!rejectReason.trim() || acting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {acting ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-700">{value}</span>
    </div>
  )
}
