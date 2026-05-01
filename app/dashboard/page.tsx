'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

export default function Dashboard() {
  const [stats, setStats] = useState({ clients: 0, languages: 0, syncs: 0 })

  useEffect(() => {
    Promise.all([
      api.get('/admin/clients').catch(() => ({ data: [] })),
      api.get('/platform/languages').catch(() => ({ data: [] })),
      api.get('/sync/cosh/log?limit=1').catch(() => ({ data: [] })),
    ]).then(([c, l, s]) => setStats({
      clients: (c.data as unknown[]).length,
      languages: (l.data as unknown[]).filter((x: unknown) => (x as {status: string}).status === 'ACTIVE').length,
      syncs: (s.data as unknown[]).length,
    }))
  }, [])

  const cards = [
    { label: 'Companies', value: stats.clients, sub: 'registered', href: '/clients', color: '#3b82f6' },
    { label: 'Languages active', value: stats.languages, sub: 'of 13 total', href: '/languages', color: '#10b981' },
    { label: 'Cosh syncs', value: stats.syncs ? 'Synced' : 'No sync yet', sub: 'last 20 logs', href: '/sync', color: '#f59e0b' },
  ]

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">RootsTalk platform overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        {cards.map(c => (
          <a key={c.label} href={c.href}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow block">
            <div className="w-9 h-9 rounded-lg mb-3 flex items-center justify-center"
              style={{ background: c.color + '20' }}>
              <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm text-slate-600 mt-0.5">{c.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
          </a>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
        <p className="text-sm font-medium text-blue-800">Phases 1–3 are live</p>
        <p className="text-xs text-blue-600 mt-1">
          Auth ✓ &nbsp;|&nbsp; Languages ✓ &nbsp;|&nbsp; Client onboarding ✓ &nbsp;|&nbsp; Cosh sync endpoint ✓
        </p>
      </div>
    </AdminLayout>
  )
}
