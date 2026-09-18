'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import Link from 'next/link'
import { extractErrorMessage } from '@/lib/errors'

type Client = {
  id: string; full_name: string; short_name: string; ca_name: string
  ca_email: string; status: string; is_manufacturer: boolean; created_at: string
  display_name: string | null
  is_coaching?: boolean
  is_training?: boolean
}

type TabKey = 'companies' | 'coaching' | 'training'

const STATUS_COLOURS: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  ACTIVE:         'bg-emerald-100 text-emerald-700',
  INACTIVE:       'bg-slate-100 text-slate-500',
  REJECTED:       'bg-red-100 text-red-600',
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('companies')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<{
    full_name: string; short_name: string; ca_name: string;
    ca_phone: string; ca_email: string; is_manufacturer: boolean;
    payment_model: 'COMPANY_PAYS' | 'FARMER_PAYS' | '';
    // Advisory-Only Mode (2026-09-16). Snapshot on Subscription at
    // create; SA can flip anytime post-onboarding via the edit form.
    advisory_only_mode: boolean;
    dealer_list_enabled: boolean;
    subscription_fee_paise: number | null;
    input_alert_lead_days: number | null;
  }>({
    full_name: '', short_name: '', ca_name: '', ca_phone: '',
    ca_email: '', is_manufacturer: false, payment_model: '',
    advisory_only_mode: false, dealer_list_enabled: false,
    subscription_fee_paise: null,
    input_alert_lead_days: null,
  })
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
      setError(extractErrorMessage(e, 'Failed'))
    } finally { setSaving(false) }
  }

  const bucketed = useMemo(() => {
    const companies: Client[] = []
    const coaching: Client[] = []
    const training: Client[] = []
    for (const c of clients) {
      if (c.is_coaching) coaching.push(c)
      else if (c.is_training) training.push(c)
      else companies.push(c)
    }
    return { companies, coaching, training }
  }, [clients])

  const visible = tab === 'companies' ? bucketed.companies : tab === 'coaching' ? bucketed.coaching : bucketed.training
  const tabHeading = tab === 'companies' ? 'Companies' : tab === 'coaching' ? 'Coaching Workspaces' : 'Training Workspaces'
  const emptyCopy = tab === 'companies'
    ? 'No companies yet. Initiate the first onboarding.'
    : tab === 'coaching'
      ? 'No coaching workspaces. Provisioned when a coach approves a student.'
      : 'No training workspaces. Created by CA-portal training sessions.'

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{tabHeading}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{visible.length} of {clients.length} total</p>
        </div>
        <button onClick={() => { setShowModal(true); setError(''); setLink('') }}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          + Initiate Onboarding
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {([
          { key: 'companies', label: 'Companies', count: bucketed.companies.length },
          { key: 'coaching',  label: 'Coaching',  count: bucketed.coaching.length },
          { key: 'training',  label: 'Training',  count: bucketed.training.length },
        ] as { key: TabKey; label: string; count: number }[]).map(t => {
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {t.label} <span className="text-xs text-slate-400 ml-1">({t.count})</span>
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading
          ? <p className="text-center py-12 text-slate-400">Loading…</p>
          : visible.length === 0
            ? <p className="text-center py-12 text-slate-400">{emptyCopy}</p>
            : visible.map(c => {
              // On Coaching / Training tabs the tab itself signals the
              // sandbox nature — strip the redundant "[Coaching] " /
              // "[Training] " prefix from the display name.
              const shownName = tab === 'companies'
                ? c.full_name
                : c.full_name.replace(/^\[(Coaching|Training)\]\s*/, '')
              return (
              <div key={c.id} className="flex items-center justify-between px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800">{shownName}</p>
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
              )
            })
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
                    <input value={(form as Record<string, string | boolean | number | null>)[f.key] as string}
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
                  {form.short_name && (
                    <p className="text-xs text-slate-400 mt-1">
                      Login URL path: <strong>/{form.short_name}</strong>
                      {' '}<span className="text-slate-300">(host filled in after onboarding)</span>
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_manufacturer}
                    onChange={e => setForm({ ...form, is_manufacturer: e.target.checked })}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-slate-700">Is Manufacturer (enables QR module)</span>
                </label>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Payment Model</label>
                  <p className="text-xs text-slate-500 mb-2">
                    How the company is set up to operate on RootsTalk (spec §11.1).
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer mb-2">
                    <input type="radio" name="payment_model" value="COMPANY_PAYS"
                      checked={form.payment_model === 'COMPANY_PAYS'}
                      onChange={() => setForm({ ...form, payment_model: 'COMPANY_PAYS' })}
                      className="w-4 h-4 mt-0.5 accent-blue-600" />
                    <div>
                      <div className="text-sm text-slate-800 font-medium">Company Pays</div>
                      <div className="text-xs text-slate-500">
                        Farmers cannot self-subscribe. Only company-designated promoters
                        can assign packages on behalf of the company.
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="payment_model" value="FARMER_PAYS"
                      checked={form.payment_model === 'FARMER_PAYS'}
                      onChange={() => setForm({ ...form, payment_model: 'FARMER_PAYS' })}
                      className="w-4 h-4 mt-0.5 accent-blue-600" />
                    <div>
                      <div className="text-sm text-slate-800 font-medium">Farmer Pays</div>
                      <div className="text-xs text-slate-500">
                        Farmers self-subscribe and pay directly. The company can also
                        assign via promoters (consumes the pool).
                      </div>
                    </div>
                  </label>
                </div>

                {/* Advisory-Only Mode section (2026-09-16). Two checkboxes:
                    the main mode + the optional dealer-list add-on
                    (greyed out unless the main is checked). Plus a
                    subscription-fee override that defaults to ₹99 when
                    Advisory-only is ticked. See
                    docs/AdvisoryOnly_v1_scoping.md §6. */}
                <div className="border-t border-slate-200 pt-4">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.advisory_only_mode}
                      onChange={e => setForm({
                        ...form,
                        advisory_only_mode: e.target.checked,
                        // Default subscription_fee_paise to ₹99 (9900) on
                        // check; clear on uncheck so traditional pricing
                        // resumes. Dealer-list is meaningful only when
                        // this is on.
                        subscription_fee_paise: e.target.checked ? 9900 : null,
                        dealer_list_enabled: e.target.checked && form.dealer_list_enabled,
                      })}
                      className="w-4 h-4 mt-0.5 accent-purple-600" />
                    <div>
                      <div className="text-sm text-slate-800 font-medium">Advisory-only mode</div>
                      <div className="text-xs text-slate-500">
                        Farmer sees input details up front and buys from any dealer.
                        In-app ordering, dealer/facilitator payment routing, and
                        brand-lock are hidden. This flag can be flipped anytime — existing
                        subscriptions keep the mode captured when they were created; only
                        new subscriptions pick up the current setting.
                      </div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 mt-2 ml-6 ${form.advisory_only_mode ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                    <input type="checkbox" checked={form.dealer_list_enabled}
                      disabled={!form.advisory_only_mode}
                      onChange={e => setForm({ ...form, dealer_list_enabled: e.target.checked })}
                      className="w-4 h-4 mt-0.5 accent-purple-600" />
                    <div>
                      <div className="text-sm text-slate-800 font-medium">Show nearby-dealers list</div>
                      <div className="text-xs text-slate-500">
                        Include a read-only list of the 5 nearest onboarded dealers
                        on the farmer&apos;s crop dashboard, with search-by-location and
                        map view. No orders can be placed from this list.
                      </div>
                    </div>
                  </label>
                  {form.advisory_only_mode && (
                    <div className="mt-3 ml-6">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Subscription fee per crop (₹)
                      </label>
                      <input type="number" min={0} step={1}
                        value={form.subscription_fee_paise !== null
                          ? Math.round(form.subscription_fee_paise / 100)
                          : ''}
                        onChange={e => setForm({
                          ...form,
                          subscription_fee_paise: e.target.value
                            ? Math.round(parseFloat(e.target.value) * 100)
                            : null,
                        })}
                        className="w-32 px-3 py-1.5 text-sm border border-slate-300 rounded-lg" />
                      <p className="text-xs text-slate-500 mt-1">
                        Applies uniformly to farmer-pays and company-pays channels.
                        Bulk discounts do not apply.
                      </p>
                    </div>
                  )}
                  {form.advisory_only_mode && (
                    <div className="mt-3 ml-6">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Input alert lead days
                      </label>
                      <input type="number" min={0} step={1}
                        value={form.input_alert_lead_days ?? ''}
                        placeholder="2"
                        onChange={e => setForm({
                          ...form,
                          input_alert_lead_days: e.target.value !== ''
                            ? parseInt(e.target.value, 10)
                            : null,
                        })}
                        className="w-32 px-3 py-1.5 text-sm border border-slate-300 rounded-lg" />
                      <p className="text-xs text-slate-500 mt-1">
                        Days before an input&apos;s due window when the farmer starts
                        receiving daily reminders. 0 = only on the due day.
                        Leave blank for the default of 2.
                      </p>
                    </div>
                  )}
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
                  <button onClick={initiate} disabled={saving || !form.full_name || !form.short_name || !form.ca_email || !form.payment_model || shortNameStatus === 'taken' || shortNameStatus === 'checking'}
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
