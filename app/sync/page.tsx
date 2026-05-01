'use client'
import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type SyncLog = {
  sync_id: string; sync_mode: string; status: string
  items_synced: number; items_failed: number
  started_at: string; completed_at: string | null
}

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  partial:   'bg-amber-100 text-amber-700',
  failed:    'bg-red-100 text-red-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-600',
}

export default function SyncPage() {
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data } = await api.get('/sync/cosh/log?limit=20')
      setLogs(data)
    } finally { setLoading(false) }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cosh Sync Log</h1>
          <p className="text-slate-500 text-sm mt-0.5">Last 20 sync operations from Cosh 2.0</p>
        </div>
        <button onClick={load} className="text-sm text-blue-600 hover:text-blue-800 font-medium">↻ Refresh</button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5 text-sm text-blue-800">
        <strong>Sync endpoint ready:</strong> POST /sync/cosh — secured by X-Cosh-Api-Key.
        When the Cosh team runs a sync, it will appear here.
        <br />
        <span className="text-blue-600 text-xs mt-1 block">
          Note: Field Mapping document pending — entity_type names to be verified on first production sync.
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading
          ? <p className="text-center py-12 text-slate-400">Loading…</p>
          : logs.length === 0
            ? <p className="text-center py-12 text-slate-400">No syncs yet. Waiting for first Cosh sync.</p>
            : logs.map((log, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-4 border-b border-slate-100 last:border-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[log.status] || 'bg-slate-100 text-slate-500'}`}>
                      {log.status}
                    </span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono">
                      {log.sync_mode || 'unknown'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-mono">{log.sync_id}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-700">
                    <span className="text-emerald-600 font-medium">{log.items_synced}</span> synced
                    {log.items_failed > 0 && <span className="text-red-500 ml-2">{log.items_failed} failed</span>}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(log.started_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
        }
      </div>
    </AdminLayout>
  )
}
