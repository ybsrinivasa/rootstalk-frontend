'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (form.new_password !== form.confirm) { setError('New passwords do not match'); return }
    if (form.new_password.length < 8) { setError('New password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await api.put('/auth/admin/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      setSuccess('Password changed successfully.')
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to change password')
    } finally { setLoading(false) }
  }

  return (
    <AdminLayout>
      <div className="max-w-sm mx-auto mt-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Change Password</h1>
        <p className="text-slate-500 text-sm mb-6">Enter your current password and choose a new one</p>
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          {['current_password', 'new_password', 'confirm'].map((field, i) => (
            <div key={field}>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {field === 'current_password' ? 'Current password' : field === 'new_password' ? 'New password' : 'Confirm new password'}
              </label>
              <input type="password"
                value={(form as Record<string, string>)[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                required autoFocus={i === 0}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">⚠ {error}</p>}
          {success && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-2">✓ {success}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)' }}>
            {loading ? 'Saving…' : 'Change Password'}
          </button>
        </form>
        <button onClick={() => router.back()} className="mt-4 text-sm text-slate-400 hover:text-slate-600 block text-center">
          ← Back
        </button>
      </div>
    </AdminLayout>
  )
}
