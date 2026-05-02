'use client'
import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface CropHealth { crop_cosh_id: string; enabled: boolean; created_at: string }

export default function CropHealthCropsPage() {
  const [crops, setCrops] = useState<CropHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [newCrop, setNewCrop] = useState('')
  const [adding, setAdding] = useState(false)

  const load = () =>
    api.get<CropHealth[]>('/admin/crop-health-crops')
      .then(r => setCrops(r.data))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  async function toggle(crop: CropHealth) {
    setToggling(crop.crop_cosh_id)
    try {
      if (crop.enabled) {
        await api.put(`/admin/crop-health-crops/${crop.crop_cosh_id}/disable`, {})
      } else {
        await api.put(`/admin/crop-health-crops/${crop.crop_cosh_id}/enable`, {})
      }
      load()
    } finally { setToggling(null) }
  }

  async function addCrop() {
    if (!newCrop.trim()) return
    setAdding(true)
    try {
      await api.put(`/admin/crop-health-crops/${newCrop.trim()}/enable`, {})
      setNewCrop('')
      load()
    } finally { setAdding(false) }
  }

  const enabled = crops.filter(c => c.enabled)
  const disabled = crops.filter(c => !c.enabled)

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Crop Health Crops</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Crops for which CHA diagnosis and global recommendations are ready in RootsTalk
        </p>
        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <p className="text-xs text-blue-700">
            <strong>Privilege required:</strong> Crop Health Crops — only CMs with this privilege can make changes here.
            These crops are enabled for the diagnosis flow in the farmer PWA.
          </p>
        </div>
      </div>

      {/* Add crop */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 flex gap-2">
        <input value={newCrop} onChange={e => setNewCrop(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCrop()}
          placeholder="Crop Cosh ID (e.g. crop_paddy)"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500/30" />
        <button onClick={addCrop} disabled={adding || !newCrop.trim()}
          className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-40">
          {adding ? 'Adding…' : 'Enable'}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">
          {enabled.length > 0 && (
            <section>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Enabled ({enabled.length})</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
                {enabled.map(c => (
                  <div key={c.crop_cosh_id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <p className="font-mono text-sm text-slate-800">{c.crop_cosh_id}</p>
                      <p className="text-xs text-slate-400">Diagnosis enabled · Added {new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <button onClick={() => toggle(c)} disabled={toggling === c.crop_cosh_id}
                        className="text-xs text-red-400 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40">
                        {toggling === c.crop_cosh_id ? '…' : 'Disable'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {disabled.length > 0 && (
            <section>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Disabled ({disabled.length})</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
                {disabled.map(c => (
                  <div key={c.crop_cosh_id} className="flex items-center justify-between px-5 py-3.5 opacity-60">
                    <p className="font-mono text-sm text-slate-600">{c.crop_cosh_id}</p>
                    <button onClick={() => toggle(c)} disabled={toggling === c.crop_cosh_id}
                      className="text-xs text-green-600 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-50 disabled:opacity-40">
                      {toggling === c.crop_cosh_id ? '…' : 'Enable'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {crops.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-400">No crops added yet. Enter a Cosh crop ID above to enable diagnosis for that crop.</p>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  )
}
