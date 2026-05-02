'use client'
import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface NeytiryUser {
  id: string; name: string | null; phone: string | null; email: string | null
  roles: string[]; privileges: string[]; status: string
}

const ROLE_OPTIONS = [
  { value: 'CONTENT_MANAGER', label: 'Content Manager', colour: 'bg-purple-100 text-purple-700' },
  { value: 'RELATIONSHIP_MANAGER', label: 'Relationship Manager', colour: 'bg-sky-100 text-sky-700' },
  { value: 'BUSINESS_MANAGER', label: 'Business Manager', colour: 'bg-amber-100 text-amber-700' },
]

const PRIVILEGE_OPTIONS = [
  { value: 'CROP_HEALTH_CROPS', label: 'Crop Health Crops' },
  { value: 'BRAND_HANDLING', label: 'Brand Handling' },
  { value: 'VOLUME_CALCULATIONS', label: 'Volume Calculations' },
]

function roleLabel(r: string) { return ROLE_OPTIONS.find(x => x.value === r)?.label || r }
function roleColour(r: string) { return ROLE_OPTIONS.find(x => x.value === r)?.colour || 'bg-slate-100 text-slate-600' }

export default function UsersPage() {
  const [users, setUsers] = useState<NeytiryUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<NeytiryUser | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', roles: [] as string[] })
  const [privModal, setPrivModal] = useState<NeytiryUser | null>(null)
  const [selectedPrivs, setSelectedPrivs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = () =>
    api.get<NeytiryUser[]>('/admin/users')
      .then(r => setUsers(r.data))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  function toggleRole(role: string) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }))
  }

  async function save() {
    setError('')
    if (!form.email.trim() || form.roles.length === 0) {
      setError('Email and at least one role are required.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/admin/users/${editing.id}`, { name: form.name, phone: form.phone, email: form.email })
        setSuccess('User updated.')
      } else {
        await api.post('/admin/users', form)
        setSuccess('User created. Login credentials have been sent by email.')
      }
      setShowCreate(false); setEditing(null)
      setForm({ name: '', phone: '', email: '', roles: [] })
      load()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to save user')
    } finally { setSaving(false) }
    setTimeout(() => setSuccess(''), 4000)
  }

  async function toggleStatus(user: NeytiryUser) {
    const activate = user.status !== 'ACTIVE'
    await api.put(`/admin/users/${user.id}/status`, { active: activate })
    load()
  }

  async function savePrivileges() {
    if (!privModal) return
    setSaving(true)
    try {
      await api.put(`/admin/users/${privModal.id}/privileges`, { privileges: selectedPrivs })
      setPrivModal(null)
      load()
    } finally { setSaving(false) }
  }

  function openEdit(user: NeytiryUser) {
    setEditing(user)
    setForm({ name: user.name || '', phone: user.phone || '', email: user.email || '', roles: user.roles })
    setShowCreate(true)
  }

  function openPriv(user: NeytiryUser) {
    setPrivModal(user)
    setSelectedPrivs([...user.privileges])
  }

  const cms = users.filter(u => u.roles.includes('CONTENT_MANAGER'))
  const rms = users.filter(u => !u.roles.includes('CONTENT_MANAGER'))

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Neytiri Portal Users</h1>
            <p className="text-sm text-gray-500 mt-1">Content Managers, Relationship Managers, and Business Managers</p>
          </div>
          <button onClick={() => { setEditing(null); setForm({ name: '', phone: '', email: '', roles: [] }); setShowCreate(true) }}
            className="px-4 py-2 bg-[#1A5C2A] text-white text-sm font-semibold rounded-lg hover:bg-[#145024]">
            + Add User
          </button>
        </div>

        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm font-medium">
            {success}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
            <p className="text-3xl mb-3">👥</p>
            <p className="text-gray-500 font-medium">No Neytiri portal users yet</p>
            <p className="text-sm text-gray-400 mt-1">Add the first Content Manager, RM, or BM</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Content Managers */}
            {cms.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Content Managers ({cms.length})</h2>
                <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {cms.map(user => (
                    <div key={user.id} className="flex items-center justify-between px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{user.name || '—'}</p>
                          {user.roles.map(r => (
                            <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColour(r)}`}>
                              {roleLabel(r)}
                            </span>
                          ))}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {user.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{user.email} {user.phone ? `· ${user.phone}` : ''}</p>
                        {user.privileges.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {user.privileges.map(p => (
                              <span key={p} className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-md">{p.replace(/_/g, ' ')}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0 ml-3">
                        <button onClick={() => openPriv(user)}
                          className="text-xs font-medium text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100">
                          Privileges
                        </button>
                        <button onClick={() => openEdit(user)}
                          className="text-xs font-medium text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100">
                          Edit
                        </button>
                        <button onClick={() => toggleStatus(user)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg ${user.status === 'ACTIVE' ? 'text-red-500 bg-red-50 hover:bg-red-100' : 'text-green-600 bg-green-50 hover:bg-green-100'}`}>
                          {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* RMs and BMs */}
            {rms.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Relationship & Business Managers ({rms.length})</h2>
                <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {rms.map(user => (
                    <div key={user.id} className="flex items-center justify-between px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{user.name || '—'}</p>
                          {user.roles.map(r => (
                            <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColour(r)}`}>
                              {roleLabel(r)}
                            </span>
                          ))}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {user.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{user.email} {user.phone ? `· ${user.phone}` : ''}</p>
                      </div>
                      <div className="flex gap-2 shrink-0 ml-3">
                        <button onClick={() => openEdit(user)}
                          className="text-xs font-medium text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100">
                          Edit
                        </button>
                        <button onClick={() => toggleStatus(user)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg ${user.status === 'ACTIVE' ? 'text-red-500 bg-red-50 hover:bg-red-100' : 'text-green-600 bg-green-50 hover:bg-green-100'}`}>
                          {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editing ? 'Edit User' : 'Add Neytiri Portal User'}
            </h2>
            {error && <p className="text-sm text-red-500 mb-3 bg-red-50 rounded-lg p-2">{error}</p>}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                <input value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5C2A]/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  disabled={!!editing}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5C2A]/30 disabled:bg-gray-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mobile</label>
                <input value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5C2A]/30" />
              </div>
              {!editing && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Role(s) *</label>
                  <div className="space-y-2">
                    {ROLE_OPTIONS.map(r => (
                      <button key={r.value} onClick={() => toggleRole(r.value)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                          form.roles.includes(r.value)
                            ? 'border-[#1A5C2A] bg-[#1A5C2A]/5 text-[#1A5C2A]'
                            : 'border-gray-200 text-gray-600'
                        }`}>
                        <span>{r.label}</span>
                        {form.roles.includes(r.value) && <span className="text-[#1A5C2A]">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!editing && (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                  Login credentials will be sent to the email address after creation.
                </p>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={save} disabled={saving}
                className="flex-1 py-3 bg-[#1A5C2A] text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-[#145024]">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create User'}
              </button>
              <button onClick={() => { setShowCreate(false); setEditing(null); setError('') }}
                className="px-5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privileges modal */}
      {privModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">CM Privileges</h2>
            <p className="text-sm text-gray-500 mb-4">{privModal.name || privModal.email}</p>
            <div className="space-y-2">
              {PRIVILEGE_OPTIONS.map(p => (
                <button key={p.value}
                  onClick={() => setSelectedPrivs(prev =>
                    prev.includes(p.value) ? prev.filter(x => x !== p.value) : [...prev, p.value]
                  )}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    selectedPrivs.includes(p.value)
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 text-gray-600'
                  }`}>
                  <span>{p.label}</span>
                  {selectedPrivs.includes(p.value) && <span className="text-purple-500">✓</span>}
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={savePrivileges} disabled={saving}
                className="flex-1 py-3 bg-purple-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-purple-700">
                {saving ? 'Saving…' : 'Save Privileges'}
              </button>
              <button onClick={() => setPrivModal(null)}
                className="px-5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
