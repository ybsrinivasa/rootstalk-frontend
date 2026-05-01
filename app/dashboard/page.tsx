'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import Link from 'next/link'

type Client = { status: string }
type Lang = { status: string }

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([])
  const [languages, setLanguages] = useState<Lang[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<Client[]>('/admin/clients').catch(() => ({ data: [] as Client[] })),
      api.get<Lang[]>('/platform/languages').catch(() => ({ data: [] as Lang[] })),
    ]).then(([c, l]) => {
      setClients(c.data)
      setLanguages(l.data)
    }).finally(() => setLoading(false))
  }, [])

  const activeClients   = clients.filter(c => c.status === 'ACTIVE').length
  const pendingClients  = clients.filter(c => c.status === 'PENDING_REVIEW').length
  const activeLanguages = languages.filter(l => l.status === 'ACTIVE').length

  const cards = [
    { label: 'Active companies', value: activeClients, sub: `${pendingClients} pending review`, href: '/clients', colour: '#3b82f6' },
    { label: 'Active languages', value: activeLanguages, sub: `${languages.length} total languages`, href: '/languages', colour: '#10b981' },
    { label: 'Cosh sync', value: 'Ready', sub: 'POST /sync/cosh endpoint live', href: '/sync', colour: '#f59e0b' },
  ]

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">RootsTalk platform overview — Neytiri internal</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {loading
          ? [1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
              <div className="h-3 bg-slate-100 rounded w-1/2 mb-4" />
              <div className="h-7 bg-slate-100 rounded w-1/3" />
            </div>
          ))
          : cards.map(c => (
            <Link key={c.label} href={c.href}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow block">
              <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center"
                style={{ background: c.colour + '20' }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.colour }} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{c.value}</p>
              <p className="text-sm text-slate-600 mt-0.5">{c.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
            </Link>
          ))
        }
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Phase status</p>
        <div className="space-y-2">
          {[
            ['Phase 1', 'Auth — phone OTP (PWA) + email/password (Admin Portal)'],
            ['Phase 2', 'Client onboarding — SA initiates, CA submits, SA approves'],
            ['Phase 3', 'Cosh sync endpoint — cosh_reference_cache, volume_formulas, crop_health_crops'],
          ].map(([phase, desc]) => (
            <div key={phase} className="flex items-center gap-3">
              <span className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full text-xs flex items-center justify-center font-bold">✓</span>
              <span className="text-xs text-slate-500"><strong className="text-slate-700">{phase}:</strong> {desc}</span>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full text-xs flex items-center justify-center font-bold">→</span>
            <span className="text-xs text-slate-500"><strong className="text-slate-700">Phase 4:</strong> Advisory System — packages, timelines, practices (next)</span>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
