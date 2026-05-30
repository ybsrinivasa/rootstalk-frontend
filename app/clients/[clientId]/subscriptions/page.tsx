'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'

type PoolTotals = {
  purchased_total: number
  consumed_total: number
  unallocated_balance: number
  unlimited: boolean
}

type ActiveLicense = {
  id: string
  from_date: string
  to_date: string
  days_remaining: number
  note: string | null
  granted_by_user_id: string
  created_at: string
}

type Grant = {
  id: string
  units: number
  consumed: number
  purchased_at: string
  source: 'RAZORPAY' | 'SA_GRANT'
  note: string | null
  amount_paid_paise: number | null
}

type License = {
  id: string
  from_date: string
  to_date: string
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
  note: string | null
  granted_by_user_id: string
  created_at: string
}

type MgmtView = {
  client_id: string
  client_status: string
  pool_totals: PoolTotals
  active_license: ActiveLicense | null
  grants_history: Grant[]
  licenses_history: License[]
}

type ClientLite = {
  full_name: string
  short_name: string
  status: string
}

const LICENCE_STATUS_COLOURS: Record<License['status'], string> = {
  ACTIVE:  'bg-emerald-100 text-emerald-700',
  EXPIRED: 'bg-slate-100 text-slate-500',
  REVOKED: 'bg-red-100 text-red-600',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SubscriptionsPage() {
  const { clientId } = useParams()
  const router = useRouter()
  const [client, setClient] = useState<ClientLite | null>(null)
  const [view, setView] = useState<MgmtView | null>(null)
  const [loading, setLoading] = useState(true)

  // grant-units form
  const [grantUnits, setGrantUnits] = useState('')
  const [grantNote, setGrantNote] = useState('')
  const [granting, setGranting] = useState(false)
  const [grantError, setGrantError] = useState('')

  // EL grant modal
  const [showGrantEL, setShowGrantEL] = useState(false)
  const [elFromDate, setElFromDate] = useState('')
  const [elToDate, setElToDate] = useState('')
  const [elNote, setElNote] = useState('')
  const [elConfirm, setElConfirm] = useState(false)
  const [elGranting, setElGranting] = useState(false)
  const [elError, setElError] = useState('')

  // revoke
  const [revoking, setRevoking] = useState(false)
  const [showRevoke, setShowRevoke] = useState(false)

  useEffect(() => { load() }, [clientId])

  async function load() {
    try {
      const [clientRes, mgmtRes] = await Promise.allSettled([
        api.get(`/admin/clients/${clientId}`),
        api.get(`/admin/clients/${clientId}/subscription-mgmt`),
      ])
      if (clientRes.status === 'fulfilled') setClient(clientRes.value.data)
      if (mgmtRes.status === 'fulfilled') setView(mgmtRes.value.data)
    } finally { setLoading(false) }
  }

  async function submitGrant() {
    setGrantError('')
    const units = parseInt(grantUnits, 10)
    if (!Number.isFinite(units) || units <= 0) {
      setGrantError('Enter a positive number of units.')
      return
    }
    if (units > 999_999) {
      setGrantError('Units cannot exceed 999,999.')
      return
    }
    setGranting(true)
    try {
      await api.post(`/admin/clients/${clientId}/subscription-grants`, {
        units,
        note: grantNote.trim() || null,
      })
      setGrantUnits(''); setGrantNote('')
      await load()
    } catch (e: unknown) {
      setGrantError(extractErrorMessage(e, 'Failed to record grant.'))
    } finally { setGranting(false) }
  }

  function openGrantEL() {
    setElFromDate(new Date().toISOString().slice(0, 10))
    setElToDate('')
    setElNote('')
    setElConfirm(false)
    setElError('')
    setShowGrantEL(true)
  }

  async function submitEL() {
    setElError('')
    if (!elFromDate || !elToDate) {
      setElError('Both dates are required.')
      return
    }
    if (elToDate <= elFromDate) {
      setElError('To-date must be strictly after from-date.')
      return
    }
    setElGranting(true)
    try {
      await api.post(`/admin/clients/${clientId}/enterprise-licenses`, {
        from_date: elFromDate,
        to_date: elToDate,
        note: elNote.trim() || null,
      })
      setShowGrantEL(false)
      await load()
    } catch (e: unknown) {
      setElError(extractErrorMessage(e, 'Failed to grant licence.'))
    } finally { setElGranting(false) }
  }

  async function submitRevoke() {
    if (!view?.active_license) return
    setRevoking(true)
    try {
      await api.put(
        `/admin/clients/${clientId}/enterprise-licenses/${view.active_license.id}/revoke`,
        {},
      )
      setShowRevoke(false)
      await load()
    } catch (e: unknown) {
      alert(extractErrorMessage(e, 'Failed to revoke licence.'))
    } finally { setRevoking(false) }
  }

  if (loading) return <AdminLayout><div className="py-20 text-center text-slate-400">Loading…</div></AdminLayout>
  if (!view || !client) return <AdminLayout><div className="py-20 text-center text-red-500">Not found</div></AdminLayout>

  const totals = view.pool_totals
  const activeLicEffectiveBalance = totals.unlimited
    ? 'Unlimited'
    : totals.unallocated_balance.toLocaleString()

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push(`/clients/${clientId}`)} className="text-slate-400 hover:text-slate-700 text-sm">← Back to company</button>
        <span className="text-slate-300">|</span>
        <h1 className="text-xl font-bold text-slate-900">{client.full_name}</h1>
        <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 rounded">{client.short_name}</span>
        <span className="text-sm text-slate-500 ml-2">— Subscriptions</span>
      </div>

      {/* Pool totals */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Purchased Total</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totals.purchased_total.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Consumed</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totals.consumed_total.toLocaleString()}</p>
        </div>
        <div className={`border rounded-xl p-4 ${totals.unlimited ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Effective Balance</p>
          <p className={`text-2xl font-bold mt-1 ${totals.unlimited ? 'text-emerald-700' : 'text-slate-900'}`}>{activeLicEffectiveBalance}</p>
          {totals.unlimited && (
            <p className="text-xs text-emerald-600 mt-1">Enterprise Licence active</p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Company Status</p>
          <p className={`text-sm font-medium mt-1 ${
            view.client_status === 'ACTIVE' ? 'text-emerald-700' :
            view.client_status === 'INACTIVE' ? 'text-slate-500' :
            'text-amber-600'
          }`}>{view.client_status.replace('_', ' ')}</p>
          {view.client_status === 'INACTIVE' && (
            <p className="text-xs text-slate-400 mt-1">CA-portal login blocked; new subscriptions blocked.</p>
          )}
        </div>
      </div>

      {/* Enterprise Licence card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Enterprise Licence</p>
            <p className="text-xs text-slate-400 mt-0.5">Flat-fee bulk arrangement. Bypasses per-promoter kitty; effective balance reads as &ldquo;Unlimited&rdquo; until the to-date.</p>
          </div>
          {!view.active_license && (
            <button onClick={openGrantEL}
              className="text-sm px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
              + Grant Licence
            </button>
          )}
        </div>

        {view.active_license ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm">
                  <span className="font-semibold text-emerald-700">Active</span>
                  <span className="text-slate-600 ml-2">
                    {formatDate(view.active_license.from_date)} → {formatDate(view.active_license.to_date)}
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {view.active_license.days_remaining > 0
                    ? `${view.active_license.days_remaining} days remaining`
                    : view.active_license.days_remaining === 0
                      ? 'Closes today'
                      : `Past due by ${Math.abs(view.active_license.days_remaining)} days — sweep will close on next run`}
                </p>
                {view.active_license.note && (
                  <p className="text-xs text-slate-600 mt-2 italic">&ldquo;{view.active_license.note}&rdquo;</p>
                )}
              </div>
              <button onClick={() => setShowRevoke(true)}
                className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
                Revoke
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">No active Enterprise Licence.</p>
        )}
      </div>

      {/* Add invoice-paid subscriptions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Add Invoice-Paid Subscriptions</p>
        <p className="text-xs text-slate-400 mb-4">For clients paying us by invoice instead of Razorpay (NGOs, govt, policy-constrained companies). Adds to the company&rsquo;s pool immediately.</p>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Units</label>
            <input type="number" min={1} max={999999} value={grantUnits}
              onChange={e => setGrantUnits(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Invoice / PO reference (optional)</label>
            <input value={grantNote}
              onChange={e => setGrantNote(e.target.value)}
              placeholder="INV-2026-001 · ₹2,49,000"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={submitGrant} disabled={granting || !grantUnits}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {granting ? 'Recording…' : 'Record Grant'}
          </button>
        </div>
        {grantError && <p className="text-sm text-red-600 mt-2">{grantError}</p>}
      </div>

      {/* Grants history */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Grants History</p>
        </div>
        {view.grants_history.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No subscriptions purchased or granted yet.</p>
        ) : view.grants_history.map(g => (
          <div key={g.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-50 last:border-0">
            <div>
              <p className="text-sm text-slate-800">
                <span className="font-semibold">{g.units.toLocaleString()}</span> units
                <span className="text-slate-400 text-xs ml-2">{g.consumed.toLocaleString()} consumed</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {formatDate(g.purchased_at)}
                {g.source === 'RAZORPAY' && g.amount_paid_paise && (
                  <span> · ₹{(g.amount_paid_paise / 100).toLocaleString()}</span>
                )}
                {g.note && <span> · {g.note}</span>}
              </p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              g.source === 'RAZORPAY' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {g.source === 'RAZORPAY' ? 'Razorpay' : 'SA grant'}
            </span>
          </div>
        ))}
      </div>

      {/* Licences history */}
      {view.licenses_history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Licences History</p>
          </div>
          {view.licenses_history.map(l => (
            <div key={l.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-sm text-slate-800">
                  {formatDate(l.from_date)} → {formatDate(l.to_date)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Granted {formatDate(l.created_at)}
                  {l.note && <span> · {l.note}</span>}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LICENCE_STATUS_COLOURS[l.status]}`}>
                {l.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Grant EL modal */}
      {showGrantEL && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Grant Enterprise Licence</h2>
            <p className="text-xs text-slate-500 mb-4">{client.full_name}</p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">From date</label>
                  <input type="date" value={elFromDate}
                    onChange={e => setElFromDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">To date</label>
                  <input type="date" value={elToDate}
                    onChange={e => setElToDate(e.target.value)}
                    min={elFromDate || undefined}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Note (optional — agreement ref, contact)</label>
                <input value={elNote}
                  onChange={e => setElNote(e.target.value)}
                  placeholder="MoU dated 12-Jun-2026 · ₹6,00,000 flat fee"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1.5">
                <p className="font-semibold">What this does:</p>
                <ul className="list-disc list-inside space-y-1 text-amber-700">
                  <li>Effective balance for this company becomes <strong>Unlimited</strong> until the to-date.</li>
                  <li>Promoter kitty allocation is bypassed entirely. Any promoter can assign any number of farmer subscriptions.</li>
                  <li>On the to-date, the company is set to <strong>Inactive</strong>: CA login blocks, no new farmer subscriptions. Existing subscriptions continue to their natural close.</li>
                  <li>Reminder emails fire 30 / 23 / 16 / 9 / 2 days before, plus a closure email on the to-date.</li>
                </ul>
              </div>

              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input type="checkbox" checked={elConfirm}
                  onChange={e => setElConfirm(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-emerald-600" />
                <span className="text-xs text-slate-700">I have verified the agreement / invoice and confirm granting this Enterprise Licence.</span>
              </label>

              {elError && <p className="text-sm text-red-600">{elError}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setShowGrantEL(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={submitEL}
                disabled={elGranting || !elConfirm || !elFromDate || !elToDate}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
                {elGranting ? 'Granting…' : 'Grant Licence'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirm modal */}
      {showRevoke && view.active_license && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Revoke Enterprise Licence?</h2>
            <p className="text-sm text-slate-600 mb-3">
              The company will be set to <strong>Inactive</strong> immediately — CA login blocks and no new farmer subscriptions can be created.
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Existing farmer subscriptions assigned during the active window continue to their natural close. This is not reversible — to restore access, grant a new licence or reactivate manually.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRevoke(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={submitRevoke} disabled={revoking}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
                {revoking ? 'Revoking…' : 'Confirm Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
