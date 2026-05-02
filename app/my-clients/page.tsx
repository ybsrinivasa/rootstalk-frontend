'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface AssignedClient {
  client_id: string; full_name: string; display_name: string | null
  short_name: string; logo_url: string | null; primary_colour: string | null
  status: string; rights: string; assigned_at: string; portal_url: string
}

export default function MyClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<AssignedClient[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<AssignedClient[]>('/admin/cm/my-clients')
      .then(r => setClients(r.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Assigned Clients</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Clients where you are the assigned Content Manager
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-slate-500 font-medium">No clients assigned to you yet</p>
          <p className="text-sm text-slate-400 mt-1">Ask the Super Admin to assign you to a company</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clients.map(c => (
            <div key={c.client_id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Brand header */}
              <div className="px-4 py-3 flex items-center gap-3"
                style={{ background: (c.primary_colour || '#1A5C2A') + '18' }}>
                {c.logo_url && <img src={c.logo_url} alt="" className="w-8 h-8 rounded object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{c.display_name || c.full_name}</p>
                  <p className="text-xs font-mono text-slate-400">{c.short_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    c.rights === 'EDIT' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>{c.rights === 'EDIT' ? 'Edit' : 'View'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>{c.status}</span>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Assigned {new Date(c.assigned_at).toLocaleDateString()}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => router.push(`/clients/${c.client_id}`)}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                    Details
                  </button>
                  <a href={c.portal_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 bg-green-700 text-white rounded-lg hover:bg-green-800 font-medium">
                    Open Client Portal ↗
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
