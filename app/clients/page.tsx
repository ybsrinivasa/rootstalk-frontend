'use client'
import { useState, useEffect, useRef } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import Link from 'next/link'

type Client = {
  id: string; full_name: string; short_name: string; ca_name: string
  ca_email: string; status: string; is_manufacturer: boolean; created_at: string
  display_name: string | null
}

const STATUS_COLOURS: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  ACTIVE:         'bg-emerald-100 text-emerald-700',
  INACTIVE:       'bg-slate-100 text-slate-500',
  REJECTED:       'bg-red-100 text-red-600',
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ full_name: '', short_name: '', ca_name: '', ca_phone: '', ca_email: '', is_manufacturer: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState('')
  const [shortNameStatus, setShortNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const snTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data } = await api.get('/admin/clients')
      setClients(data)
    } finally { setLoading(false) }
  }

  function onShortNameChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)
    setForm({ ...form, short_name: cleaned })
    setShortNameStatus('idle')
    if (snTimer.current) clearTimeout(snTimer.current)
    if (cleaned.length >= 3) {
      setShortNameStatus('checking')
      snTimer.current = setTimeout(async () => {
        try {
          const { data } = await api.get(`/admin/clients/check-short-name?short_name=${cleaned}`)
          setShortNameStatus(data.available ? 'available' : 'taken')
        } catch { setShortNameStatus('idle') }
      }, 500)
    }
  }

  async function initiate() {
    setSaving(true); setError(''); setLink('')
    try {
      const { data } = await api.post('/admin/clients/initiate', form)
      setLink(data.onboarding_link)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err.response?.data?.detail || 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
          <p className="text-slate-500 text-sm mt-0.5">{clients.length} registered</p>
        </div>
        <button onClick={() => { setShowModal(true); setError(''); setLink('') }}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          + Initiate Onboarding
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading
          ? <p className="text-center py-12 text-slate-400">Loading…</p>
          : clients.length === 0
            ? <p className="text-center py-12 text-slate-400">No companies yet. Initiate the first onboarding.</p>
            : clients.map(c => (
              <div key={c.id} className="flex items-center justify-between px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800">{c.full_name}</p>
                    {c.is_manufacturer && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">Manufacturer</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-mono bg-slate-100 px-1 rounded">{c.short_name}</span>
                    {' · '}{c.ca_name} · {c.ca_email}
                    {c.display_name && ` · Display: ${c.display_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[c.status] || ''}`}>
                    {c.status.replace('_', ' ')}
                  </span>
                  <Link href={`/clients/${c.id}`}
                    className="text-xs px-2 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-100 transition-colors">
                    View →
                  </Link>
                </div>
              </div>
            ))
        }
      </div>

      {/* New Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Initiate Company Onboarding</h2>
            {link ? (
              <div className="space-y-4">
                <p className="text-sm text-emerald-700 font-medium">Onboarding link generated!</p>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Share this link with the CA:</p>
                  <p className="text-sm font-mono text-blue-700 break-all">{link}</p>
                </div>
                <p className="text-xs text-slate-400">Link valid for 24 hours. In production, this is emailed to the CA automatically.</p>
                <div className="flex justify-end">
                  <button onClick={() => { setShowModal(false); setLink('') }}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Done</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: 'Company Legal Name', key: 'full_name', placeholder: 'Acme Agri Pvt Ltd' },
                  { label: 'CA Name', key: 'ca_name', placeholder: 'Rajesh Kumar' },
                  { label: 'CA Phone', key: 'ca_phone', placeholder: '+919876543210' },
                  { label: 'CA Email', key: 'ca_email', placeholder: 'rajesh@acmeagri.com' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
                    <input value={(form as Record<string, string | boolean>)[f.key] as string}
                      onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
                {/* Short name with real-time check — item #7 */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Short Name (max 12 chars · forms login URL)</label>
                  <div className="relative">
                    <input value={form.short_name}
                      onChange={e => onShortNameChange(e.target.value)}
                      placeholder="acmeagri"
                      maxLength={12}
                      className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 ${
                        shortNameStatus === 'taken' ? 'border-red-300 focus:ring-red-300' :
                        shortNameStatus === 'available' ? 'border-green-300 focus:ring-green-300' :
                        'border-slate-200 focus:ring-blue-500'
                      }`} />
                    {shortNameStatus === 'checking' && <span className="absolute right-3 top-2 text-xs text-slate-400">Checking…</span>}
                    {shortNameStatus === 'available' && <span className="absolute right-3 top-2 text-xs text-green-600">✓ Available</span>}
                    {shortNameStatus === 'taken' && <span className="absolute right-3 top-2 text-xs text-red-500">✗ Already taken</span>}
                  </div>
                  {form.short_name && <p className="text-xs text-slate-400 mt-1">Login URL: rootstalk.in/<strong>{form.short_name}</strong></p>}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_manufacturer}
                    onChange={e => setForm({ ...form, is_manufacturer: e.target.checked })}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-slate-700">Is Manufacturer (enables QR module)</span>
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
                  <button onClick={initiate} disabled={saving || !form.full_name || !form.short_name || !form.ca_email || shortNameStatus === 'taken' || shortNameStatus === 'checking'}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Creating…' : 'Create & Get Link'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
