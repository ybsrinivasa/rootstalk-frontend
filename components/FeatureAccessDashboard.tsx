'use client'

// SA dashboard panel — overview of per-client feature access across
// Messaging + Touchpoints. Active count, clients about to expire,
// and clients recently expired (for renewal follow-up).
//
// Reads /admin/sa/feature-access/overview.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'

interface ExpiringClient {
  client_id: string
  display_name: string
  access_until: string
  days_until_expiry: number
}

interface ExpiredClient {
  client_id: string
  display_name: string
  access_until: string
  days_since_expiry: number
}

interface FeatureOverview {
  active_count: number
  expiring: ExpiringClient[]
  expired_recent: ExpiredClient[]
}

interface Payload {
  generated_at: string
  expiring_within_days: number
  expired_within_days: number
  features: Record<string, FeatureOverview>
}

const FEATURE_LABELS: Record<string, string> = {
  messaging: 'Messaging',
  touchpoints: 'Touchpoints',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function FeatureAccessDashboard() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Payload>('/admin/sa/feature-access/overview')
      .then(res => setData(res.data))
      .catch(err => setError(extractErrorMessage(err, 'Could not load feature access overview.')))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Feature Access</p>
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-slate-100 rounded w-1/2" />
          <div className="h-3 bg-slate-100 rounded w-1/3" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Feature Access</p>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const features = Object.keys(FEATURE_LABELS)
  const anyExpiring = features.some(f => (data.features[f]?.expiring.length ?? 0) > 0)
  const anyExpired = features.some(f => (data.features[f]?.expired_recent.length ?? 0) > 0)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-700">Feature Access</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Monetised add-ons per client · next {data.expiring_within_days} days
          </p>
        </div>
      </div>

      {/* Active counts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {features.map(f => {
          const n = data.features[f]?.active_count ?? 0
          return (
            <div key={f} className="border border-slate-100 rounded-lg px-4 py-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">{FEATURE_LABELS[f]}</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {n}
              </p>
              <p className="text-xs text-slate-400">active {n === 1 ? 'client' : 'clients'}</p>
            </div>
          )
        })}
      </div>

      {/* Expiring soon */}
      {anyExpiring && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
            Expiring within {data.expiring_within_days} days
          </p>
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {features.flatMap(f =>
              (data.features[f]?.expiring ?? []).map(c => (
                <ExpiringRow key={`${f}-${c.client_id}`} feature={f} client={c} />
              )),
            )}
          </div>
        </div>
      )}

      {/* Recently expired */}
      {anyExpired && (
        <div>
          <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider mb-2">
            Expired in last {data.expired_within_days} days — renewal follow-up
          </p>
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {features.flatMap(f =>
              (data.features[f]?.expired_recent ?? []).map(c => (
                <ExpiredRow key={`${f}-${c.client_id}`} feature={f} client={c} />
              )),
            )}
          </div>
        </div>
      )}

      {!anyExpiring && !anyExpired && (
        <p className="text-xs text-slate-400 italic">
          No upcoming expiries or recent lapses. All active feature grants are
          more than {data.expiring_within_days} days out.
        </p>
      )}
    </div>
  )
}

function ExpiringRow({ feature, client }: { feature: string; client: ExpiringClient }) {
  const urgent = client.days_until_expiry <= 7
  return (
    <Link
      href={`/clients/${client.client_id}`}
      className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-xs"
    >
      <div className="flex-1 min-w-0">
        <span className="font-medium text-slate-800">{client.display_name}</span>
        <span className="text-slate-400 ml-2">· {FEATURE_LABELS[feature] || feature}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-slate-500">until {fmtDate(client.access_until)}</span>
        <span className={`tabular-nums font-semibold ${urgent ? 'text-rose-600' : 'text-amber-700'}`}>
          {client.days_until_expiry}d
        </span>
      </div>
    </Link>
  )
}

function ExpiredRow({ feature, client }: { feature: string; client: ExpiredClient }) {
  return (
    <Link
      href={`/clients/${client.client_id}`}
      className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-xs"
    >
      <div className="flex-1 min-w-0">
        <span className="font-medium text-slate-800">{client.display_name}</span>
        <span className="text-slate-400 ml-2">· {FEATURE_LABELS[feature] || feature}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-slate-500">expired {fmtDate(client.access_until)}</span>
        <span className="tabular-nums text-rose-600 font-semibold">
          {client.days_since_expiry}d ago
        </span>
      </div>
    </Link>
  )
}
