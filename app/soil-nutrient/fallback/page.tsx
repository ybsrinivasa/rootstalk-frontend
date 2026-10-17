'use client'
import { useEffect, useMemo, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type Crop = { cosh_id: string; name_en: string; status: string }

type CropAssignment = { id: string; crop_cosh_id: string; status: string }

type CoshConcentration = { n: number; p: number; k: number }

type CoshFertilizer = {
  cosh_id: string
  name: string
  concentration: CoshConcentration
  water_soluble: boolean
}

type FallbackProduct = {
  id: string
  cosh_product_id: string
  status: 'ACTIVE' | 'INACTIVE'
  notes: string | null
  created_at: string
  updated_at: string
  crop_assignments: CropAssignment[]
  cosh: CoshFertilizer | null
}

type FormState = {
  id?: string
  cosh_product_id: string
  notes: string
  crop_cosh_ids: string[]
}

export default function FallbackCataloguePage() {
  const [products, setProducts] = useState<FallbackProduct[]>([])
  const [coshFerts, setCoshFerts] = useState<CoshFertilizer[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [loading, setLoading] = useState(true)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cropSearch, setCropSearch] = useState('')

  useEffect(() => { loadAll() }, [includeInactive])

  async function loadAll() {
    try {
      setLoading(true)
      const [p, f, cr] = await Promise.all([
        api.get('/sa/soil-nutrient/fallback-products',
          { params: { include_inactive: includeInactive } }),
        api.get('/sa/soil-nutrient/cosh-fertilizers'),
        api.get('/admin/cosh/crops'),
      ])
      setProducts(p.data)
      setCoshFerts(f.data)
      setCrops(cr.data)
    } finally {
      setLoading(false)
    }
  }

  const cropByCoshId = useMemo(() => {
    const m = new Map<string, Crop>()
    for (const c of crops) m.set(c.cosh_id, c)
    return m
  }, [crops])

  const linkedCoshIds = useMemo(
    () => new Set(products.map(p => p.cosh_product_id)),
    [products],
  )

  const filteredCrops = useMemo(() => {
    if (!cropSearch.trim()) return crops.slice(0, 50)
    const q = cropSearch.toLowerCase()
    return crops.filter(c =>
      c.name_en.toLowerCase().includes(q) || c.cosh_id.toLowerCase().includes(q),
    ).slice(0, 50)
  }, [crops, cropSearch])

  const pickerResults = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    const base = coshFerts.filter(c => !linkedCoshIds.has(c.cosh_id))
    if (!q) return base.slice(0, 100)
    return base.filter(c =>
      c.name.toLowerCase().includes(q) || c.cosh_id.toLowerCase().includes(q),
    ).slice(0, 100)
  }, [coshFerts, linkedCoshIds, pickerSearch])

  async function save() {
    if (!form) return
    setSaving(true); setError(null)
    try {
      if (form.id) {
        await api.patch(`/sa/soil-nutrient/fallback-products/${form.id}`, {
          notes: form.notes.trim() || null,
          crop_cosh_ids: form.crop_cosh_ids,
        })
      } else {
        await api.post('/sa/soil-nutrient/fallback-products', {
          cosh_product_id: form.cosh_product_id,
          notes: form.notes.trim() || null,
          crop_cosh_ids: form.crop_cosh_ids,
        })
      }
      setForm(null)
      loadAll()
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string | { message?: string } } } })
        ?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail
        : detail?.message || 'Save failed'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(p: FallbackProduct) {
    const name = p.cosh?.name || p.cosh_product_id
    if (!confirm(`Deactivate "${name}"?`)) return
    await api.delete(`/sa/soil-nutrient/fallback-products/${p.id}`)
    loadAll()
  }

  async function reactivate(p: FallbackProduct) {
    await api.patch(`/sa/soil-nutrient/fallback-products/${p.id}`, { status: 'ACTIVE' })
    loadAll()
  }

  function openEdit(p: FallbackProduct) {
    setError(null)
    setForm({
      id: p.id,
      cosh_product_id: p.cosh_product_id,
      notes: p.notes || '',
      crop_cosh_ids: p.crop_assignments
        .filter(a => a.status === 'ACTIVE')
        .map(a => a.crop_cosh_id),
    })
  }

  function pickCoshFert(c: CoshFertilizer) {
    setPickerOpen(false)
    setPickerSearch('')
    setError(null)
    setForm({
      cosh_product_id: c.cosh_id,
      notes: '',
      crop_cosh_ids: [],
    })
  }

  const activeCount = products.filter(p => p.status === 'ACTIVE').length
  const inactiveCount = products.filter(p => p.status !== 'ACTIVE').length
  const formCosh = form
    ? coshFerts.find(c => c.cosh_id === form.cosh_product_id)
    : null

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fallback Catalogue</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Industry-wide Tier 2 products from Cosh · {activeCount} active
            {includeInactive && inactiveCount > 0 && ` · ${inactiveCount} inactive`}
            {' '}· Client Products always win; Fallback is engine-of-last-resort
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={includeInactive}
              onChange={e => setIncludeInactive(e.target.checked)}
              className="rounded border-slate-300" />
            Show inactive
          </label>
          <button
            onClick={() => { setPickerOpen(true); setPickerSearch('') }}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + Add from Cosh
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-12 text-slate-400">Loading…</p>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">No fallback products yet.</p>
          <p className="text-xs mt-1">
            Add products via the <strong>+ Add from Cosh</strong> button above.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {products.map(p => {
            const assignedCrops = p.crop_assignments
              .filter(a => a.status === 'ACTIVE')
              .map(a => cropByCoshId.get(a.crop_cosh_id)?.name_en || a.crop_cosh_id)
            return (
              <div key={p.id}
                className={`flex items-start justify-between px-5 py-3.5 border-b border-slate-100 last:border-0 ${p.status !== 'ACTIVE' ? 'bg-slate-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <p className="font-medium text-slate-800 text-sm">
                      {p.cosh?.name || <span className="text-amber-600">Unknown Cosh product</span>}
                      {p.status !== 'ACTIVE' && (
                        <span className="ml-2 text-xs text-slate-400 italic">(inactive)</span>
                      )}
                    </p>
                    <span className="text-[10px] font-mono text-slate-400">
                      {p.cosh_product_id}
                    </span>
                    {p.cosh?.water_soluble && (
                      <span className="text-[10px] bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded">water-soluble</span>
                    )}
                  </div>
                  {p.cosh && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      <ConcPill label="N" v={p.cosh.concentration.n} />
                      <ConcPill label="P2O5" v={p.cosh.concentration.p} />
                      <ConcPill label="K2O" v={p.cosh.concentration.k} />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {assignedCrops.length > 0 ? (
                      <span className="text-[10px] text-slate-500">
                        crops: {assignedCrops.slice(0, 3).join(', ')}
                        {assignedCrops.length > 3 && ` +${assignedCrops.length - 3}`}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">universal (all crops)</span>
                    )}
                    {p.notes && (
                      <span className="text-[10px] text-slate-500">· {p.notes}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <button
                    onClick={() => openEdit(p)}
                    className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded border border-slate-200 hover:border-slate-300"
                  >Edit</button>
                  {p.status === 'ACTIVE' ? (
                    <button onClick={() => deactivate(p)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:border-red-300">
                      Deactivate
                    </button>
                  ) : (
                    <button onClick={() => reactivate(p)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded border border-emerald-200 hover:border-emerald-300">
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Cosh picker modal */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setPickerOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold">Add Fallback Product from Cosh</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pick one. Already-linked products aren't shown.
              </p>
              <input type="text" value={pickerSearch} autoFocus
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="Search by name or Cosh id…"
                className="mt-3 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="overflow-y-auto flex-1">
              {pickerResults.length === 0 ? (
                <p className="text-center py-10 text-sm text-slate-400">
                  {pickerSearch.trim()
                    ? 'No matches.'
                    : 'All Cosh fertilizers are already in the catalogue.'}
                </p>
              ) : pickerResults.map(c => (
                <button key={c.cosh_id} type="button"
                  onClick={() => pickCoshFert(c)}
                  className="w-full text-left px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">{c.name}</p>
                    <span className="text-[10px] font-mono text-slate-400">{c.cosh_id}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <ConcPill label="N" v={c.concentration.n} />
                    <ConcPill label="P2O5" v={c.concentration.p} />
                    <ConcPill label="K2O" v={c.concentration.k} />
                    {c.water_soluble && (
                      <span className="text-[10px] bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded">water-soluble</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-slate-200 flex justify-end">
              <button onClick={() => setPickerOpen(false)}
                className="text-sm text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-100">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form modal — edit linkage or finalize a newly picked one */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !saving && setForm(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold">
                {form.id ? 'Edit Fallback Linkage' : 'Add Fallback Product'}
              </h2>
              {formCosh && (
                <div className="mt-2">
                  <p className="text-sm text-slate-700">{formCosh.name}</p>
                  <span className="text-[10px] font-mono text-slate-400">{formCosh.cosh_id}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <ConcPill label="N" v={formCosh.concentration.n} />
                    <ConcPill label="P2O5" v={formCosh.concentration.p} />
                    <ConcPill label="K2O" v={formCosh.concentration.k} />
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Notes <span className="text-slate-400">(optional, for CA/SE/CM eyes)</span>
                </label>
                <textarea value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Short note or caveat"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">Crop Restrictions</p>
                <p className="text-[11px] text-slate-500 mb-2">
                  Leave empty for universal availability. Add specific crops to restrict to those only.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                  {form.crop_cosh_ids.map(cid => {
                    const crop = cropByCoshId.get(cid)
                    return (
                      <span key={cid} className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                        {crop?.name_en || cid}
                        <button type="button"
                          onClick={() => setForm({
                            ...form,
                            crop_cosh_ids: form.crop_cosh_ids.filter(c => c !== cid),
                          })}
                          className="text-emerald-700 hover:text-emerald-900">×</button>
                      </span>
                    )
                  })}
                  {form.crop_cosh_ids.length === 0 && (
                    <span className="text-xs text-slate-400 italic">universal — all crops</span>
                  )}
                </div>
                <input type="text" value={cropSearch}
                  onChange={e => setCropSearch(e.target.value)}
                  placeholder="Search crops to add…"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                {cropSearch.trim() && (
                  <div className="mt-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                    {filteredCrops
                      .filter(c => !form.crop_cosh_ids.includes(c.cosh_id))
                      .map(c => (
                        <button key={c.cosh_id} type="button"
                          onClick={() => {
                            setForm({ ...form, crop_cosh_ids: [...form.crop_cosh_ids, c.cosh_id] })
                            setCropSearch('')
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0">
                          {c.name_en}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
              <button onClick={() => setForm(null)} disabled={saving}
                className="text-sm text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : form.id ? 'Save' : 'Add to Catalogue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function ConcPill({ label, v }: { label: string; v: number }) {
  if (!v) return null
  return (
    <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
      {label}: {v}
    </span>
  )
}
