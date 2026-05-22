'use client'
import { useEffect, useState, useMemo, FormEvent, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface Package {
  id: string; name: string; crop_cosh_id: string
  package_type: 'ANNUAL' | 'PERENNIAL'
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  duration_days: number; version: number; description: string | null; created_at: string
}

interface CoshCrop {
  cosh_id: string
  name_en: string
  status: string
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
}

// V1 hardcoded — Cosh hasn't shipped a start-date-label Connect yet.
// 2026-05-22: live Cosh list from `/cosh/options/start-date-names`.
interface StartDateOption { cosh_id: string; name: string }

function GlobalPackagesContent() {
  const router = useRouter()
  const params = useSearchParams()
  const cropFilter = params.get('crop') || ''

  const [packages, setPackages] = useState<Package[]>([])
  const [coshCrops, setCoshCrops] = useState<CoshCrop[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '', crop_cosh_id: '', package_type: 'ANNUAL',
    duration_days: '120',
    start_date_label_cosh_id: '',
    description: '',
  })
  const [startDateLabels, setStartDateLabels] = useState<StartDateOption[]>([])

  useEffect(() => {
    api.get<StartDateOption[]>(`/cosh/options/start-date-names`)
      .then(r => setStartDateLabels(r.data))
      .catch(() => setStartDateLabels([]))
  }, [])

  const load = () => {
    setLoading(true)
    const qs = new URLSearchParams()
    qs.set('include_drafts', 'true')
    if (cropFilter) qs.set('crop_cosh_id', cropFilter)
    Promise.all([
      api.get<Package[]>(`/advisory/global/packages?${qs.toString()}`),
      coshCrops.length === 0
        ? api.get<CoshCrop[]>('/admin/cosh/crops')
        : Promise.resolve({ data: coshCrops }),
    ])
      .then(([{ data: pkgs }, { data: crops }]) => {
        setPackages(pkgs)
        if (coshCrops.length === 0) setCoshCrops(crops)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [cropFilter])

  // 2026-05-22 lineage rollup — one row per (crop, lowercase(name)).
  // Head precedence: DRAFT > ACTIVE > INACTIVE (most-current first).
  // Pre-rollup the list flattened every version into its own row;
  // testers misread same-lineage versions as duplicates. Older
  // versions remain reachable via the detail page's Version-history
  // disclosure.
  const STATUS_RANK: Record<string, number> = { DRAFT: 0, ACTIVE: 1, INACTIVE: 2 }
  interface LineageRow {
    head: Package
    versionCount: number
  }
  const lineages = useMemo<LineageRow[]>(() => {
    const groups = new Map<string, Package[]>()
    for (const p of packages) {
      const key = `${p.crop_cosh_id}::${p.name.trim().toLowerCase()}`
      const arr = groups.get(key)
      if (arr) arr.push(p); else groups.set(key, [p])
    }
    const rows: LineageRow[] = []
    for (const arr of groups.values()) {
      const sorted = [...arr].sort((a, b) => {
        const r = STATUS_RANK[a.status] - STATUS_RANK[b.status]
        if (r !== 0) return r
        if (b.version !== a.version) return b.version - a.version
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      rows.push({ head: sorted[0], versionCount: arr.length })
    }
    rows.sort((a, b) => {
      const diff = new Date(b.head.created_at).getTime() - new Date(a.head.created_at).getTime()
      if (diff !== 0) return diff
      return a.head.name.localeCompare(b.head.name)
    })
    return rows
  }, [packages])

  const cropNameById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of coshCrops) m[c.cosh_id] = c.name_en
    return m
  }, [coshCrops])

  const activeCropName = cropFilter ? (cropNameById[cropFilter] || cropFilter) : ''

  function clearCropFilter() {
    router.replace('/advisory/global/packages')
  }

  function openCreate() {
    setForm({
      name: '',
      crop_cosh_id: cropFilter || '',  // pre-fill from chip
      package_type: 'ANNUAL',
      duration_days: '120',
      start_date_label_cosh_id: startDateLabels[0]?.cosh_id || '',
      description: '',
    })
    setError('')
    setShowCreate(true)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!form.crop_cosh_id) {
      setError('Please pick a crop.')
      return
    }
    setCreating(true); setError('')
    try {
      await api.post('/advisory/global/packages', {
        ...form, duration_days: parseInt(form.duration_days),
      })
      setShowCreate(false)
      setForm({
        name: '', crop_cosh_id: '', package_type: 'ANNUAL',
        duration_days: '120',
        start_date_label_cosh_id: startDateLabels[0]?.cosh_id || '',
        description: '',
      })
      load()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : (detail as { message?: string })?.message
      setError(msg || 'Failed to create package.')
    } finally { setCreating(false) }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global CCA · Packages</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Master Package of Practices templates. Publish, then push selectively to assigned clients.
          </p>
        </div>
        <button onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
          + New Global Package
        </button>
      </div>

      {cropFilter && (
        <div className="mb-4">
          <button
            onClick={clearCropFilter}
            className="inline-flex items-center gap-2 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-100">
            Crop: {activeCropName}
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">Loading…</div>
      ) : lineages.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-200">
          <p className="text-slate-600 font-medium">
            {cropFilter ? `No Global Packages for ${activeCropName} yet` : 'No global packages yet'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            Create standard Package of Practices templates here. Once published, push them to assigned clients from the package detail page.
          </p>
          <button onClick={openCreate}
            className="mt-4 bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
            {cropFilter ? `+ Start ${activeCropName} Package` : 'Create First Template'}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Package Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Crop</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lineages.map(({ head: pkg, versionCount }) => (
                <tr key={pkg.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5">
                    <Link href={`/advisory/global/${pkg.id}`}
                      className="font-medium text-slate-800 hover:text-blue-600">{pkg.name}</Link>
                    <span className="text-xs text-slate-400 ml-2">v{pkg.version}</span>
                    {versionCount > 1 && (
                      <span className="text-xs text-slate-400 ml-1.5">
                        · {versionCount} versions
                      </span>
                    )}
                    {pkg.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{pkg.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 hidden md:table-cell text-xs">
                    {cropNameById[pkg.crop_cosh_id] || pkg.crop_cosh_id}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 hidden sm:table-cell capitalize text-xs">{pkg.package_type.toLowerCase()}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOUR[pkg.status]}`}>{pkg.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-slate-400 text-xs">{pkg.duration_days}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">New Global Package Template</h2>
              <p className="text-slate-500 text-sm mt-0.5">Once published, you&apos;ll be able to push this to assigned clients from the detail page.</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Package Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required placeholder="e.g. Standard Kharif Paddy PoP"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Crop</label>
                {cropFilter ? (
                  // SE entered from the Crops page with a specific crop
                  // pinned. Show as read-only so they can't accidentally
                  // create a package under the wrong crop. Per user
                  // 2026-05-14 — the Crops → Packages hierarchy is the
                  // only authoring path; the dropdown is redundant here.
                  <div className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 text-slate-700">
                    {activeCropName}
                  </div>
                ) : (
                  <select value={form.crop_cosh_id}
                    onChange={e => setForm(f => ({ ...f, crop_cosh_id: e.target.value }))}
                    required
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">— Select a crop —</option>
                    {coshCrops.map(c => (
                      <option key={c.cosh_id} value={c.cosh_id}>{c.name_en}</option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  {cropFilter
                    ? 'Locked to the crop you came in from. Go back to the Crops page to switch.'
                    : 'All Cosh-classified crops. Curated upstream — appears here on next sync.'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Date Label</label>
                <select value={form.start_date_label_cosh_id}
                  onChange={e => setForm(f => ({ ...f, start_date_label_cosh_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {!form.start_date_label_cosh_id && (
                    <option value="">— pick a label —</option>
                  )}
                  {startDateLabels.map(l => (
                    <option key={l.cosh_id} value={l.cosh_id}>{l.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  The farmer-facing crop-start anchor for this package.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
                  <select value={form.package_type}
                    onChange={e => {
                      const next = e.target.value as 'ANNUAL' | 'PERENNIAL'
                      // Batch 39K — Perennial is fixed at 365.
                      // Auto-set duration when the SE switches type so
                      // the field doesn't lag behind.
                      setForm(f => ({
                        ...f,
                        package_type: next,
                        duration_days: next === 'PERENNIAL' ? '365' : f.duration_days,
                      }))
                    }}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="ANNUAL">Annual</option>
                    <option value="PERENNIAL">Perennial</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Locked once saved.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Duration (days)
                    {form.package_type === 'PERENNIAL' && (
                      <span className="text-xs text-slate-400 font-normal ml-2">(fixed at 365 for Perennial)</span>
                    )}
                  </label>
                  <input type="number" min="1" max="365"
                    value={form.duration_days}
                    disabled={form.package_type === 'PERENNIAL'}
                    onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400" />
                  {form.package_type === 'ANNUAL' && (
                    <p className="text-[11px] text-slate-400 mt-1">1 – 365 days.</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description (optional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="What crop stage does this cover?"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); setError('') }}
                  className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={creating}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

export default function GlobalPackagesPage() {
  return (
    <Suspense fallback={<AdminLayout><div className="pt-20 text-center text-slate-400">Loading…</div></AdminLayout>}>
      <GlobalPackagesContent />
    </Suspense>
  )
}
