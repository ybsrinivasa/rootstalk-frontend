'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type FieldType = 'TEXT' | 'NUMBER' | 'ENUM' | 'MULTI_SELECT'

type CategoryField = {
  id: string
  category_id: string
  field_key: string
  field_label: string
  field_type: FieldType
  required: boolean
  unit: string | null
  enum_values_json: { options?: string[] } | null
  display_order: number
  status: 'ACTIVE' | 'INACTIVE'
}

type Category = {
  id: string
  name: string
  scope: 'GLOBAL' | 'CLIENT'
  display_order: number
  status: 'ACTIVE' | 'INACTIVE'
  fields: CategoryField[]
}

type CatForm = {
  id?: string
  name: string
  display_order: number
}

type FieldForm = {
  id?: string
  category_id: string
  field_key: string
  field_label: string
  field_type: FieldType
  required: boolean
  unit: string
  enum_options: string  // comma-separated during editing
  display_order: number
}

const FIELD_TYPES: FieldType[] = ['TEXT', 'NUMBER', 'ENUM', 'MULTI_SELECT']

export default function ProductCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [catForm, setCatForm] = useState<CatForm | null>(null)
  const [fieldForm, setFieldForm] = useState<FieldForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const { data } = await api.get('/sa/soil-nutrient/product-categories',
        { params: { include_inactive: true } })
      setCategories(data)
    } finally {
      setLoading(false)
    }
  }

  async function saveCat() {
    if (!catForm) return
    setSaving(true); setError(null)
    try {
      const payload = {
        name: catForm.name.trim(),
        display_order: catForm.display_order,
      }
      if (catForm.id) {
        await api.patch(`/sa/soil-nutrient/product-categories/${catForm.id}`, payload)
      } else {
        await api.post('/sa/soil-nutrient/product-categories', { ...payload, scope: 'GLOBAL' })
      }
      setCatForm(null)
      load()
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail || 'Save failed'
      setError(msg)
    } finally { setSaving(false) }
  }

  async function saveField() {
    if (!fieldForm) return
    setSaving(true); setError(null)
    try {
      let enum_values_json: { options: string[] } | null = null
      if (fieldForm.field_type === 'ENUM' || fieldForm.field_type === 'MULTI_SELECT') {
        const options = fieldForm.enum_options
          .split(',').map(s => s.trim()).filter(s => s.length > 0)
        enum_values_json = { options }
      }
      const payload = {
        field_key: fieldForm.field_key.trim(),
        field_label: fieldForm.field_label.trim(),
        field_type: fieldForm.field_type,
        required: fieldForm.required,
        unit: fieldForm.unit.trim() || null,
        enum_values_json,
        display_order: fieldForm.display_order,
      }
      if (fieldForm.id) {
        await api.patch(`/sa/soil-nutrient/product-category-fields/${fieldForm.id}`, payload)
      } else {
        await api.post(
          `/sa/soil-nutrient/product-categories/${fieldForm.category_id}/fields`,
          payload,
        )
      }
      setFieldForm(null)
      load()
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail || 'Save failed'
      setError(msg)
    } finally { setSaving(false) }
  }

  async function deactivateCat(c: Category) {
    if (!confirm(`Deactivate "${c.name}"? Existing products using this category remain.`)) return
    await api.delete(`/sa/soil-nutrient/product-categories/${c.id}`)
    load()
  }

  async function deactivateField(f: CategoryField) {
    if (!confirm(`Deactivate field "${f.field_label}"?`)) return
    await api.delete(`/sa/soil-nutrient/product-category-fields/${f.id}`)
    load()
  }

  function openNewFieldForm(categoryId: string) {
    setError(null)
    setFieldForm({
      category_id: categoryId,
      field_key: '',
      field_label: '',
      field_type: 'TEXT',
      required: false,
      unit: '',
      enum_options: '',
      display_order: 0,
    })
  }

  function openEditFieldForm(f: CategoryField) {
    setError(null)
    setFieldForm({
      id: f.id,
      category_id: f.category_id,
      field_key: f.field_key,
      field_label: f.field_label,
      field_type: f.field_type,
      required: f.required,
      unit: f.unit || '',
      enum_options: (f.enum_values_json?.options || []).join(', '),
      display_order: f.display_order,
    })
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Product Categories</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Platform-seeded product types for Client Global Product List and Fallback Catalogue.
            {' '}Each category has its own field schema.
          </p>
        </div>
        <button
          onClick={() => { setError(null); setCatForm({ name: '', display_order: 0 }) }}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Category
        </button>
      </div>

      {loading ? (
        <p className="text-center py-12 text-slate-400">Loading…</p>
      ) : categories.length === 0 ? (
        <p className="text-center py-12 text-slate-400">No categories.</p>
      ) : (
        <div className="space-y-3">
          {categories.map(c => {
            const activeFields = c.fields.filter(f => f.status === 'ACTIVE')
            const isExpanded = expanded === c.id
            return (
              <div key={c.id}
                className={`bg-white border rounded-xl overflow-hidden ${c.status !== 'ACTIVE' ? 'border-slate-200 opacity-60' : 'border-slate-300'}`}>
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex-1 cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : c.id)}>
                    <div className="flex items-baseline gap-3">
                      <h3 className="font-semibold text-slate-900">
                        {c.name}
                        {c.status !== 'ACTIVE' && (
                          <span className="ml-2 text-xs text-slate-400 italic">(inactive)</span>
                        )}
                      </h3>
                      <span className="text-xs text-slate-400">
                        {activeFields.length} field{activeFields.length === 1 ? '' : 's'}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {c.scope}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setError(null)
                        setCatForm({ id: c.id, name: c.name, display_order: c.display_order })
                      }}
                      className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded border border-slate-200 hover:border-slate-300"
                    >Edit</button>
                    {c.status === 'ACTIVE' && (
                      <button onClick={() => deactivateCat(c)}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:border-red-300">
                        Deactivate
                      </button>
                    )}
                    <button onClick={() => setExpanded(isExpanded ? null : c.id)}
                      className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-100">
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between px-5 py-2 border-b border-slate-200">
                      <p className="text-xs font-medium text-slate-600">Fields</p>
                      <button onClick={() => openNewFieldForm(c.id)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                        + Add Field
                      </button>
                    </div>
                    {c.fields.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No fields yet.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-200">
                            <th className="text-left px-5 py-2 font-medium">Field Key</th>
                            <th className="text-left py-2 font-medium">Label</th>
                            <th className="text-left py-2 font-medium">Type</th>
                            <th className="text-left py-2 font-medium">Required</th>
                            <th className="text-left py-2 font-medium">Unit</th>
                            <th className="text-left py-2 font-medium">Options</th>
                            <th className="text-right pr-5 py-2 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.fields
                            .sort((a, b) => a.display_order - b.display_order)
                            .map(f => (
                              <tr key={f.id}
                                className={`border-b border-slate-200 last:border-0 ${f.status !== 'ACTIVE' ? 'opacity-40' : ''}`}>
                                <td className="px-5 py-2 font-mono text-slate-700">{f.field_key}</td>
                                <td className="py-2 text-slate-700">{f.field_label}</td>
                                <td className="py-2 text-slate-500">{f.field_type}</td>
                                <td className="py-2">
                                  {f.required ? (
                                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">YES</span>
                                  ) : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="py-2 text-slate-500">{f.unit || '—'}</td>
                                <td className="py-2 text-slate-500 max-w-xs truncate">
                                  {f.enum_values_json?.options?.join(', ') || '—'}
                                </td>
                                <td className="pr-5 py-2 text-right">
                                  <button onClick={() => openEditFieldForm(f)}
                                    className="text-slate-600 hover:text-slate-900 mr-2">Edit</button>
                                  {f.status === 'ACTIVE' && (
                                    <button onClick={() => deactivateField(f)}
                                      className="text-red-500 hover:text-red-700">×</button>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Category form modal */}
      {catForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !saving && setCatForm(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">
              {catForm.id ? 'Edit Category' : 'New Category'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Name</label>
                <input type="text" value={catForm.name}
                  onChange={e => setCatForm({ ...catForm, name: e.target.value })}
                  placeholder="e.g., Water Solubles"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Display Order</label>
                <input type="number" value={catForm.display_order}
                  onChange={e => setCatForm({ ...catForm, display_order: parseInt(e.target.value || '0', 10) })}
                  className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setCatForm(null)} disabled={saving}
                className="text-sm text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={saveCat} disabled={saving || !catForm.name.trim()}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : catForm.id ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field form modal */}
      {fieldForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !saving && setFieldForm(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">
              {fieldForm.id ? 'Edit Field' : 'New Field'}
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Field Key</label>
                  <input type="text" value={fieldForm.field_key}
                    onChange={e => setFieldForm({ ...fieldForm, field_key: e.target.value })}
                    placeholder="e.g., n_pct"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Type</label>
                  <select value={fieldForm.field_type}
                    onChange={e => setFieldForm({ ...fieldForm, field_type: e.target.value as FieldType })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Label</label>
                <input type="text" value={fieldForm.field_label}
                  onChange={e => setFieldForm({ ...fieldForm, field_label: e.target.value })}
                  placeholder="e.g., N %"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Unit</label>
                  <input type="text" value={fieldForm.unit}
                    onChange={e => setFieldForm({ ...fieldForm, unit: e.target.value })}
                    placeholder="e.g., %"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Display Order</label>
                  <input type="number" value={fieldForm.display_order}
                    onChange={e => setFieldForm({ ...fieldForm, display_order: parseInt(e.target.value || '0', 10) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pb-2">
                  <input type="checkbox" checked={fieldForm.required}
                    onChange={e => setFieldForm({ ...fieldForm, required: e.target.checked })}
                    className="rounded border-slate-300" />
                  Required
                </label>
              </div>
              {(fieldForm.field_type === 'ENUM' || fieldForm.field_type === 'MULTI_SELECT') && (
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">
                    Options <span className="text-slate-400">(comma-separated)</span>
                  </label>
                  <input type="text" value={fieldForm.enum_options}
                    onChange={e => setFieldForm({ ...fieldForm, enum_options: e.target.value })}
                    placeholder="e.g., prilled, granule, powder"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setFieldForm(null)} disabled={saving}
                className="text-sm text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={saveField}
                disabled={saving || !fieldForm.field_key.trim() || !fieldForm.field_label.trim()}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : fieldForm.id ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
