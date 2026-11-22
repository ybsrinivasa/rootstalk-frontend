'use client'

// FeatureAccessPanel — per-client Messaging / Touchpoints access
// toggle for the SA Portal client-detail page. Reads and writes
// `client_feature_access` via /admin/sa/clients/{cid}/features*.
//
// Append-only on the backend: every activation / extension / turn-
// off writes a new row. "Current state" is the most recent row;
// history is the full list in reverse chronological order.

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'

interface FeatureRow {
  id: string
  feature: string
  access_until: string | null
  notes: string | null
  activated_by_user_id: string | null
  created_at: string | null
  is_active: boolean
  days_until_expiry: number
}

interface FeatureBucket {
  current: FeatureRow | null
  history: FeatureRow[]
}

interface Payload {
  client_id: string
  features: Record<string, FeatureBucket>
}

const FEATURES: { key: string; label: string; description: string }[] = [
  {
    key: 'messaging',
    label: 'Messaging Module',
    description: 'Lets the company broadcast announcements, feedback, interest capture, and surveys to farmers / dealers / facilitators from the Client Portal.',
  },
  {
    key: 'touchpoints',
    label: 'Subscription Touchpoints',
    description: 'Lets the company define messages that fire automatically at PoP Timeline milestones (beginning / end of a Timeline) for every farmer who reaches that stage.',
  },
]

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function stateChip(row: FeatureRow | null): { label: string; cls: string } {
  if (row === null) {
    return { label: 'Not activated', cls: 'bg-slate-100 text-slate-500' }
  }
  if (row.is_active) {
    if (row.days_until_expiry <= 7) {
      return {
        label: `Active · expires in ${row.days_until_expiry}d`,
        cls: 'bg-amber-100 text-amber-800',
      }
    }
    return { label: `Active · until ${fmtDate(row.access_until)}`, cls: 'bg-emerald-100 text-emerald-700' }
  }
  // Expired or turned-off.
  const since = Math.abs(row.days_until_expiry)
  return {
    label: `Inactive · ended ${since === 0 ? 'today' : `${since}d ago`}`,
    cls: 'bg-rose-100 text-rose-700',
  }
}

type Props = { clientId: string }

export default function FeatureAccessPanel({ clientId }: Props) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showEdit, setShowEdit] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [turningOff, setTurningOff] = useState<string | null>(null)

  useEffect(() => { void load() }, [clientId])

  async function load() {
    setLoading(true); setError('')
    try {
      const { data } = await api.get<Payload>(
        `/admin/sa/clients/${clientId}/features`,
      )
      setData(data)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not load feature access.'))
    } finally {
      setLoading(false)
    }
  }

  function openActivate(feature: string, existing: FeatureRow | null) {
    setShowEdit(feature)
    // Default: existing access_until if active, else 1 year from today.
    if (existing && existing.is_active && existing.access_until) {
      setEditDate(toYmd(new Date(existing.access_until)))
    } else {
      const d = new Date()
      d.setFullYear(d.getFullYear() + 1)
      setEditDate(toYmd(d))
    }
    setEditNotes('')
    setEditError('')
  }

  async function saveActivate() {
    if (!showEdit || !editDate) return
    setEditSaving(true); setEditError('')
    try {
      // Send end-of-day UTC for the chosen local date so the feature
      // stays available through the full chosen day in India time.
      // ISO parse of `YYYY-MM-DDT23:59:59` is interpreted as local
      // time; we convert to a UTC ISO string.
      const local = new Date(`${editDate}T23:59:59`)
      await api.put(
        `/admin/sa/clients/${clientId}/features/${showEdit}`,
        { access_until: local.toISOString(), notes: editNotes || null },
      )
      setShowEdit(null)
      await load()
    } catch (err) {
      setEditError(extractErrorMessage(err, 'Could not save.'))
    } finally {
      setEditSaving(false)
    }
  }

  async function turnOff(feature: string) {
    const ok = confirm(
      `Turn off ${feature} access immediately? This records a turn-off entry in the audit history. ` +
      `In-flight campaigns continue to run until their own expiry; analytics stay visible.`,
    )
    if (!ok) return
    setTurningOff(feature); setError('')
    try {
      await api.delete(`/admin/sa/clients/${clientId}/features/${feature}`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not turn off.'))
    } finally {
      setTurningOff(null)
    }
  }

  function toggleExpand(feature: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(feature)) next.delete(feature)
      else next.add(feature)
      return next
    })
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Feature Access</p>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Paid add-ons with time-bounded access. Payment is confirmed offline;
            activate here with an end date. Turning off or letting access expire
            does not delete any campaign or response data.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data ? (
        <p className="text-sm text-slate-400">No data.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {FEATURES.map(f => {
            const bucket = data.features[f.key] || { current: null, history: [] }
            const current = bucket.current
            const chip = stateChip(current)
            const isExpanded = expanded.has(f.key)
            const isActive = current?.is_active
            return (
              <div key={f.key} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[16rem]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-800">{f.label}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${chip.cls}`}>
                        {chip.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{f.description}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openActivate(f.key, current)}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                    >
                      {isActive ? 'Extend' : 'Activate'}
                    </button>
                    {isActive && (
                      <button
                        type="button"
                        onClick={() => turnOff(f.key)}
                        disabled={turningOff === f.key}
                        className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {turningOff === f.key ? 'Turning off…' : 'Turn off now'}
                      </button>
                    )}
                    {bucket.history.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(f.key)}
                        className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                      >
                        {isExpanded ? 'Hide history' : `History (${bucket.history.length})`}
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && bucket.history.length > 0 && (
                  <div className="mt-3 ml-0 border-l-2 border-slate-100 pl-4 space-y-2">
                    {bucket.history.map((h, idx) => (
                      <div key={h.id} className="text-xs text-slate-600 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-slate-400 tabular-nums w-40 shrink-0">
                          {fmtDateTime(h.created_at)}
                        </span>
                        <span>
                          {idx === 0 ? 'current' : `rev ${bucket.history.length - idx}`} —
                          access until <span className="font-medium text-slate-800">{fmtDate(h.access_until)}</span>
                        </span>
                        {h.notes && <span className="text-slate-500 italic">· {h.notes}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Activate / Extend modal */}
      {showEdit && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          role="dialog" aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <header className="p-5 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">
                {FEATURES.find(f => f.key === showEdit)?.label}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Set the end date for this access period. Feature is available
                through the end of that day (IST).
              </p>
            </header>
            <div className="p-5 space-y-3">
              <label className="block text-sm">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Access until</span>
                <input
                  type="date"
                  value={editDate}
                  min={toYmd(new Date())}
                  onChange={e => setEditDate(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Notes (optional)</span>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={2}
                  placeholder="Invoice ref, renewal terms, …"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 bg-white resize-none text-sm"
                />
              </label>
              {editError && <p className="text-sm text-red-600">{editError}</p>}
            </div>
            <footer className="p-5 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEdit(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveActivate}
                disabled={!editDate || editSaving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}
