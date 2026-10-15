'use client'
import { useEffect, useMemo, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type CategoryField = {
  id: string
  category_id: string
  field_key: string
  field_label: string
  field_type: 'TEXT' | 'NUMBER' | 'ENUM' | 'MULTI_SELECT'
  required: boolean
  unit: string | null
  enum_values_json: { options?: string[] } | null
  display_order: number
  status: 'ACTIVE' | 'INACTIVE'
}

type Category = {
  id: string
  name: string
  scope: string
  display_order: number
  status: string
  fields: CategoryField[]
}

type Crop = { cosh_id: string; name_en: string; status: string }

type CropAssignment = { id: string; crop_cosh_id: string; status: string }

type FallbackProduct = {
  id: string
  category_id: string
  display_name: string
  manufacturer: string | null
  grade: string | null
  formulation: string | null
  n_pct: number | null
  p2o5_pct: number | null
  k2o_pct: number | null
  ca_pct: number | null
  mg_pct: number | null
  s_pct: number | null
  zn_pct: number | null
  fe_pct: number | null
  mn_pct: number | null
  cu_pct: number | null
  b_pct: number | null
  application_methods: string[] | null
  data_json: Record<string, unknown> | null
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  updated_at: string
  crop_assignments: CropAssignment[]
}

type FormState = {
  id?: string
  category_id: string
  display_name: string
  manufacturer: string
  grade: string
  formulation: string
  n_pct: string
  p2o5_pct: string
  k2o_pct: string
  ca_pct: string
  mg_pct: string
  s_pct: string
  zn_pct: string
  fe_pct: string
  mn_pct: string
  cu_pct: string
  b_pct: string
  application_methods: string[]
  notes: string
  crop_cosh_ids: string[]
}

// Field-key → form-key map for the hot numeric fields. The authoring
// form writes everything into FormState using these keys regardless
// of how the category schema labels them.
const HOT_NUMERIC_FIELDS: Record<string, keyof FormState> = {
  n_pct: 'n_pct', p2o5_pct: 'p2o5_pct', k2o_pct: 'k2o_pct',
  ca_pct: 'ca_pct', mg_pct: 'mg_pct', s_pct: 's_pct',
  zn_pct: 'zn_pct', fe_pct: 'fe_pct', mn_pct: 'mn_pct',
  cu_pct: 'cu_pct', b_pct: 'b_pct',
}

function emptyForm(categoryId: string = ''): FormState {
  return {
    category_id: categoryId,
    display_name: '', manufacturer: '', grade: '', formulation: '',
    n_pct: '', p2o5_pct: '', k2o_pct: '', ca_pct: '', mg_pct: '',
    s_pct: '', zn_pct: '', fe_pct: '', mn_pct: '', cu_pct: '', b_pct: '',
    application_methods: [], notes: '',
    crop_cosh_ids: [],
  }
}

function parseFloatOrNull(s: string): number | null {
  if (!s.trim()) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

export default function FallbackCataloguePage() {
  const [products, setProducts] = useState<FallbackProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState<string>('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cropSearch, setCropSearch] = useState('')

  useEffect(() => { loadAll() }, [includeInactive])

  async function loadAll() {
    try {
      setLoading(true)
      const [p, c, cr] = await Promise.all([
        api.get('/sa/soil-nutrient/fallback-products',
          { params: { include_inactive: includeInactive } }),
        api.get('/sa/soil-nutrient/product-categories'),
        api.get('/admin/cosh/crops'),
      ])
      setProducts(p.data)
      setCategories(c.data)
      setCrops(cr.data)
    } finally {
      setLoading(false)
    }
  }

  const categoryById = useMemo(() => {
    const m = new Map<string, Category>()
    for (const c of categories) m.set(c.id, c)
    return m
  }, [categories])

  const cropByCoshId = useMemo(() => {
    const m = new Map<string, Crop>()
    for (const c of crops) m.set(c.cosh_id, c)
    return m
  }, [crops])

  const grouped = useMemo(() => {
    const out: { cat: Category; items: FallbackProduct[] }[] = []
    for (const cat of categories) {
      const items = products.filter(p =>
        p.category_id === cat.id && (!filterCat || p.category_id === filterCat),
      )
      if (items.length) out.push({ cat, items })
    }
    return out
  }, [products, categories, filterCat])

  const filteredCrops = useMemo(() => {
    if (!cropSearch.trim()) return crops.slice(0, 50)
    const q = cropSearch.toLowerCase()
    return crops.filter(c =>
      c.name_en.toLowerCase().includes(q) || c.cosh_id.toLowerCase().includes(q),
    ).slice(0, 50)
  }, [crops, cropSearch])

  async function save() {
    if (!form) return
    setSaving(true); setError(null)
    try {
      const payload = {
        category_id: form.category_id,
        display_name: form.display_name.trim(),
        manufacturer: form.manufacturer.trim() || null,
        grade: form.grade.trim() || null,
        formulation: form.formulation.trim() || null,
        n_pct: parseFloatOrNull(form.n_pct),
        p2o5_pct: parseFloatOrNull(form.p2o5_pct),
        k2o_pct: parseFloatOrNull(form.k2o_pct),
        ca_pct: parseFloatOrNull(form.ca_pct),
        mg_pct: parseFloatOrNull(form.mg_pct),
        s_pct: parseFloatOrNull(form.s_pct),
        zn_pct: parseFloatOrNull(form.zn_pct),
        fe_pct: parseFloatOrNull(form.fe_pct),
        mn_pct: parseFloatOrNull(form.mn_pct),
        cu_pct: parseFloatOrNull(form.cu_pct),
        b_pct: parseFloatOrNull(form.b_pct),
        application_methods: form.application_methods.length
          ? form.application_methods : null,
        data_json: form.notes.trim()
          ? { notes: form.notes.trim() } : null,
        crop_cosh_ids: form.crop_cosh_ids,
      }
      if (form.id) {
        await api.patch(`/sa/soil-nutrient/fallback-products/${form.id}`, payload)
      } else {
        await api.post('/sa/soil-nutrient/fallback-products', payload)
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
    if (!confirm(`Deactivate "${p.display_name}"?`)) return
    await api.delete(`/sa/soil-nutrient/fallback-products/${p.id}`)
    loadAll()
  }

  async function reactivate(p: FallbackProduct) {
    await api.patch(`/sa/soil-nutrient/fallback-products/${p.id}`, { status: 'ACTIVE' })
    loadAll()
  }

  function openEdit(p: FallbackProduct) {
    setError(null)
    const notes = (p.data_json?.notes as string) || ''
    setForm({
      id: p.id,
      category_id: p.category_id,
      display_name: p.display_name,
      manufacturer: p.manufacturer || '',
      grade: p.grade || '',
      formulation: p.formulation || '',
      n_pct: p.n_pct !== null ? String(p.n_pct) : '',
      p2o5_pct: p.p2o5_pct !== null ? String(p.p2o5_pct) : '',
      k2o_pct: p.k2o_pct !== null ? String(p.k2o_pct) : '',
      ca_pct: p.ca_pct !== null ? String(p.ca_pct) : '',
      mg_pct: p.mg_pct !== null ? String(p.mg_pct) : '',
      s_pct: p.s_pct !== null ? String(p.s_pct) : '',
      zn_pct: p.zn_pct !== null ? String(p.zn_pct) : '',
      fe_pct: p.fe_pct !== null ? String(p.fe_pct) : '',
      mn_pct: p.mn_pct !== null ? String(p.mn_pct) : '',
      cu_pct: p.cu_pct !== null ? String(p.cu_pct) : '',
      b_pct: p.b_pct !== null ? String(p.b_pct) : '',
      application_methods: p.application_methods || [],
      notes,
      crop_cosh_ids: p.crop_assignments
        .filter(a => a.status === 'ACTIVE')
        .map(a => a.crop_cosh_id),
    })
  }

  const formCategory = form?.category_id
    ? categoryById.get(form.category_id) : null
  const formulationOptions = formCategory?.fields
    .find(f => f.field_key === 'formulation')?.enum_values_json?.options || []
  const applicationOptions = formCategory?.fields
    .find(f => f.field_key === 'application_methods')?.enum_values_json?.options || []

  const activeCount = products.filter(p => p.status === 'ACTIVE').length
  const inactiveCount = products.filter(p => p.status !== 'ACTIVE').length

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fallback Catalogue</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Industry-wide Tier 2 products · {activeCount} active
            {includeInactive && inactiveCount > 0 && ` · ${inactiveCount} inactive`}
            {' '}· Client Products always win; Fallback is engine-of-last-resort
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white">
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={includeInactive}
              onChange={e => setIncludeInactive(e.target.checked)}
              className="rounded border-slate-300" />
            Show inactive
          </label>
          <button
            onClick={() => {
              setError(null)
              setForm(emptyForm(categories[0]?.id || ''))
            }}
            disabled={categories.length === 0}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            + Add Product
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-12 text-slate-400">Loading…</p>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">No fallback products yet.</p>
          <p className="text-xs mt-1">Add products via the <strong>+ Add Product</strong> button above.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ cat, items }) => (
            <div key={cat.id}>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
                {cat.name} <span className="text-slate-400 font-normal">· {items.length}</span>
              </h2>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {items.map(p => {
                  const crops = p.crop_assignments
                    .filter(a => a.status === 'ACTIVE')
                    .map(a => cropByCoshId.get(a.crop_cosh_id)?.name_en || a.crop_cosh_id)
                  return (
                    <div key={p.id}
                      className={`flex items-start justify-between px-5 py-3.5 border-b border-slate-100 last:border-0 ${p.status !== 'ACTIVE' ? 'bg-slate-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <p className="font-medium text-slate-800 text-sm">
                            {p.display_name}
                            {p.status !== 'ACTIVE' && (
                              <span className="ml-2 text-xs text-slate-400 italic">(inactive)</span>
                            )}
                          </p>
                          {p.manufacturer && (
                            <span className="text-xs text-slate-500">by {p.manufacturer}</span>
                          )}
                          {p.grade && (
                            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{p.grade}</span>
                          )}
                          {p.formulation && (
                            <span className="text-xs text-slate-500 italic">{p.formulation}</span>
                          )}
                        </div>
                        <NutrientPills p={p} />
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {p.application_methods?.map(m => (
                            <span key={m} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{m}</span>
                          ))}
                          {crops.length > 0 && (
                            <span className="text-[10px] text-slate-500">
                              crops: {crops.slice(0, 3).join(', ')}
                              {crops.length > 3 && ` +${crops.length - 3}`}
                            </span>
                          )}
                          {crops.length === 0 && (
                            <span className="text-[10px] text-slate-400 italic">universal (all crops)</span>
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
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !saving && setForm(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold">
                {form.id ? 'Edit Fallback Product' : 'New Fallback Product'}
              </h2>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Category</label>
                  <select value={form.category_id}
                    onChange={e => setForm({ ...form, category_id: e.target.value, formulation: '', application_methods: [] })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Display Name</label>
                  <input type="text" value={form.display_name}
                    onChange={e => setForm({ ...form, display_name: e.target.value })}
                    placeholder="e.g., Urea (generic)"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Manufacturer</label>
                  <input type="text" value={form.manufacturer}
                    onChange={e => setForm({ ...form, manufacturer: e.target.value })}
                    placeholder="(leave blank for industry-generic)"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Grade</label>
                  <input type="text" value={form.grade}
                    onChange={e => setForm({ ...form, grade: e.target.value })}
                    placeholder="e.g., 10:26:26"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Formulation</label>
                  <select value={form.formulation}
                    onChange={e => setForm({ ...form, formulation: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">—</option>
                    {formulationOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Application Methods</label>
                  <div className="flex flex-wrap gap-2 border border-slate-300 rounded-lg px-3 py-2 min-h-[38px]">
                    {applicationOptions.map(o => {
                      const on = form.application_methods.includes(o)
                      return (
                        <button key={o} type="button"
                          onClick={() => setForm({
                            ...form,
                            application_methods: on
                              ? form.application_methods.filter(x => x !== o)
                              : [...form.application_methods, o],
                          })}
                          className={`text-xs px-2 py-0.5 rounded border ${on ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-300 text-slate-600'}`}>
                          {o}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Nutrient % grid */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Nutrient Content (%)</p>
                <div className="grid grid-cols-6 gap-2">
                  {Object.keys(HOT_NUMERIC_FIELDS).map(k => (
                    <div key={k}>
                      <label className="text-[10px] font-mono text-slate-500 block mb-0.5 uppercase">{k.replace('_pct','')}</label>
                      <input type="text" inputMode="decimal"
                        value={(form[k as keyof FormState] as string)}
                        onChange={e => setForm({ ...form, [k]: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-mono text-right" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Notes <span className="text-slate-400">(optional)</span></label>
                <textarea value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Short note or caveat for CA/SE/CM eyes"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>

              {/* Crop assignments */}
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
              <button onClick={save}
                disabled={saving || !form.display_name.trim() || !form.category_id}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : form.id ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function NutrientPills({ p }: { p: FallbackProduct }) {
  const items: { label: string; v: number }[] = []
  const fields: [string, number | null][] = [
    ['N', p.n_pct], ['P2O5', p.p2o5_pct], ['K2O', p.k2o_pct],
    ['Ca', p.ca_pct], ['Mg', p.mg_pct], ['S', p.s_pct],
    ['Zn', p.zn_pct], ['Fe', p.fe_pct], ['Mn', p.mn_pct],
    ['Cu', p.cu_pct], ['B', p.b_pct],
  ]
  for (const [label, v] of fields) if (v !== null && v !== 0) items.push({ label, v })
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {items.map(({ label, v }) => (
        <span key={label}
          className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
          {label}: {v}%
        </span>
      ))}
    </div>
  )
}
