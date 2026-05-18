'use client'
import { useState, useEffect, useMemo } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

// 2026-05-18 redesign — replace the free-text "type a crop ID" box
// with a toggle list against every Cosh crop. Cosh is the source of
// truth for what crops exist; the SA / CM just picks which of them
// are eligible for crop-health features.

interface CoshCrop { cosh_id: string; name_en: string; status: string }
interface CHCRow { crop_cosh_id: string; status: string; enabled_at: string | null }

interface MergedRow {
  cosh_id: string
  name_en: string
  enabled: boolean
}

export default function CropHealthCropsPage() {
  const [cosh, setCosh] = useState<CoshCrop[]>([])
  const [chc, setChc] = useState<CHCRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')

  const load = () => Promise.all([
    api.get<CoshCrop[]>('/admin/cosh/crops').then(r => setCosh(r.data)),
    api.get<CHCRow[]>('/admin/crop-health-crops').then(r => setChc(r.data)),
  ]).finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const merged: MergedRow[] = useMemo(() => {
    const enabledIds = new Set(
      chc.filter(c => c.status === 'ACTIVE').map(c => c.crop_cosh_id),
    )
    return cosh
      .map(c => ({
        cosh_id: c.cosh_id,
        name_en: c.name_en,
        enabled: enabledIds.has(c.cosh_id),
      }))
      .sort((a, b) => a.name_en.localeCompare(b.name_en))
  }, [cosh, chc])

  const filtered = useMemo(() => {
    if (!filter.trim()) return merged
    const q = filter.toLowerCase()
    return merged.filter(c =>
      c.name_en.toLowerCase().includes(q) || c.cosh_id.toLowerCase().includes(q),
    )
  }, [merged, filter])

  const enabledCount = merged.filter(c => c.enabled).length

  function pickError(e: any, fallback: string): string {
    const detail = e?.response?.data?.detail
    if (typeof detail === 'object' && detail?.code === 'cm_privilege_required') {
      return `${detail.message || fallback} Ask the SA to assign the Crop Health Crops privilege to you on the Users page.`
    }
    if (typeof detail === 'object' && detail?.message) return detail.message
    if (typeof detail === 'string') return detail
    return fallback
  }

  async function toggle(row: MergedRow) {
    setToggling(row.cosh_id); setError('')
    try {
      const action = row.enabled ? 'disable' : 'enable'
      await api.put(`/admin/crop-health-crops/${row.cosh_id}/${action}`, {})
      await load()
    } catch (e: any) {
      setError(pickError(e, 'Failed to update crop.'))
    } finally { setToggling(null) }
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Crop Health Crops</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Platform-level eligibility list. A crop has to be enabled here
          before its crop-health features go live — starting with
          <strong> diagnosis in the farmer PWA</strong>.
        </p>
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700">
          <strong>Not for Global CHA content.</strong> The Global CHA Library
          is Problem-Group-keyed and crop-agnostic — nothing on this page
          changes what authors see there.
          <br />
          <strong>Privilege required:</strong> only the CM holding the
          Crop Health Crops responsibility can change toggles here. The SA
          can always change them.
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Search crops…"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30" />
        <p className="text-xs text-slate-500 whitespace-nowrap">
          {enabledCount} of {merged.length} enabled
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i =>
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        )}</div>
      ) : merged.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-400">
            No crops in Cosh yet. Once Cosh classifies crops, they will appear here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-400">No crops match the search.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
          {filtered.map(row => (
            <div key={row.cosh_id} className="flex items-center justify-between px-5 py-3.5">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{row.name_en}</p>
                <p className="font-mono text-xs text-slate-400">{row.cosh_id}</p>
              </div>
              <button onClick={() => toggle(row)}
                disabled={toggling === row.cosh_id}
                aria-pressed={row.enabled}
                title={row.enabled ? 'Click to disable' : 'Click to enable'}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
                  row.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                }`}>
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    row.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
