'use client'
import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type EntitySummaryRow = {
  entity_type: string
  inserted: number
  updated: number
  failed: number
}

type SyncLog = {
  sync_id: string
  initiated_by: string | null
  sync_mode: string
  status: string
  items_synced: number
  items_failed: number
  entity_summary: EntitySummaryRow[] | null
  started_at: string
  completed_at: string | null
}

// Humanise Cosh entity_types (e.g. "input_manufacturers" →
// "Input Manufacturers", "biological_names" → "Biological Names").
function humanizeEntityType(s: string): string {
  return s.split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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
  const [refreshingCatalog, setRefreshingCatalog] = useState(false)
  const [catalogMsg, setCatalogMsg] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data } = await api.get('/sync/cosh/log?limit=20')
      setLogs(data)
    } finally { setLoading(false) }
  }

  async function refreshManufacturerCatalog() {
    setRefreshingCatalog(true); setCatalogMsg(null)
    try {
      const { data } = await api.post<{ rows_written: number; category: string }>(
        '/admin/dealer/manufacturers-catalog/refresh',
      )
      setCatalogMsg(`✓ Wrote ${data.rows_written} rows (${data.category})`)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      setCatalogMsg(`✗ ${typeof detail === 'string' ? detail : 'Refresh failed'}`)
    } finally { setRefreshingCatalog(false) }
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

      {/* Derived caches — materialised views built off Cosh data
          that need an explicit rebuild after a sync changes the
          source. Lazy on first read; this button forces a refresh
          on demand. */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
        <h2 className="text-base font-semibold text-slate-900">Derived caches</h2>
        <p className="text-xs text-slate-500 mt-0.5 mb-4">
          Run after a Cosh sync adds or renames manufacturers in scope.
        </p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Dealer manufacturer catalog</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Pesticide + Fertilizer manufacturer lists shown to dealers on My Dealerships. Walks commonnames_l2 → tradename_commonname → tradename_manufacturer.
            </p>
          </div>
          <button
            onClick={refreshManufacturerCatalog}
            disabled={refreshingCatalog}
            className="shrink-0 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg">
            {refreshingCatalog ? 'Refreshing…' : '↻ Refresh now'}
          </button>
        </div>
        {catalogMsg && (
          <p className={`text-xs mt-3 ${catalogMsg.startsWith('✓') ? 'text-emerald-700' : 'text-red-600'}`}>
            {catalogMsg}
          </p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading
          ? <p className="text-center py-12 text-slate-400">Loading…</p>
          : logs.length === 0
            ? <p className="text-center py-12 text-slate-400">No syncs yet. Waiting for first Cosh sync.</p>
            : logs.map((log, i) => {
              // Filter out untouched batches (Cosh emits zero-change rows
              // when a sync had nothing new for that entity type).
              const changed = (log.entity_summary || []).filter(
                e => e.inserted + e.updated + e.failed > 0,
              )
              return (
                <div key={i} className="px-5 py-4 border-b border-slate-100 last:border-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[log.status] || 'bg-slate-100 text-slate-500'}`}>
                          {log.status}
                        </span>
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {log.sync_mode || 'unknown'}
                        </span>
                        {log.initiated_by && (
                          <span className="text-xs text-slate-500">
                            by {log.initiated_by}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm text-slate-700">
                        <span className="text-emerald-600 font-medium">{log.items_synced}</span> synced
                        {log.items_failed > 0 && <span className="text-red-500 ml-2">{log.items_failed} failed</span>}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(log.started_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {/* Per-entity breakdown — the "actual values"
                      that replace the meaningless UUID. Compact
                      chips list, only entity types with changes. */}
                  {changed.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {changed.map(e => {
                        const total = e.inserted + e.updated + e.failed
                        return (
                          <span key={e.entity_type}
                            className="text-xs px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-700">
                            <span className="font-medium">{humanizeEntityType(e.entity_type)}</span>
                            <span className="text-slate-500 ml-1">×{total}</span>
                            {e.failed > 0 && (
                              <span className="text-red-500 ml-1">({e.failed} failed)</span>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {/* Legacy rows with no entity_summary fall back
                      to a faint sync_id footnote for traceability. */}
                  {changed.length === 0 && log.sync_id && (
                    <p className="text-xs text-slate-300 mt-1 font-mono">{log.sync_id}</p>
                  )}
                </div>
              )
            })
        }
      </div>
    </AdminLayout>
  )
}
