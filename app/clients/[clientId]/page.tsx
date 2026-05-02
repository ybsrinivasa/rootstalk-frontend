'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

type Client = {
  id: string; full_name: string; short_name: string; display_name: string | null
  ca_name: string; ca_email: string; ca_phone: string; status: string
  is_manufacturer: boolean; hq_address: string | null; gst_number: string | null
  pan_number: string | null; primary_colour: string | null; secondary_colour: string | null
  tagline: string | null; logo_url: string | null; website: string | null
  support_phone: string | null; office_phone: string | null; social_links: Record<string, string> | null
  rejection_reason: string | null; approved_at: string | null; created_at: string
}

const ORG_TYPES = [
  { id: 'org_type_seed_companies', label: 'Seed Companies' },
  { id: 'org_type_pesticide_mfr', label: 'Pesticide Manufacturer' },
  { id: 'org_type_fertiliser_mfr', label: 'Fertiliser Manufacturer' },
  { id: 'org_type_agri_university', label: 'Agricultural University / KVK' },
  { id: 'org_type_govt_dept', label: 'Government Line Department' },
  { id: 'org_type_nonprofit', label: 'Not-for-profit' },
  { id: 'org_type_private_company', label: 'Private Company' },
  { id: 'org_type_research_inst', label: 'Research Institution' },
]

export default function ClientDetailPage() {
  const { clientId } = useParams()
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [newLink, setNewLink] = useState('')
  const [editForm, setEditForm] = useState<Partial<Client> & { org_type_cosh_ids?: string[] }>({})
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)
  // CM assignment
  const [cmAssignment, setCmAssignment] = useState<{ cm_user_id: string | null; cm_name: string | null; cm_email: string | null; rights: string | null } | null>(null)
  const [allCMs, setAllCMs] = useState<{ id: string; name: string | null; email: string | null }[]>([])
  const [showCMAssign, setShowCMAssign] = useState(false)
  const [cmForm, setCmForm] = useState({ cm_user_id: '', rights: 'EDIT' })
  const [savingCM, setSavingCM] = useState(false)

  useEffect(() => { load() }, [clientId])

  async function load() {
    try {
      const [clientRes, cmRes, usersRes] = await Promise.allSettled([
        api.get(`/admin/clients/${clientId}`),
        api.get(`/admin/clients/${clientId}/cm-assignment`),
        api.get('/admin/users'),
      ])
      if (clientRes.status === 'fulfilled') setClient(clientRes.value.data)
      if (cmRes.status === 'fulfilled') setCmAssignment(cmRes.value.data)
      if (usersRes.status === 'fulfilled') {
        const cms = (usersRes.value.data as { id: string; name: string | null; email: string | null; roles: string[] }[])
          .filter(u => u.roles.includes('CONTENT_MANAGER'))
        setAllCMs(cms)
      }
    } finally { setLoading(false) }
  }

  async function saveCMAssignment() {
    setSavingCM(true)
    try {
      await api.put(`/admin/clients/${clientId}/cm-assignment`, cmForm)
      setShowCMAssign(false)
      load()
    } finally { setSavingCM(false) }
  }

  async function removeCMAssignment() {
    if (!confirm('Remove CM from this client?')) return
    await api.delete(`/admin/clients/${clientId}/cm-assignment`)
    load()
  }

  function openEdit() {
    if (!client) return
    setEditForm({
      full_name: client.full_name,
      display_name: client.display_name || '',
      tagline: client.tagline || '',
      ca_name: client.ca_name,
      ca_phone: client.ca_phone,
      ca_email: client.ca_email,
      is_manufacturer: client.is_manufacturer,
      logo_url: client.logo_url || '',
      primary_colour: client.primary_colour || '',
      secondary_colour: client.secondary_colour || '',
      hq_address: client.hq_address || '',
      website: client.website || '',
      support_phone: client.support_phone || '',
      office_phone: client.office_phone || '',
      social_links: client.social_links || {},
    })
    setShowEdit(true)
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('folder', 'logos')
      const { data } = await api.post('/media/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setEditForm(f => ({ ...f, logo_url: data.url }))
    } finally { setUploadingLogo(false) }
  }

  async function saveEdit() {
    setSaving(true)
    try {
      const payload = { ...editForm }
      if (!payload.logo_url) delete payload.logo_url
      await api.put(`/admin/clients/${clientId}`, payload)
      setShowEdit(false)
      load()
    } finally { setSaving(false) }
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

  async function regenerateLink() {
    setRegenerating(true)
    try {
      const { data } = await api.post(`/admin/clients/${clientId}/regenerate-link`)
      setNewLink(data.onboarding_link)
    } finally { setRegenerating(false) }
  }

  if (loading) return <AdminLayout><div className="py-20 text-center text-slate-400">Loading…</div></AdminLayout>
  if (!client) return <AdminLayout><div className="py-20 text-center text-red-500">Not found</div></AdminLayout>

  const hasCaData = !!client.display_name || !!client.hq_address
  const loginUrl = `https://rootstalk.in/${client.short_name}`

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-700 text-sm">← Back</button>
        <span className="text-slate-300">|</span>
        {client.logo_url && <img src={client.logo_url} alt="" className="w-8 h-8 rounded object-cover border border-slate-200" />}
        <h1 className="text-xl font-bold text-slate-900">{client.full_name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          { ACTIVE: 'bg-emerald-100 text-emerald-700', PENDING_REVIEW: 'bg-amber-100 text-amber-700',
            INACTIVE: 'bg-slate-100 text-slate-500', REJECTED: 'bg-red-100 text-red-600' }[client.status] || ''
        }`}>{client.status.replace('_', ' ')}</span>
        {/* Login URL — item #6 */}
        {client.status === 'ACTIVE' && (
          <a href={loginUrl} target="_blank" rel="noopener noreferrer"
            className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 font-mono">
            {loginUrl} ↗
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {/* SA-side */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">SA Details</p>
          <Row label="Short name" value={<span className="font-mono bg-slate-100 px-1.5 rounded text-sm">{client.short_name}</span>} />
          <Row label="Login URL" value={<span className="text-xs font-mono text-blue-600">{loginUrl}</span>} />
          <Row label="CA Name" value={client.ca_name} />
          <Row label="CA Email" value={client.ca_email} />
          <Row label="CA Phone" value={client.ca_phone} />
          <Row label="Manufacturer" value={client.is_manufacturer ? 'Yes — QR module enabled' : 'No'} />
          <Row label="Registered" value={new Date(client.created_at).toLocaleDateString()} />
          {client.approved_at && <Row label="Approved" value={new Date(client.approved_at).toLocaleDateString()} />}
          {client.rejection_reason && (
            <div className="mt-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-red-600 mb-0.5">Rejection reason</p>
              <p className="text-xs text-red-700">{client.rejection_reason}</p>
            </div>
          )}
        </div>

        {/* CA-side */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">CA Submission</p>
          {!hasCaData
            ? <p className="text-sm text-slate-400 italic">CA has not submitted their details yet.</p>
            : <>
              {client.logo_url && (
                <div className="mb-3">
                  <img src={client.logo_url} alt="Logo" className="h-12 object-contain border border-slate-100 rounded-lg p-1 bg-white" />
                </div>
              )}
              <Row label="Display Name" value={client.display_name} />
              <Row label="Tagline" value={client.tagline} />
              <Row label="Address" value={client.hq_address} />
              <Row label="GST" value={client.gst_number} />
              <Row label="PAN" value={client.pan_number} />
              <Row label="Website" value={client.website} />
              <Row label="Support Phone" value={client.support_phone} />
              {client.primary_colour && (
                <div className="flex items-center gap-2 py-1.5 border-b border-slate-50">
                  <span className="text-xs text-slate-400 w-32">Colours</span>
                  <div className="flex gap-1 items-center">
                    <div className="w-5 h-5 rounded border border-slate-200" style={{ background: client.primary_colour }} />
                    <span className="text-xs font-mono text-slate-600">{client.primary_colour}</span>
                    {client.secondary_colour && (
                      <>
                        <div className="w-5 h-5 rounded border border-slate-200 ml-1" style={{ background: client.secondary_colour }} />
                        <span className="text-xs font-mono text-slate-600">{client.secondary_colour}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              {client.social_links && Object.keys(client.social_links).length > 0 && (
                <div className="py-1.5 border-b border-slate-50">
                  <span className="text-xs text-slate-400">Social</span>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {Object.entries(client.social_links).map(([k, v]) => v && (
                      <a key={k} href={v} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize hover:bg-slate-200">{k}</a>
                    ))}
                  </div>
                </div>
              )}
            </>
          }
        </div>
      </div>

      {/* CM Assignment section */}
      {client.status === 'ACTIVE' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Assigned Content Manager</p>
            {cmAssignment?.cm_user_id ? (
              <div className="flex gap-2">
                <button onClick={() => { setCmForm({ cm_user_id: cmAssignment.cm_user_id!, rights: cmAssignment.rights || 'EDIT' }); setShowCMAssign(true) }}
                  className="text-xs px-3 py-1 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                  Change
                </button>
                <button onClick={removeCMAssignment}
                  className="text-xs px-3 py-1 border border-red-200 rounded-lg text-red-500 hover:bg-red-50">
                  Remove
                </button>
              </div>
            ) : (
              <button onClick={() => { setCmForm({ cm_user_id: '', rights: 'EDIT' }); setShowCMAssign(true) }}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                + Assign CM
              </button>
            )}
          </div>
          {cmAssignment?.cm_user_id ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm">
                {(cmAssignment.cm_name || 'C')[0]}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{cmAssignment.cm_name || '—'}</p>
                <p className="text-xs text-slate-400">{cmAssignment.cm_email}</p>
              </div>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                cmAssignment.rights === 'EDIT' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {cmAssignment.rights === 'EDIT' ? 'Edit rights' : 'View only'}
              </span>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No CM assigned. Content for this client is unmanaged.</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
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
        {/* Regenerate link — item #1: show for REJECTED or PENDING_REVIEW (link might have expired) */}
        {['REJECTED', 'PENDING_REVIEW'].includes(client.status) && (
          <button onClick={regenerateLink} disabled={regenerating}
            className="px-5 py-2 text-sm border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50">
            {regenerating ? 'Generating…' : '↻ Regenerate & Resend Link'}
          </button>
        )}
        {(client.status === 'ACTIVE' || client.status === 'INACTIVE') && (
          <>
            <button onClick={openEdit}
              className="px-5 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
              Edit Details
            </button>
            <button onClick={toggleStatus}
              className={`px-5 py-2 text-sm rounded-lg font-medium ${
                client.status === 'ACTIVE'
                  ? 'border border-red-200 text-red-500 hover:bg-red-50'
                  : 'border border-emerald-200 text-emerald-600 hover:bg-emerald-50'
              }`}>
              {client.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </button>
          </>
        )}
      </div>

      {/* Regenerated link display */}
      {newLink && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-blue-700 mb-1">New onboarding link (valid 24 hours):</p>
          <div className="flex items-center gap-2">
            <p className="text-xs font-mono text-blue-800 flex-1 truncate">{newLink}</p>
            <button onClick={() => { navigator.clipboard.writeText(newLink) }}
              className="text-xs text-blue-600 border border-blue-300 px-2 py-1 rounded hover:bg-blue-100 shrink-0">
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showReject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900 mb-3">Reject Application</h2>
            <p className="text-sm text-slate-500 mb-3">Reason (will be recorded; send a new link to let them resubmit):</p>
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

      {/* Edit modal — item #2 */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-lg">Edit Company Details</h2>
              <button onClick={() => setShowEdit(false)} className="text-slate-400 text-xl">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                ⚠ Short Name and Login URL cannot be changed. GST and PAN are locked post-approval.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Full Name" value={editForm.full_name || ''} onChange={v => setEditForm(f => ({ ...f, full_name: v }))} />
                <Field label="PWA Display Name" value={editForm.display_name || ''} onChange={v => setEditForm(f => ({ ...f, display_name: v }))} />
                <Field label="CA Name" value={editForm.ca_name || ''} onChange={v => setEditForm(f => ({ ...f, ca_name: v }))} />
                <Field label="CA Email" value={editForm.ca_email || ''} onChange={v => setEditForm(f => ({ ...f, ca_email: v }))} type="email" />
                <Field label="CA Phone" value={editForm.ca_phone || ''} onChange={v => setEditForm(f => ({ ...f, ca_phone: v }))} />
                <Field label="Tagline" value={editForm.tagline || ''} onChange={v => setEditForm(f => ({ ...f, tagline: v }))} />
              </div>

              {/* Logo upload — item #3 */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Company Logo</label>
                <div className="flex items-center gap-3">
                  {editForm.logo_url && (
                    <img src={editForm.logo_url} alt="Logo" className="h-12 object-contain border border-slate-200 rounded-lg p-1" />
                  )}
                  <input ref={logoRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                  <button onClick={() => logoRef.current?.click()} disabled={uploadingLogo}
                    className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    {uploadingLogo ? 'Uploading…' : editForm.logo_url ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  {editForm.logo_url && (
                    <button onClick={() => setEditForm(f => ({ ...f, logo_url: '' }))}
                      className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Primary Colour" value={editForm.primary_colour || ''} onChange={v => setEditForm(f => ({ ...f, primary_colour: v }))} type="color" />
                <Field label="Secondary Colour" value={editForm.secondary_colour || ''} onChange={v => setEditForm(f => ({ ...f, secondary_colour: v }))} type="color" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Website" value={editForm.website || ''} onChange={v => setEditForm(f => ({ ...f, website: v }))} />
                <Field label="Support Phone" value={editForm.support_phone || ''} onChange={v => setEditForm(f => ({ ...f, support_phone: v }))} />
                <Field label="Office Phone" value={editForm.office_phone || ''} onChange={v => setEditForm(f => ({ ...f, office_phone: v }))} />
                <div className="col-span-2">
                  <Field label="HQ Address" value={editForm.hq_address || ''} onChange={v => setEditForm(f => ({ ...f, hq_address: v }))} />
                </div>
              </div>

              {/* Social links — mirrors CA form */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Social Media</label>
                <div className="grid grid-cols-2 gap-2">
                  {['twitter', 'instagram', 'linkedin', 'facebook', 'youtube'].map(platform => (
                    <div key={platform} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-16 capitalize shrink-0">{platform}</span>
                      <input value={(editForm.social_links as Record<string, string>)?.[platform] || ''}
                        onChange={e => setEditForm(f => ({
                          ...f,
                          social_links: { ...(f.social_links || {}), [platform]: e.target.value }
                        }))}
                        placeholder="URL"
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Is Manufacturer + Org Types — item #8 */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!editForm.is_manufacturer}
                    onChange={e => setEditForm(f => ({ ...f, is_manufacturer: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                  <span className="text-sm text-slate-700">Is Manufacturer (enables QR Code module)</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Organisation Types</label>
                <div className="grid grid-cols-2 gap-2">
                  {ORG_TYPES.map(ot => (
                    <label key={ot.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox"
                        checked={(editForm.org_type_cosh_ids || []).includes(ot.id)}
                        onChange={e => {
                          const current = editForm.org_type_cosh_ids || []
                          setEditForm(f => ({
                            ...f,
                            org_type_cosh_ids: e.target.checked
                              ? [...current, ot.id]
                              : current.filter(x => x !== ot.id),
                          }))
                        }}
                        className="w-4 h-4 rounded" />
                      <span className="text-xs text-slate-700">{ot.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowEdit(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-40">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CM assignment modal */}
      {showCMAssign && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Assign Content Manager</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Content Manager</label>
                <select value={cmForm.cm_user_id}
                  onChange={e => setCmForm(f => ({ ...f, cm_user_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none">
                  <option value="">Select a CM…</option>
                  {allCMs.map(cm => (
                    <option key={cm.id} value={cm.id}>{cm.name || 'Unnamed'} ({cm.email})</option>
                  ))}
                </select>
                {allCMs.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No Content Managers created yet. Add CMs in Team Users first.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Access Rights</label>
                <div className="flex gap-2">
                  {(['EDIT', 'VIEW'] as const).map(r => (
                    <button key={r} onClick={() => setCmForm(f => ({ ...f, rights: r }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-xl border-2 transition-all ${
                        cmForm.rights === r ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                      }`}>
                      {r === 'EDIT' ? 'Edit (default)' : 'View Only'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {cmForm.rights === 'EDIT' ? 'CM can view and edit advisory content for this client' : 'CM can view but cannot make changes'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCMAssign(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={saveCMAssignment} disabled={!cmForm.cm_user_id || savingCM}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {savingCM ? 'Saving…' : 'Assign CM'}
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

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white" />
    </div>
  )
}
