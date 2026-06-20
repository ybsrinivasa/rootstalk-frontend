'use client'
import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface Formula {
  id: string; measure: string; l2_practice: string; application_method: string
  brand_unit: string; dosage_unit: string; formula: string; status: string
}

type Tab = 'active' | 'inactive'

export default function VolumeCalculationsPage() {
  const [formulas, setFormulas] = useState<Formula[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('active')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Formula | null>(null)
  const [form, setForm] = useState({ measure: '', l2_practice: '', application_method: '', brand_unit: '', dosage_unit: '', formula: '' })
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = () =>
    api.get<Formula[]>('/admin/volume-formulas')
      .then(r => setFormulas(r.data))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  function openEdit(f: Formula) {
    setEditing(f)
    setForm({ measure: f.measure, l2_practice: f.l2_practice, application_method: f.application_method, brand_unit: f.brand_unit, dosage_unit: f.dosage_unit, formula: f.formula })
    setShowCreate(true)
  }

  async function save() {
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/admin/volume-formulas/${editing.id}`, form)
      } else {
        await api.post('/admin/volume-formulas', form)
      }
      setShowCreate(false)
      setEditing(null)
      setForm({ measure: '', l2_practice: '', application_method: '', brand_unit: '', dosage_unit: '', formula: '' })
      load()
    } finally { setSaving(false) }
  }

  async function toggleStatus(f: Formula) {
    const next = f.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const verb = next === 'INACTIVE' ? 'Deactivate' : 'Activate'
    if (!confirm(`${verb} the ${f.l2_practice} · ${f.application_method} formula?`)) return
    setTogglingId(f.id)
    try {
      await api.put(`/admin/volume-formulas/${f.id}`, { status: next })
      load()
    } finally { setTogglingId(null) }
  }

  const activeCount = formulas.filter(f => f.status === 'ACTIVE').length
  const inactiveCount = formulas.length - activeCount

  const filtered = formulas
    .filter(f => tab === 'active' ? f.status === 'ACTIVE' : f.status !== 'ACTIVE')
    .filter(f =>
      !search || f.l2_practice.toLowerCase().includes(search.toLowerCase()) ||
      f.application_method.toLowerCase().includes(search.toLowerCase())
    )

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Volume Calculations</h1>
          <p className="text-slate-500 text-sm mt-0.5">{formulas.length} formulas · Used to calculate estimated input volumes for dealers</p>
          <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 inline-block">
            <p className="text-xs text-blue-700">
              <strong>Privilege required:</strong> Volume Calculations
            </p>
          </div>
        </div>
        <button onClick={() => { setEditing(null); setForm({ measure: '', l2_practice: '', application_method: '', brand_unit: '', dosage_unit: '', formula: '' }); setShowCreate(true) }}
          className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800">
          + Add Formula
        </button>
      </div>

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {([['active', `Active (${activeCount})`], ['inactive', `Inactive (${inactiveCount})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === k
                ? 'border-green-700 text-green-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by practice type or application method…"
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30" />
      </div>

      {loading ? (
        <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['L2 Practice', 'Application Method', 'Brand Unit', 'Dosage Unit', 'Formula', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(f => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{f.l2_practice}</td>
                  <td className="px-4 py-3 text-slate-600">{f.application_method}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{f.brand_unit}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{f.dosage_unit}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    <div className="max-w-[20rem] truncate" title={f.formula}>{f.formula}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(f)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50">
                        Edit
                      </button>
                      <button onClick={() => toggleStatus(f)} disabled={togglingId === f.id}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border disabled:opacity-50 ${
                          f.status === 'ACTIVE'
                            ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}>
                        {togglingId === f.id ? '…' : (f.status === 'ACTIVE' ? 'Deactivate' : 'Activate')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">
                  {tab === 'active' ? 'No active formulas found' : 'No inactive formulas'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <h2 className="font-bold text-slate-900 text-lg mb-4">{editing ? 'Edit Formula' : 'Add Formula'}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Measure" value={form.measure} onChange={v => setForm(f => ({ ...f, measure: v }))} placeholder="AREA" />
                <FormField label="L2 Practice" value={form.l2_practice} onChange={v => setForm(f => ({ ...f, l2_practice: v }))} placeholder="Fungicide" />
                <FormField label="Application Method" value={form.application_method} onChange={v => setForm(f => ({ ...f, application_method: v }))} placeholder="Foliar" />
                <FormField label="Brand Unit" value={form.brand_unit} onChange={v => setForm(f => ({ ...f, brand_unit: v }))} placeholder="mL/pump" />
                <FormField label="Dosage Unit" value={form.dosage_unit} onChange={v => setForm(f => ({ ...f, dosage_unit: v }))} placeholder="mL/L" />
              </div>
              <FormField label="Formula expression" value={form.formula} onChange={v => setForm(f => ({ ...f, formula: v }))} placeholder="Dosage * Total_area / Concentration" />
              <p className="text-xs text-slate-400">Variables available: Dosage, Total_area, Concentration, Volume_water</p>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={save} disabled={saving || !form.l2_practice || !form.formula}
                className="flex-1 py-3 bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-green-800">
                {saving ? 'Saving…' : editing ? 'Update' : 'Add Formula'}
              </button>
              <button onClick={() => { setShowCreate(false); setEditing(null) }}
                className="px-5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function FormField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
    </div>
  )
}
