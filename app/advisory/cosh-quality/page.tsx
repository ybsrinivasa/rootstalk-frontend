'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

// Batch 39D-report (2026-05-15) — SA-facing audit of Cosh-side data
// gaps under each L2's completeness spec. Lets the SA see which Common
// Names have at least one fully-populated Trade Name and which need
// fixing on the Cosh side.

interface TNDetail {
  cosh_id: string
  name: string
  missing: string[]  // connect names: 'manufacturer', 'formulation', 'ai'
}
interface CNDetail {
  cosh_id: string
  name: string
  trade_names: TNDetail[]
  has_complete_tn: boolean
  no_trade_names: boolean
}
interface Report {
  l2_type: string
  applicable: boolean
  required: string[]
  common_names: CNDetail[]
}

// L2s in the backend's L2_COMPLETENESS_REQUIREMENTS spec, plus the
// two NPK-dosage L2s (which surface as 'not applicable' so the SA
// can see they're outside the filter).
const L2_OPTIONS: { id: string; label: string }[] = [
  { id: 'CHEMICAL_PESTICIDES',                       label: 'Chemical Pesticides' },
  { id: 'CHEMICAL_HERBICIDES',                       label: 'Chemical Herbicides' },
  { id: 'MICROBIAL_PESTICIDES',                      label: 'Microbial Pesticides' },
  { id: 'BOTANICAL_PESTICIDES',                      label: 'Botanical Pesticides' },
  { id: 'INSECT_BIOCONTROL_AGENTS',                  label: 'Insect Biocontrol Agents' },
  { id: 'INSECT_TRAPS',                              label: 'Insect Traps' },
  { id: 'OTHER_PESTICIDES',                          label: 'Other Pesticides' },
  { id: 'ADJUVANTS',                                 label: 'Adjuvants' },
  { id: 'MANURES',                                   label: 'Manures' },
  { id: 'CHEMICAL_FERTILIZER_PRODUCTS',              label: 'Chemical Fertilizer Products' },
  { id: 'CHEMICAL_FERTILIZER_FERTIGATION_PRODUCTS',  label: 'Fertigation Products' },
  { id: 'BIOFERTILIZERS',                            label: 'Biofertilizers' },
  { id: 'PGR_TONICS',                                label: 'PGR / Hormones / Stimulants' },
  { id: 'SOIL_AMENDMENTS',                           label: 'Soil Amendments' },
  { id: 'CHEMICAL_FERTILIZERS_NPK_DOSAGES',          label: 'Chemical Fertilizer NPK Dosages' },
  { id: 'FERTIGATION_NPK_DOSAGES',                   label: 'Fertigation NPK Dosages' },
]

const CONNECT_LABEL: Record<string, string> = {
  manufacturer: 'Manufacturer',
  formulation:  'Formulation',
  ai:           'A.I.',
}

export default function CoshDataQualityPage() {
  const [l2, setL2] = useState('CHEMICAL_PESTICIDES')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    api.get<Report>(`/cosh/options/incomplete-report?l2=${encodeURIComponent(l2)}`)
      .then(r => setReport(r.data))
      .finally(() => setLoading(false))
  }, [l2])

  const cns = (() => {
    if (!report) return []
    const lower = filter.trim().toLowerCase()
    if (!lower) return report.common_names
    return report.common_names.filter(c => c.name.toLowerCase().includes(lower))
  })()

  // Per-L2 totals — gives the SA a top-line picture before they drill
  // into the per-CN list.
  const totals = (() => {
    if (!report) return null
    let complete = 0, partial = 0, blocked = 0, orphan = 0
    for (const cn of report.common_names) {
      if (cn.no_trade_names) orphan++
      else if (!cn.has_complete_tn) blocked++
      else if (cn.trade_names.some(t => t.missing.length > 0)) partial++
      else complete++
    }
    return { complete, partial, blocked, orphan, total: report.common_names.length }
  })()

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cosh Data Quality</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Per-L2 audit of Cosh-side completeness. A Common Name surfaces in authoring only when
            at least one of its Trade Names has every required Cosh connect populated.
          </p>
        </div>
        <Link href="/advisory/global/crops" className="text-xs text-blue-600 hover:underline">
          ← Back to Global CCA
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-700">L2:</label>
          <select value={l2}
            onChange={e => { setL2(e.target.value); setFilter('') }}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[260px]">
            {L2_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter Common Names…"
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {report && report.applicable && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>Required connects:</span>
            {report.required.map(r => (
              <span key={r} className="bg-slate-100 text-slate-700 rounded-full px-2 py-0.5 font-medium">
                {CONNECT_LABEL[r] || r}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">Loading…</div>
      ) : !report ? null : !report.applicable ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-200">
          <p className="text-slate-600 font-medium">No completeness filter for this L2</p>
          <p className="text-slate-400 text-sm mt-1">
            This L2 doesn&apos;t use the Trade-Name flow (or no spec has been set). All Common Names
            and Trade Names surface as-is in authoring.
          </p>
        </div>
      ) : report.common_names.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-200">
          <p className="text-slate-600 font-medium">No Common Names linked to this L2 yet</p>
          <p className="text-slate-400 text-sm mt-1">Cosh hasn&apos;t shipped the commonnames_l2 rows for this L2.</p>
        </div>
      ) : (
        <>
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <SummaryTile label="Complete"          count={totals.complete} total={totals.total} colour="emerald" />
              <SummaryTile label="Partial"           count={totals.partial}  total={totals.total} colour="amber" />
              <SummaryTile label="All TNs broken"    count={totals.blocked}  total={totals.total} colour="red" />
              <SummaryTile label="No Trade Names"    count={totals.orphan}   total={totals.total} colour="slate" />
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
            {cns.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No Common Names match the filter.</div>
            ) : cns.map(cn => <CnRow key={cn.cosh_id} cn={cn} required={report.required} />)}
          </div>
        </>
      )}
    </AdminLayout>
  )
}

function SummaryTile({ label, count, total, colour }: {
  label: string; count: number; total: number; colour: string
}) {
  const bg: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber:   'bg-amber-50 text-amber-700 border-amber-100',
    red:     'bg-red-50 text-red-700 border-red-100',
    slate:   'bg-slate-50 text-slate-600 border-slate-200',
  }
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className={`rounded-xl border p-3 ${bg[colour]}`}>
      <p className="text-xs uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-lg font-bold mt-0.5">{count}<span className="text-xs font-normal opacity-70 ml-1">/ {total} · {pct}%</span></p>
    </div>
  )
}

function CnRow({ cn, required }: { cn: CNDetail; required: string[] }) {
  const status: 'complete' | 'partial' | 'blocked' | 'orphan' =
    cn.no_trade_names ? 'orphan'
    : !cn.has_complete_tn ? 'blocked'
    : cn.trade_names.some(t => t.missing.length > 0) ? 'partial'
    : 'complete'
  const badge: Record<string, string> = {
    complete: 'bg-emerald-100 text-emerald-700',
    partial:  'bg-amber-100 text-amber-700',
    blocked:  'bg-red-100 text-red-700',
    orphan:   'bg-slate-200 text-slate-700',
  }
  const badgeLabel: Record<string, string> = {
    complete: 'OK',
    partial:  'Partial',
    blocked:  'All TNs broken',
    orphan:   'No Trade Names',
  }
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold ${badge[status]}`}>
          {badgeLabel[status]}
        </span>
        <p className="text-sm font-medium text-slate-800 flex-1 min-w-0 truncate">{cn.name}</p>
        <span className="text-[11px] text-slate-400 font-mono shrink-0">{cn.cosh_id}</span>
      </div>
      {cn.trade_names.length > 0 && (
        <div className="mt-2 ml-1 space-y-1">
          {cn.trade_names.map(tn => {
            const isComplete = tn.missing.length === 0
            return (
              <div key={tn.cosh_id} className="flex items-start gap-2 text-xs">
                <span className={`shrink-0 mt-0.5 inline-block w-1.5 h-1.5 rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-red-400'}`} />
                <span className="text-slate-700 min-w-0 flex-1">{tn.name}</span>
                {isComplete ? (
                  <span className="text-[11px] text-emerald-700 shrink-0">complete</span>
                ) : (
                  <span className="text-[11px] text-red-600 shrink-0">
                    missing: {tn.missing.map(m => CONNECT_LABEL[m] || m).join(', ')}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {cn.no_trade_names && (
        <p className="text-[11px] text-slate-500 italic mt-2 ml-1">
          No Trade Names linked to this Common Name. Add a row in <code>tradename_commonname</code> on the Cosh side.
        </p>
      )}
    </div>
  )
}
