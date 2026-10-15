'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type SoilParameter = {
  id: string
  name: string
  unit: string | null
  category_group: string
  display_order: number
  status: 'ACTIVE' | 'INACTIVE'
}

type PresetProfile = {
  id: string
  name: string
  description: string | null
  values_json: Record<string, number>
  display_order: number
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  updated_at: string
}

type FormState = {
  id?: string
  name: string
  description: string
  values: Record<string, string>  // string during form editing
  display_order: number
}

const EMPTY_FORM: FormState = {
  name: '', description: '', values: {}, display_order: 0,
}

export default function PresetProfilesPage() {
  const [presets, setPresets] = useState<PresetProfile[]>([])
  const [parameters, setParameters] = useState<SoilParameter[]>([])
  const [loading, setLoading] = useState(true)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { load() }, [includeInactive])

  async function load() {
    try {
      setLoading(true)
      const [p1, p2] = await Promise.all([
        api.get('/sa/soil-nutrient/preset-profiles',
          { params: { include_inactive: includeInactive } }),
        api.get('/sa/soil-nutrient/parameters'),  // active only — fills form
      ])
      setPresets(p1.data)
      setParameters(p2.data)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      // Convert string values back to numbers; empty = omit
      const values_json: Record<string, number> = {}
      for (const [k, v] of Object.entries(form.values)) {
        const s = v.trim()
        if (s === '') continue
        const n = parseFloat(s)
        if (!isNaN(n)) values_json[k] = n
      }
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        values_json,
        display_order: form.display_order,
      }
      if (form.id) {
        await api.patch(`/sa/soil-nutrient/preset-profiles/${form.id}`, payload)
      } else {
        await api.post('/sa/soil-nutrient/preset-profiles', payload)
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

  async function deactivate(p: PresetProfile) {
    if (!confirm(`Deactivate "${p.name}"?`)) return
    await api.delete(`/sa/soil-nutrient/preset-profiles/${p.id}`)
    load()
  }

  async function reactivate(p: PresetProfile) {
    await api.patch(`/sa/soil-nutrient/preset-profiles/${p.id}`, { status: 'ACTIVE' })
    load()
  }

  const activeCount = presets.filter(p => p.status === 'ACTIVE').length

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Preset Soil Profiles</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Canonical soil-value patterns for Mock input · {activeCount} active · consumed by all Clients
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
            onClick={() => { setError(null); setForm({ ...EMPTY_FORM, values: {} }) }}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Add Preset
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-12 text-slate-400">Loading…</p>
      ) : presets.length === 0 ? (
        <p className="text-center py-12 text-slate-400">No presets.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {presets.map(p => {
            const valueCount = Object.keys(p.values_json).length
            const isExpanded = expanded === p.id
            return (
              <div key={p.id}
                className={`border-b border-slate-100 last:border-0 ${p.status !== 'ACTIVE' ? 'bg-slate-50' : ''}`}>
                <div className="flex items-start justify-between px-5 py-3.5">
                  <div className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : p.id)}>
                    <div className="flex items-baseline gap-2">
                      <p className="font-medium text-slate-800 text-sm">
                        {p.name}
                        {p.status !== 'ACTIVE' && (
                          <span className="ml-2 text-xs text-slate-400 italic">(inactive)</span>
                        )}
                      </p>
                      <span className="text-xs text-slate-400">
                        {valueCount} value{valueCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    {p.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button
                      onClick={() => {
                        setError(null)
                        const stringValues: Record<string, string> = {}
                        for (const [k, v] of Object.entries(p.values_json)) {
                          stringValues[k] = String(v)
                        }
                        setForm({
                          id: p.id,
                          name: p.name,
                          description: p.description || '',
                          values: stringValues,
                          display_order: p.display_order,
                        })
                      }}
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
                {isExpanded && (
                  <div className="px-5 pb-4 pt-0 bg-slate-50 border-t border-slate-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-200">
                          <th className="text-left py-1.5 font-medium">Parameter</th>
                          <th className="text-right py-1.5 font-medium">Value</th>
                          <th className="text-left pl-2 py-1.5 font-medium">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(p.values_json).map(([name, value]) => {
                          const param = parameters.find(x => x.name === name)
                          return (
                            <tr key={name} className="border-b border-slate-100 last:border-0">
                              <td className="py-1.5 text-slate-700">{name}</td>
                              <td className="py-1.5 text-right font-mono text-slate-900">{value}</td>
                              <td className="pl-2 py-1.5 text-slate-500">{param?.unit || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Form modal */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !saving && setForm(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold">
                {form.id ? 'Edit Preset Profile' : 'New Preset Profile'}
              </h2>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Name</label>
                <input type="text" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Low Zn, high P"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Description <span className="text-slate-400">(optional)</span>
                </label>
                <textarea value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Short note about what this scenario exercises"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Display Order</label>
                <input type="number" value={form.display_order}
                  onChange={e => setForm({ ...form, display_order: parseInt(e.target.value || '0', 10) })}
                  className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Soil Values</p>
                <p className="text-xs text-slate-500 mb-3">
                  Leave blank for parameters that aren&apos;t part of this scenario.
                  Values entered here pre-fill the Mock on Generate.
                </p>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {parameters.map((param, i) => (
                    <div key={param.id}
                      className={`flex items-center gap-3 px-3 py-2 ${i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 truncate">{param.name}</p>
                      </div>
                      <input type="text" inputMode="decimal"
                        value={form.values[param.name] || ''}
                        onChange={e => setForm({
                          ...form,
                          values: { ...form.values, [param.name]: e.target.value },
                        })}
                        className="w-28 border border-slate-300 rounded px-2 py-1 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <span className="text-xs text-slate-400 w-14 flex-shrink-0">{param.unit || '—'}</span>
                    </div>
                  ))}
                </div>
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
