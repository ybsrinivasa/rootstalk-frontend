'use client'

// Batch 39N-b (2026-05-16) — SA-portal push-as-authoring page.
//
// Ram (the CM) lands here from the "↗ Push to clients" modal on
// `/advisory/global/[id]`. He picks Name, Description, Start Date
// Label, Locations, PV signature, and Authors for the client-specific
// PoP. Submit posts to the form-driven push endpoint (Batch 39N-a);
// the structured 422 codes drive field-level error messages so Ram
// can fix and retry without reloading.
//
// Package Type, Duration, and Crop are read-only here — they're
// inherited from the Global Package.

import { useEffect, useState, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface GlobalPackage {
  id: string
  name: string
  crop_cosh_id: string
  package_type: 'ANNUAL' | 'PERENNIAL'
  duration_days: number
  start_date_label_cosh_id: string | null
  description: string | null
}

interface Client {
  id: string
  full_name: string
  short_name: string
  display_name?: string | null
}

interface ClientLocation {
  id: string
  state_cosh_id: string
  district_cosh_id: string
  status: string
}

interface Parameter {
  id: string
  name: string
  crop_cosh_id: string
}

interface Variable {
  id: string
  parameter_id: string
  name: string
  status: string
}

interface PortalUser {
  id: string
  email: string
  name: string | null
  role: string
  status: string
}

// Same hardcoded set as the Global edit/create modals.
const START_DATE_LABELS = [
  { cosh_id: 'label:sowing_date',   name: 'Sowing Date' },
  { cosh_id: 'label:planting_date', name: 'Planting Date' },
  { cosh_id: 'label:pruning_date',  name: 'Pruning Date' },
]

interface StructuredError {
  code?: string
  message?: string
  invalid_locations?: { state_cosh_id: string; district_cosh_id: string }[]
  invalid_parameter_ids?: string[]
  invalid_pairs?: { parameter_id: string; variable_id: string }[]
  invalid_user_ids?: string[]
  conflicts?: {
    sibling_package_id: string
    sibling_package_name: string
    shared_districts: { state_cosh_id: string; district_cosh_id: string }[]
  }[]
  existing_package_id?: string
}

function extractDetail(err: unknown): StructuredError {
  const detail = (err as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail
  if (!detail) return {}
  if (typeof detail === 'string') return { message: detail }
  return detail as StructuredError
}

export default function PushToClientPage() {
  const params = useParams<{ id: string; clientId: string }>()
  const router = useRouter()
  const pkgId = params.id
  const clientId = params.clientId

  const [pkg, setPkg] = useState<GlobalPackage | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [parameters, setParameters] = useState<Parameter[]>([])
  const [variablesByParam, setVariablesByParam] = useState<Record<string, Variable[]>>({})
  const [ses, setSEs] = useState<PortalUser[]>([])
  const [loadError, setLoadError] = useState('')

  // Form state.
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDateLabel, setStartDateLabel] = useState('label:sowing_date')
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])      // location row ids
  const [pvSelections, setPvSelections] = useState<Record<string, string>>({})   // parameter_id → variable_id
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([])           // user ids

  const [submitting, setSubmitting] = useState(false)
  const [errorDetail, setErrorDetail] = useState<StructuredError>({})
  const [success, setSuccess] = useState<GlobalPackage | null>(null)

  // Load top-level data on mount.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get<GlobalPackage>(`/advisory/global/packages/${pkgId}`),
      api.get<Client>(`/admin/clients/${clientId}`),
      api.get<ClientLocation[]>(`/client/${clientId}/locations`),
      api.get<PortalUser[]>(`/client/${clientId}/users`),
    ]).then(([pkgRes, clientRes, locsRes, usersRes]) => {
      if (cancelled) return
      setPkg(pkgRes.data)
      setClient(clientRes.data)
      setLocations(locsRes.data.filter(l => l.status === 'ACTIVE'))
      setSEs(usersRes.data.filter(u =>
        u.role === 'SUBJECT_EXPERT' && u.status === 'ACTIVE'
      ))
      // Pre-fill Name + Description from Global as a starting point —
      // Ram will almost always tweak Name for the client.
      setName(pkgRes.data.name)
      setDescription(pkgRes.data.description || '')
      setStartDateLabel(pkgRes.data.start_date_label_cosh_id || 'label:sowing_date')
    }).catch(() => {
      if (!cancelled) setLoadError('Failed to load. Check that this Global is published and that you have edit rights on this client.')
    })
    return () => { cancelled = true }
  }, [pkgId, clientId])

  // Once pkg loads (we know the crop), fetch parameters + their variables.
  useEffect(() => {
    if (!pkg) return
    let cancelled = false
    api.get<Parameter[]>(`/advisory/global/parameters?crop_cosh_id=${encodeURIComponent(pkg.crop_cosh_id)}`)
      .then(r => {
        if (cancelled) return
        setParameters(r.data)
        // Fetch variables per parameter in parallel.
        Promise.all(r.data.map(p =>
          api.get<Variable[]>(`/advisory/global/parameters/${p.id}/variables`)
            .then(vr => [p.id, vr.data] as const)
            .catch(() => [p.id, [] as Variable[]] as const)
        )).then(pairs => {
          if (cancelled) return
          const map: Record<string, Variable[]> = {}
          for (const [pid, vars] of pairs) map[pid] = vars
          setVariablesByParam(map)
        })
      })
      .catch(() => { if (!cancelled) setParameters([]) })
    return () => { cancelled = true }
  }, [pkg])

  function toggleLocation(locId: string) {
    setSelectedLocations(prev =>
      prev.includes(locId) ? prev.filter(x => x !== locId) : [...prev, locId]
    )
  }

  function toggleAuthor(userId: string) {
    setSelectedAuthors(prev =>
      prev.includes(userId) ? prev.filter(x => x !== userId) : [...prev, userId]
    )
  }

  function setPvFor(paramId: string, varId: string) {
    setPvSelections(prev => {
      const next = { ...prev }
      if (varId) next[paramId] = varId
      else delete next[paramId]
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!pkg || !client) return
    setSubmitting(true); setErrorDetail({})

    const locByIdSet = new Set(selectedLocations)
    const selectedLocRows = locations.filter(l => locByIdSet.has(l.id))
    const pvEntries = Object.entries(pvSelections).filter(([, v]) => v)

    const body = {
      name: name.trim(),
      description: description.trim() || null,
      start_date_label_cosh_id: startDateLabel,
      locations: selectedLocRows.map(l => ({
        state_cosh_id: l.state_cosh_id,
        district_cosh_id: l.district_cosh_id,
      })),
      pv_assignments: pvEntries.map(([pid, vid]) => ({
        parameter_id: pid, variable_id: vid,
      })),
      author_ids: selectedAuthors,
    }

    try {
      const { data } = await api.post<GlobalPackage>(
        `/client/${clientId}/packages/${pkgId}/push`, body,
      )
      setSuccess(data)
    } catch (err: unknown) {
      setErrorDetail(extractDetail(err))
    } finally { setSubmitting(false) }
  }

  if (loadError) {
    return (
      <AdminLayout>
        <div className="max-w-2xl">
          <p className="text-sm text-red-600">{loadError}</p>
          <Link href={`/advisory/global/${pkgId}`}
            className="text-sm text-blue-600 hover:underline mt-3 inline-block">
            ← Back to Global
          </Link>
        </div>
      </AdminLayout>
    )
  }

  if (!pkg || !client) {
    return (
      <AdminLayout>
        <p className="text-sm text-slate-400">Loading…</p>
      </AdminLayout>
    )
  }

  if (success) {
    return (
      <AdminLayout>
        <div className="max-w-2xl space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-green-900">
              Pushed to {client.display_name || client.full_name}
            </h2>
            <p className="text-sm text-green-800 mt-2">
              Their SE will see <span className="font-semibold">{success.name}</span> in
              their CCA Library as a DRAFT. They publish when they're ready
              for legal review and farmer rollout.
            </p>
          </div>
          <Link href={`/advisory/global/${pkgId}`}
            className="text-sm font-semibold text-blue-600 hover:underline">
            ← Back to Global
          </Link>
        </div>
      </AdminLayout>
    )
  }

  const code = errorDetail.code

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <div>
          <Link href={`/advisory/global/${pkgId}`}
            className="text-xs text-slate-500 hover:text-slate-700">
            ← Back to Global
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Push to {client.display_name || client.full_name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Set the client-specific framing for this PoP. Package content
            (timelines, practices, elements) deep-copies from the Global as-is.
          </p>
        </div>

        {/* Inherited-from-Global context strip */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-600 grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Crop</p>
            <p className="font-mono text-slate-700 mt-0.5 truncate" title={pkg.crop_cosh_id}>
              {pkg.crop_cosh_id}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Type</p>
            <p className="text-slate-700 mt-0.5">{pkg.package_type}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Duration</p>
            <p className="text-slate-700 mt-0.5">{pkg.duration_days} days</p>
          </div>
        </div>

        {/* Top-level error message (non-field) */}
        {errorDetail.message && !['duplicate_package_name','location_not_onboarded','custom_pv_not_allowed_on_push','pv_crop_mismatch','invalid_pv_assignment','invalid_author','duplicate_author','pv_conflict_with_sibling','package_already_pushed','global_package_not_published'].includes(code || '') && (
          <p className="text-sm text-red-600">{errorDetail.message}</p>
        )}

        {(code === 'package_already_pushed' || code === 'global_package_not_published') && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-sm font-semibold text-red-900">{errorDetail.message}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1 — Name + Description */}
          <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
            <h2 className="font-semibold text-slate-800 text-sm">Package details</h2>
            <div>
              <label className="text-xs font-medium text-slate-600">Package name *</label>
              <input value={name} onChange={e => setName(e.target.value)} required
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              {code === 'duplicate_package_name' && (
                <p className="text-xs text-red-600 mt-1">{errorDetail.message}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </section>

          {/* Section 2 — Start Date Label */}
          <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h2 className="font-semibold text-slate-800 text-sm">Start date label *</h2>
            <select value={startDateLabel} onChange={e => setStartDateLabel(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
              {START_DATE_LABELS.map(l => (
                <option key={l.cosh_id} value={l.cosh_id}>{l.name}</option>
              ))}
            </select>
          </section>

          {/* Section 3 — Locations */}
          <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h2 className="font-semibold text-slate-800 text-sm">
              Locations <span className="text-slate-400 font-normal">({selectedLocations.length} selected)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Pick from {client.display_name || client.full_name}'s onboarded districts.
            </p>
            {locations.length === 0 ? (
              <p className="text-xs text-amber-700">
                This client hasn't onboarded any locations yet. Ask the client
                admin to add at least one before pushing.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {locations.map(l => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedLocations.includes(l.id)}
                      onChange={() => toggleLocation(l.id)}
                    />
                    <span className="font-mono text-xs text-slate-700">
                      {l.state_cosh_id} / {l.district_cosh_id}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {code === 'location_not_onboarded' && errorDetail.invalid_locations && (
              <p className="text-xs text-red-600">
                {errorDetail.invalid_locations.length} location(s) not on this
                client's onboarded list. Re-load this page after the client
                admin adds them.
              </p>
            )}
          </section>

          {/* Section 4 — PV signature */}
          <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h2 className="font-semibold text-slate-800 text-sm">
              Parameter–variable signature <span className="text-slate-400 font-normal">({Object.values(pvSelections).filter(v => !!v).length} set)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Catalogue parameters only. Custom P-V can be added later by the
              client SE.
            </p>
            {parameters.length === 0 ? (
              <p className="text-xs text-amber-700">No catalogue parameters for this crop.</p>
            ) : (
              <div className="space-y-3">
                {parameters.map(p => (
                  <div key={p.id} className="flex items-center gap-3">
                    <label className="text-sm text-slate-700 w-1/3 truncate" title={p.name}>{p.name}</label>
                    <select value={pvSelections[p.id] || ''}
                      onChange={e => setPvFor(p.id, e.target.value)}
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                      <option value="">— skip —</option>
                      {(variablesByParam[p.id] || [])
                        .filter(v => v.status === 'ACTIVE')
                        .map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
            {(code === 'custom_pv_not_allowed_on_push' || code === 'pv_crop_mismatch' || code === 'invalid_pv_assignment') && (
              <p className="text-xs text-red-600">{errorDetail.message}</p>
            )}
            {code === 'pv_conflict_with_sibling' && errorDetail.conflicts && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-900 space-y-1">
                <p className="font-semibold">This PV signature clashes with an existing package on this client.</p>
                {errorDetail.conflicts.map((c, i) => (
                  <p key={i}>
                    "{c.sibling_package_name}" shares {c.shared_districts.length} district{c.shared_districts.length === 1 ? '' : 's'} with this push. Change either the PVs or the locations and retry.
                  </p>
                ))}
              </div>
            )}
          </section>

          {/* Section 5 — Authors */}
          <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h2 className="font-semibold text-slate-800 text-sm">
              Authors <span className="text-slate-400 font-normal">({selectedAuthors.length} selected)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Subject Experts active on {client.display_name || client.full_name}.
            </p>
            {ses.length === 0 ? (
              <p className="text-xs text-amber-700">
                This client has no active Subject Experts. Ask the client admin
                to add at least one before pushing.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {ses.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedAuthors.includes(s.id)}
                      onChange={() => toggleAuthor(s.id)}
                    />
                    <span className="text-slate-700">{s.name || s.email}</span>
                    <span className="text-xs text-slate-400">({s.email})</span>
                  </label>
                ))}
              </div>
            )}
            {(code === 'invalid_author' || code === 'duplicate_author') && (
              <p className="text-xs text-red-600">{errorDetail.message}</p>
            )}
          </section>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <Link href={`/advisory/global/${pkgId}`}
              className="text-sm font-medium text-slate-600 hover:text-slate-800">
              Cancel
            </Link>
            <button type="submit" disabled={submitting}
              className="text-sm font-semibold text-white bg-blue-600 px-5 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Pushing…' : 'Push to client'}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
