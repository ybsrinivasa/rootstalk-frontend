'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type CategoryGroup = 'BASE' | 'PRIMARY' | 'SECONDARY' | 'MICRO' | 'OTHER' | 'RATIO'

type SoilParameter = {
  id: string
  name: string
  unit: string | null
  category_group: CategoryGroup
  formula: string | null
  measurement_method_note: string | null
  display_order: number
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  updated_at: string
}

const GROUP_ORDER: CategoryGroup[] = ['BASE', 'PRIMARY', 'SECONDARY', 'MICRO', 'OTHER', 'RATIO']
const GROUP_LABEL: Record<CategoryGroup, string> = {
  BASE: 'Base soil chemistry',
  PRIMARY: 'Primary nutrients',
  SECONDARY: 'Secondary nutrients',
  MICRO: 'Micronutrients',
  OTHER: 'Other',
  RATIO: 'Derived ratios',
}
const GROUP_COLOR: Record<CategoryGroup, string> = {
  BASE: 'bg-slate-100 text-slate-700',
  PRIMARY: 'bg-emerald-100 text-emerald-700',
  SECONDARY: 'bg-blue-100 text-blue-700',
  MICRO: 'bg-amber-100 text-amber-700',
  OTHER: 'bg-purple-100 text-purple-700',
  RATIO: 'bg-pink-100 text-pink-700',
}

type FormState = {
  id?: string
  name: string
  unit: string
  category_group: CategoryGroup
  formula: string
  measurement_method_note: string
  display_order: number
}

const EMPTY_FORM: FormState = {
  name: '', unit: '', category_group: 'BASE', formula: '',
  measurement_method_note: '', display_order: 0,
}

export default function SoilParametersPage() {
  const [params, setParams] = useState<SoilParameter[]>([])
  const [loading, setLoading] = useState(true)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [includeInactive])

  async function load() {
    try {
      setLoading(true)
      const { data } = await api.get(
        '/sa/soil-nutrient/parameters',
        { params: { include_inactive: includeInactive } },
      )
      setParams(data)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        unit: form.unit.trim() || null,
        category_group: form.category_group,
        formula: form.formula.trim() || null,
        measurement_method_note: form.measurement_method_note.trim() || null,
        display_order: form.display_order,
      }
      if (form.id) {
        await api.patch(`/sa/soil-nutrient/parameters/${form.id}`, payload)
      } else {
        await api.post('/sa/soil-nutrient/parameters', payload)
      }
      setForm(null)
      load()
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail || 'Save failed'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(p: SoilParameter) {
    if (!confirm(`Deactivate "${p.name}"? It can be reactivated later via edit.`)) return
    await api.delete(`/sa/soil-nutrient/parameters/${p.id}`)
    load()
  }

  async function reactivate(p: SoilParameter) {
    await api.patch(`/sa/soil-nutrient/parameters/${p.id}`, { status: 'ACTIVE' })
    load()
  }

  const grouped = GROUP_ORDER.map(g => ({
    group: g,
    items: params.filter(p => p.category_group === g),
  })).filter(g => g.items.length > 0)

  const activeCount = params.filter(p => p.status === 'ACTIVE').length
  const inactiveCount = params.filter(p => p.status !== 'ACTIVE').length

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Soil Parameters</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Platform canon for Normal Range authoring · {activeCount} active
            {includeInactive && inactiveCount > 0 && ` · ${inactiveCount} inactive`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox"
              checked={includeInactive}
              onChange={e => setIncludeInactive(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show inactive
          </label>
          <button
            onClick={() => { setError(null); setForm({ ...EMPTY_FORM }) }}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Add Parameter
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-12 text-slate-400">Loading…</p>
      ) : grouped.length === 0 ? (
        <p className="text-center py-12 text-slate-400">No parameters.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ group, items }) => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded ${GROUP_COLOR[group]}`}>
                  {GROUP_LABEL[group]}
                </span>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {items.map(p => (
                  <div key={p.id}
                    className={`flex items-start justify-between px-5 py-3.5 border-b border-slate-100 last:border-0 ${p.status !== 'ACTIVE' ? 'bg-slate-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3">
                        <p className="font-medium text-slate-800 text-sm">
                          {p.name}
                          {p.status !== 'ACTIVE' && (
                            <span className="ml-2 text-xs text-slate-400 italic">(inactive)</span>
                          )}
                        </p>
                        {p.unit && (
                          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{p.unit}</span>
                        )}
                      </div>
                      {p.formula && (
                        <p className="text-xs text-slate-500 mt-0.5 font-mono">= {p.formula}</p>
                      )}
                      {p.measurement_method_note && (
                        <p className="text-xs text-slate-400 mt-0.5">{p.measurement_method_note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button
                        onClick={() => {
                          setError(null)
                          setForm({
                            id: p.id,
                            name: p.name,
                            unit: p.unit || '',
                            category_group: p.category_group,
                            formula: p.formula || '',
                            measurement_method_note: p.measurement_method_note || '',
                            display_order: p.display_order,
                          })
                        }}
                        className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded border border-slate-200 hover:border-slate-300"
                      >Edit</button>
                      {p.status === 'ACTIVE' ? (
                        <button
                          onClick={() => deactivate(p)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:border-red-300"
                        >Deactivate</button>
                      ) : (
                        <button
                          onClick={() => reactivate(p)}
                          className="text-xs text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded border border-emerald-200 hover:border-emerald-300"
                        >Reactivate</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / create modal */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !saving && setForm(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">
              {form.id ? 'Edit Parameter' : 'New Parameter'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Name</label>
                <input type="text" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Available Zinc"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Unit</label>
                  <input type="text" value={form.unit}
                    onChange={e => setForm({ ...form, unit: e.target.value })}
                    placeholder="ppm, kg/ha, %, dSm-1 or blank for dimensionless"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Category Group</label>
                  <select value={form.category_group}
                    onChange={e => setForm({ ...form, category_group: e.target.value as CategoryGroup })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {GROUP_ORDER.map(g => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Formula <span className="text-slate-400">(for RATIO group only)</span>
                </label>
                <input type="text" value={form.formula}
                  onChange={e => setForm({ ...form, formula: e.target.value })}
                  placeholder="e.g., Available Calcium / Available Magnesium"
                  disabled={form.category_group !== 'RATIO'}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Measurement Method Note <span className="text-slate-400">(optional)</span>
                </label>
                <input type="text" value={form.measurement_method_note}
                  onChange={e => setForm({ ...form, measurement_method_note: e.target.value })}
                  placeholder="e.g., DTPA extraction + AAS detection"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Display Order</label>
                <input type="number" value={form.display_order}
                  onChange={e => setForm({ ...form, display_order: parseInt(e.target.value || '0', 10) })}
                  className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setForm(null)} disabled={saving}
                className="text-sm text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving || !form.name.trim()}
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
