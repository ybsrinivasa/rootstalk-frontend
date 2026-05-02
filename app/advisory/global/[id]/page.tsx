'use client'
import { useEffect, useState, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface Package {
  id: string; name: string; crop_cosh_id: string
  package_type: string; status: string; duration_days: number
  version: number; description: string | null; created_at: string
}
interface Timeline {
  id: string; name: string; from_type: string; from_value: number; to_value: number; display_order: number
}
interface Practice {
  id: string; l0_type: string; l1_type: string | null; l2_type: string | null
  display_order: number; is_special_input: boolean
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
}
const L0_COLOUR: Record<string, string> = {
  INPUT: 'bg-blue-100 text-blue-700', NON_INPUT: 'bg-purple-100 text-purple-700',
  INSTRUCTION: 'bg-amber-100 text-amber-700', MEDIA: 'bg-pink-100 text-pink-700',
}
const FROM_TYPES = ['DAS', 'DBS', 'CALENDAR']

export default function GlobalPackageDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [pkg, setPkg] = useState<Package | null>(null)
  const [timelines, setTimelines] = useState<Timeline[]>([])
  const [practiceMap, setPracticeMap] = useState<Record<string, Practice[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  const [showAddTL, setShowAddTL] = useState(false)
  const [addingTL, setAddingTL] = useState(false)
  const [tlError, setTlError] = useState('')
  const [tlForm, setTlForm] = useState({ name: '', from_type: 'DAS', from_value: '1', to_value: '30' })

  const [showAddPractice, setShowAddPractice] = useState<string | null>(null)
  const [addingPractice, setAddingPractice] = useState(false)
  const [practiceError, setPracticeError] = useState('')
  const [practiceForm, setPracticeForm] = useState({
    l0_type: 'INPUT', l1_type: '', l2_type: '', display_order: '0', is_special_input: false,
  })

  const loadTimelines = () =>
    api.get<Timeline[]>(`/advisory/global/packages/${id}/timelines`)
      .then(r => setTimelines(r.data))

  useEffect(() => {
    api.get<Package>(`/advisory/global/packages/${id}`)
      .then(r => setPkg(r.data))
      .catch(() => router.replace('/advisory/global'))
    loadTimelines()
  }, [id])

  const loadPractices = (tlId: string) =>
    api.get<Practice[]>(`/advisory/global/packages/${id}/timelines/${tlId}/practices`)
      .then(r => setPracticeMap(m => ({ ...m, [tlId]: r.data })))

  const toggle = (tlId: string) => {
    if (expanded === tlId) { setExpanded(null); return }
    setExpanded(tlId)
    if (!practiceMap[tlId]) loadPractices(tlId)
  }

  async function handlePublish() {
    setPublishing(true)
    try {
      const { data } = await api.post<Package>(`/advisory/global/packages/${id}/publish`)
      setPkg(data)
    } finally { setPublishing(false) }
  }

  async function handleAddTimeline(e: FormEvent) {
    e.preventDefault()
    setAddingTL(true); setTlError('')
    try {
      const { data } = await api.post<Timeline>(`/advisory/global/packages/${id}/timelines`, {
        name: tlForm.name, from_type: tlForm.from_type,
        from_value: parseInt(tlForm.from_value), to_value: parseInt(tlForm.to_value),
      })
      setShowAddTL(false)
      setTlForm({ name: '', from_type: 'DAS', from_value: '1', to_value: '30' })
      setTimelines(tls => [...tls, data])
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setTlError(msg || 'Failed.')
    } finally { setAddingTL(false) }
  }

  async function handleDeleteTL(tl: Timeline) {
    if (!confirm(`Delete timeline "${tl.name}"?`)) return
    await api.delete(`/advisory/global/packages/${id}/timelines/${tl.id}`)
    setTimelines(tls => tls.filter(t => t.id !== tl.id))
    if (expanded === tl.id) setExpanded(null)
  }

  async function handleAddPractice(e: FormEvent) {
    e.preventDefault()
    if (!showAddPractice) return
    setAddingPractice(true); setPracticeError('')
    try {
      await api.post(`/advisory/global/packages/${id}/timelines/${showAddPractice}/practices`, {
        l0_type: practiceForm.l0_type,
        l1_type: practiceForm.l1_type || null,
        l2_type: practiceForm.l2_type || null,
        display_order: parseInt(practiceForm.display_order),
        is_special_input: practiceForm.is_special_input,
        elements: [],
      })
      setShowAddPractice(null)
      setPracticeForm({ l0_type: 'INPUT', l1_type: '', l2_type: '', display_order: '0', is_special_input: false })
      loadPractices(showAddPractice)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPracticeError(msg || 'Failed.')
    } finally { setAddingPractice(false) }
  }

  async function handleDeletePractice(tlId: string, practiceId: string) {
    if (!confirm('Delete this practice?')) return
    await api.delete(`/advisory/global/packages/${id}/timelines/${tlId}/practices/${practiceId}`)
    setPracticeMap(m => ({ ...m, [tlId]: (m[tlId] || []).filter(p => p.id !== practiceId) }))
  }

  if (!pkg) return <AdminLayout><div className="pt-20 text-center text-slate-400">Loading…</div></AdminLayout>

  return (
    <AdminLayout>
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <button onClick={() => router.back()} className="mt-1 text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{pkg.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">GLOBAL TEMPLATE</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOUR[pkg.status] || 'bg-slate-100 text-slate-600'}`}>{pkg.status}</span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              {pkg.package_type} · {pkg.duration_days} days · Crop: <span className="font-mono">{pkg.crop_cosh_id}</span> · v{pkg.version}
            </p>
            {pkg.description && <p className="text-slate-400 text-sm mt-1">{pkg.description}</p>}
          </div>
          {pkg.status === 'DRAFT' && (
            <button onClick={handlePublish} disabled={publishing}
              className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
              {publishing ? 'Publishing…' : '✓ Publish'}
            </button>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <strong>Global template</strong> — Clients fork this to create their own customised copy. Changes here do not affect existing client copies.
        </div>

        {/* Timelines */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">
              Timelines <span className="text-slate-400 font-normal text-sm">({timelines.length})</span>
            </h2>
            <button onClick={() => setShowAddTL(true)}
              className="text-sm font-medium px-3 py-1.5 rounded-xl border border-blue-300 text-blue-600 hover:bg-blue-50">
              + Add Timeline
            </button>
          </div>

          {timelines.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-200">
              <p className="text-slate-500 text-sm">No timelines yet. Add practice windows like "Week 1–4 (Germination)" with INPUT/INSTRUCTION/NON_INPUT practices.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {timelines.map(tl => (
                <div key={tl.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50" onClick={() => toggle(tl.id)}>
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 text-sm">{tl.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{tl.from_type} · Day {tl.from_value} → {tl.to_value}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDeleteTL(tl) }} className="text-slate-300 hover:text-red-400 p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded === tl.id ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {expanded === tl.id && (
                    <div className="border-t border-slate-100 px-5 py-4 space-y-2">
                      {!practiceMap[tl.id]
                        ? <p className="text-xs text-slate-400">Loading…</p>
                        : practiceMap[tl.id].length === 0
                          ? <p className="text-xs text-slate-400 italic">No practices yet.</p>
                          : practiceMap[tl.id].map(p => (
                            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${L0_COLOUR[p.l0_type] || 'bg-slate-100'}`}>{p.l0_type}</span>
                              <span className="text-sm text-slate-700 flex-1">
                                {[p.l1_type, p.l2_type].filter(Boolean).join(' › ') || <span className="text-slate-400 italic">No sub-type</span>}
                              </span>
                              {p.is_special_input && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">special</span>}
                              <button onClick={() => handleDeletePractice(tl.id, p.id)} className="text-slate-300 hover:text-red-400 p-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))
                      }
                      <button onClick={() => setShowAddPractice(tl.id)} className="text-xs font-medium text-blue-600 mt-2 hover:underline">
                        + Add Practice
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Timeline Modal */}
        {showAddTL && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="p-6 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Add Timeline Window</h2>
                <p className="text-slate-500 text-sm mt-0.5">Define a practice window (e.g. Week 1–4 germination stage)</p>
              </div>
              <form onSubmit={handleAddTimeline} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
                  <input value={tlForm.name} onChange={e => setTlForm(f => ({ ...f, name: e.target.value }))}
                    required placeholder="e.g. Germination Stage (Week 1–4)"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Reference Type</label>
                  <select value={tlForm.from_type} onChange={e => setTlForm(f => ({ ...f, from_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {FROM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">From (day)</label>
                    <input type="number" value={tlForm.from_value}
                      onChange={e => setTlForm(f => ({ ...f, from_value: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">To (day)</label>
                    <input type="number" value={tlForm.to_value}
                      onChange={e => setTlForm(f => ({ ...f, to_value: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
                  </div>
                </div>
                {tlError && <p className="text-sm text-red-600">{tlError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddTL(false); setTlError('') }}
                    className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={addingTL}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {addingTL ? 'Adding…' : 'Add Timeline'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Practice Modal */}
        {showAddPractice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="p-6 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Add Practice</h2>
              </div>
              <form onSubmit={handleAddPractice} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type (L0)</label>
                  <select value={practiceForm.l0_type}
                    onChange={e => setPracticeForm(f => ({ ...f, l0_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="INPUT">INPUT</option>
                    <option value="NON_INPUT">NON_INPUT</option>
                    <option value="INSTRUCTION">INSTRUCTION</option>
                    <option value="MEDIA">MEDIA</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">L1 (category)</label>
                    <input value={practiceForm.l1_type}
                      onChange={e => setPracticeForm(f => ({ ...f, l1_type: e.target.value }))}
                      placeholder="e.g. FERTILISER"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">L2 (specific)</label>
                    <input value={practiceForm.l2_type}
                      onChange={e => setPracticeForm(f => ({ ...f, l2_type: e.target.value }))}
                      placeholder="e.g. UREA"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                  <input type="checkbox" checked={practiceForm.is_special_input}
                    onChange={e => setPracticeForm(f => ({ ...f, is_special_input: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                  Special input (adjuvant — never suppressed by BL-03)
                </label>
                {practiceError && <p className="text-sm text-red-600">{practiceError}</p>}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddPractice(null); setPracticeError('') }}
                    className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={addingPractice}
                    className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                    {addingPractice ? 'Adding…' : 'Add Practice'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
