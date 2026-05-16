'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import {
  PracticeCard, RelationCard, CQCard,
  type PreviewPractice,
} from '@/components/advisory-authoring/PreviewCards'

// Batch 39J (2026-05-16) — read-only Package Preview. The SE views
// the package the way a farmer would, with practices ordered by
// time, full element detail on every card, and a coverage diagram
// that surfaces gaps in the advisory window.
//
// Authoring affordances (add/edit/delete) deliberately omitted —
// preview is strict read.

interface Package {
  id: string; name: string; crop_cosh_id: string
  package_type: string; status: string; duration_days: number
  version: number; description: string | null; created_at: string
  start_date_label_cosh_id: string | null
}
interface Timeline {
  id: string; name: string; from_type: string; from_value: number; to_value: number; display_order: number
  status?: string
}
interface PracticeElement {
  element_type: string
  label: string
  cosh_ref: string | null
  value: string | null
  unit_cosh_id: string | null
  display_value: string | null
  display_order: number
}
interface Practice {
  id: string
  l0_type: string; l1_type: string | null; l2_type: string | null
  display_order: number
  is_special_input: boolean
  is_brand_locked?: boolean
  relation_id?: string | null
  elements?: PracticeElement[]
}
interface RelationOut {
  id: string
  relation_type: 'AND' | 'OR' | 'IF'
  expression: string | null
  parts: string[][][]
  conditional: { question_id: string; question_text: string | null; answer: 'YES' | 'NO' | 'BOTH' } | null
}
interface CQAttachment { kind: 'practice' | 'relation'; id: string }
interface CQOut {
  id: string; timeline_id: string; question_text: string; display_order: number
  yes: CQAttachment | null; no: CQAttachment | null
}

const L0_COLOUR: Record<string, string> = {
  INPUT: 'bg-blue-100 text-blue-700', NON_INPUT: 'bg-purple-100 text-purple-700',
  INSTRUCTION: 'bg-amber-100 text-amber-700', MEDIA: 'bg-pink-100 text-pink-700',
}
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const MONTH_OFFSETS = MONTH_DAYS.reduce<number[]>((acc, d, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + MONTH_DAYS[i - 1]); return acc
}, [])
function shortMonthDay(doy: number): string {
  if (doy < 1) doy = 1
  if (doy > 365) doy = 365
  let m = 0
  while (m < 11 && MONTH_OFFSETS[m + 1] < doy) m++
  return `${MONTH_NAMES[m].slice(0, 3)} ${doy - MONTH_OFFSETS[m]}`
}
function dateToDoy(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}
function humanize(s: string): string {
  return s.toLowerCase().split('_').map(w => (w[0]?.toUpperCase() || '') + w.slice(1)).join(' ')
}
function practiceLabel(p: Practice): string {
  const tokens: string[] = []
  if (p.l2_type) tokens.push(humanize(p.l2_type))
  const cn = p.elements?.find(e => e.element_type === 'COMMON_NAME')
  if (cn?.display_value) tokens.push(cn.display_value)
  const bn = p.elements?.find(e => e.element_type === 'BRAND_NAME')
  if (bn?.display_value) tokens.push(bn.display_value)
  return tokens.length > 0 ? tokens.join(' • ') : p.l0_type
}
function practiceShortLabel(p: Practice): string {
  if (!p.l2_type) return 'No sub-type'
  const l2Human = humanize(p.l2_type)
  if (p.l0_type === 'INPUT') return practiceLabel(p)
  if (p.l0_type === 'INSTRUCTION' || p.l0_type === 'MEDIA') {
    const title = p.elements?.find(e => e.element_type === 'TITLE')
    const t = title?.display_value || title?.value
    return t ? `${l2Human} • ${t}` : l2Human
  }
  const els = p.elements || []
  for (let i = 0; i < els.length; i++) {
    const e = els[i]
    if (e.element_type === 'INSTRUCTIONS') continue
    const v = e.display_value || e.value
    if (!v) continue
    const next = els[i + 1]
    if (next && next.element_type.endsWith('_UNIT')) {
      const u = next.display_value || next.value
      if (u) return `${l2Human} • ${v} ${u}`
    }
    return `${l2Human} • ${v}`
  }
  return l2Human
}
function formatTimelineRange(tl: Pick<Timeline, 'from_type' | 'from_value' | 'to_value'>): string {
  if (tl.from_type === 'CALENDAR') return `${shortMonthDay(tl.from_value)} → ${shortMonthDay(tl.to_value)}`
  return `Day ${tl.from_value} → ${tl.to_value}`
}

// Detect URL value content for media-style elements.
function isYouTube(url: string): { id: string } | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      return id && /^[A-Za-z0-9_-]{6,15}$/.test(id) ? { id } : null
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v && /^[A-Za-z0-9_-]{6,15}$/.test(v)) return { id: v }
      const m = u.pathname.match(/^\/(embed|shorts)\/([^/?#]+)/)
      if (m && /^[A-Za-z0-9_-]{6,15}$/.test(m[2])) return { id: m[2] }
    }
  } catch { /* not a URL */ }
  return null
}

// Compute when (Date) a given timeline begins under the picked start date.
function timelineScheduledStart(tl: Timeline, startDate: Date, packageType: string): Date {
  const d = new Date(startDate)
  if (tl.from_type === 'DAS') {
    d.setDate(d.getDate() + tl.from_value)
  } else if (tl.from_type === 'DBS') {
    d.setDate(d.getDate() - tl.from_value)
  } else if (tl.from_type === 'CALENDAR') {
    // Anchor to picked year. If the timeline's start DOY is before the
    // picked start's DOY (perennial), wrap to next year.
    const targetYear = startDate.getFullYear()
    const startDoy = dateToDoy(startDate)
    const baseYear = tl.from_value < startDoy ? targetYear + 1 : targetYear
    d.setFullYear(baseYear, 0, tl.from_value)
  }
  return d
}

export default function PackagePreviewPage() {
  const { id } = useParams<{ id: string }>()
  const [pkg, setPkg] = useState<Package | null>(null)
  const [timelines, setTimelines] = useState<Timeline[]>([])
  const [practicesByTl, setPracticesByTl] = useState<Record<string, Practice[]>>({})
  const [relationsByTl, setRelationsByTl] = useState<Record<string, RelationOut[]>>({})
  const [cqsByTl, setCqsByTl] = useState<Record<string, CQOut[]>>({})
  const [loading, setLoading] = useState(true)

  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [viewMode, setViewMode] = useState<'ALL' | 'DBS' | 'DAS'>('ALL')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [pkgRes, tlsRes] = await Promise.all([
          api.get<Package>(`/advisory/global/packages/${id}`),
          api.get<Timeline[]>(`/advisory/global/packages/${id}/timelines`),
        ])
        setPkg(pkgRes.data)
        const tls = tlsRes.data
        setTimelines(tls)
        const [practiceResps, relationResps, cqResps] = await Promise.all([
          Promise.all(tls.map(tl => api.get<Practice[]>(`/advisory/global/packages/${id}/timelines/${tl.id}/practices`))),
          Promise.all(tls.map(tl => api.get<RelationOut[]>(`/advisory/global/packages/${id}/timelines/${tl.id}/relations`))),
          Promise.all(tls.map(tl => api.get<CQOut[]>(`/advisory/global/packages/${id}/timelines/${tl.id}/conditional-questions`))),
        ])
        const pm: Record<string, Practice[]> = {}
        const rm: Record<string, RelationOut[]> = {}
        const cm: Record<string, CQOut[]> = {}
        tls.forEach((tl, i) => {
          pm[tl.id] = practiceResps[i].data
          rm[tl.id] = relationResps[i].data
          cm[tl.id] = cqResps[i].data
        })
        setPracticesByTl(pm)
        setRelationsByTl(rm)
        setCqsByTl(cm)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const isPerennial = pkg?.package_type === 'PERENNIAL'
  const startDateObj = useMemo(() => new Date(startDate + 'T00:00:00'), [startDate])

  // Timelines filtered by viewMode (Annual only). Then ordered by their
  // scheduled start.
  const orderedTimelines = useMemo(() => {
    if (!pkg) return [] as Timeline[]
    let tls = timelines.filter(t => t.status !== 'INACTIVE')
    if (!isPerennial && viewMode !== 'ALL') {
      tls = tls.filter(t => t.from_type === viewMode)
    }
    return tls.slice().sort((a, b) => {
      const da = timelineScheduledStart(a, startDateObj, pkg.package_type).getTime()
      const db = timelineScheduledStart(b, startDateObj, pkg.package_type).getTime()
      return da - db
    })
  }, [timelines, viewMode, pkg, startDateObj, isPerennial])

  // Practices referenced inside a Relation — rendered as part of the
  // Relation card, not as their own practice card.
  const practiceIdsInRelation = useMemo(() => {
    const out = new Set<string>()
    for (const rels of Object.values(relationsByTl)) {
      for (const rel of rels) {
        for (const part of rel.parts) for (const opt of part) for (const pid of opt) out.add(pid)
      }
    }
    return out
  }, [relationsByTl])

  // Practices bound to a CQ side (Path B) — surfaced inside the CQ
  // card, not as their own practice card.
  const practiceIdsInCQ = useMemo(() => {
    const out = new Set<string>()
    for (const cqs of Object.values(cqsByTl)) {
      for (const cq of cqs) {
        if (cq.yes?.kind === 'practice') out.add(cq.yes.id)
        if (cq.no?.kind === 'practice') out.add(cq.no.id)
      }
    }
    return out
  }, [cqsByTl])

  // Relations bound to a CQ side (Path A) — same.
  const relationIdsInCQ = useMemo(() => {
    const out = new Set<string>()
    for (const cqs of Object.values(cqsByTl)) {
      for (const cq of cqs) {
        if (cq.yes?.kind === 'relation') out.add(cq.yes.id)
        if (cq.no?.kind === 'relation') out.add(cq.no.id)
      }
    }
    return out
  }, [cqsByTl])

  if (loading || !pkg) {
    return (
      <AdminLayout>
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">Loading preview…</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Package Preview</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Read-only farmer-order view. Pick a start date to anchor the timeline.
          </p>
        </div>
        <Link href={`/advisory/global/${id}`} className="text-xs font-medium text-blue-600 hover:underline">
          ← Back to authoring
        </Link>
      </div>

      {/* Package header */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">{pkg.package_type}</p>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5 break-words">{pkg.name}</h2>
            <p className="text-xs text-slate-500 mt-1">
              Crop: <span className="font-mono text-slate-700">{pkg.crop_cosh_id}</span>
              {' · '}{pkg.duration_days} days{' · '}v{pkg.version}{' · '}{pkg.status}
            </p>
            {pkg.description && (
              <p className="text-sm text-slate-600 mt-2 max-w-2xl break-words">{pkg.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Controls — start date + view mode */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-4 flex items-center flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700">Start date:</span>
          <input type="date" value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-[11px] text-slate-400">
            {isPerennial
              ? "anchor the calendar to this date"
              : "treated as the sowing date"}
          </span>
        </label>
        {!isPerennial && (
          <div className="flex items-center gap-1 text-sm">
            <span className="font-medium text-slate-700 mr-2">View:</span>
            {(['ALL', 'DBS', 'DAS'] as const).map(m => (
              <button key={m} type="button"
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  viewMode === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Coverage diagram */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4">
        <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
          Coverage {isPerennial ? '· 12-month ring' : '· timeline span'}
        </h3>
        {isPerennial ? (
          <PerennialCoverageRing timelines={timelines} startDate={startDateObj} />
        ) : (
          <AnnualCoverageBar timelines={timelines} duration={pkg.duration_days} viewMode={viewMode} />
        )}
      </div>

      {/* Practice list */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
          Practices in farmer order
        </h3>
        {orderedTimelines.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No timelines match the current view.</p>
        ) : (
          <div className="space-y-5">
            {orderedTimelines.map(tl => {
              const tlSchedStart = timelineScheduledStart(tl, startDateObj, pkg.package_type)
              const tlSchedEnd = (() => {
                const e = new Date(tlSchedStart)
                e.setDate(e.getDate() + Math.abs(tl.to_value - tl.from_value))
                return e
              })()
              const practices = practicesByTl[tl.id] || []
              const relations = relationsByTl[tl.id] || []
              const cqs = cqsByTl[tl.id] || []
              const standalonePractices = practices.filter(
                p => !practiceIdsInRelation.has(p.id) && !practiceIdsInCQ.has(p.id)
              )
              const standaloneRelations = relations.filter(r => !relationIdsInCQ.has(r.id))
              const hasContent = standalonePractices.length + standaloneRelations.length + cqs.length > 0
              if (!hasContent) return null
              return (
                <div key={tl.id}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-xs uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-semibold">
                      {tl.from_type}
                    </span>
                    <h4 className="text-sm font-semibold text-slate-800">{tl.name}</h4>
                    <span className="text-[11px] text-slate-400">
                      {formatTimelineRange(tl)}
                      {' · '}{tlSchedStart.toLocaleDateString()}{' → '}{tlSchedEnd.toLocaleDateString()}
                    </span>
                  </div>
                  <div className="space-y-2 ml-1">
                    {(() => {
                      const tlLabel = `${tl.name} · ${formatTimelineRange(tl)}`
                      const tlPractices = (practicesByTl[tl.id] || []) as PreviewPractice[]
                      const tlRelations = relationsByTl[tl.id] || []
                      return (
                        <>
                          {standaloneRelations.map(rel => (
                            <RelationCard key={rel.id} rel={rel}
                              practices={tlPractices} timelineLabel={tlLabel} />
                          ))}
                          {standalonePractices.map(p => (
                            <PracticeCard key={p.id} practice={p as PreviewPractice}
                              timelineLabel={tlLabel} />
                          ))}
                          {cqs.map(cq => (
                            <CQCard key={cq.id} cq={cq}
                              practices={tlPractices}
                              relations={tlRelations}
                              timelineLabel={tlLabel} />
                          ))}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

// ── Annual coverage bar ───────────────────────────────────────────────────
function AnnualCoverageBar({ timelines, duration, viewMode }: {
  timelines: Timeline[]; duration: number; viewMode: 'ALL' | 'DBS' | 'DAS'
}) {
  // X-axis: leftmost = -maxDBS, rightmost = duration_days. 0 marks sowing.
  let maxDbs = 0
  for (const t of timelines) {
    if (t.status === 'INACTIVE') continue
    if (t.from_type === 'DBS' && t.from_value > maxDbs) maxDbs = t.from_value
  }
  const xMin = -maxDbs
  const xMax = duration
  const span = xMax - xMin || 1
  const W = 100  // percentage-based; SVG viewBox makes the scaling math trivial
  const dayToPct = (d: number) => ((d - xMin) / span) * W
  const visibleTimelines = timelines.filter(t => {
    if (t.status === 'INACTIVE') return false
    if (viewMode === 'ALL') return true
    return t.from_type === viewMode
  })
  // For coverage / gap calc, project each visible timeline to [start, end]
  // on the same number line.
  type Seg = { start: number; end: number; tl: Timeline }
  const segments: Seg[] = visibleTimelines.map(t => {
    if (t.from_type === 'DBS') {
      // DBS: from_value > to_value; left edge = -from_value, right edge = -to_value.
      return { start: -t.from_value, end: -t.to_value, tl: t }
    }
    // DAS: left = from_value, right = to_value.
    return { start: t.from_value, end: t.to_value, tl: t }
  }).sort((a, b) => a.start - b.start)
  return (
    <div>
      {/* SVG bar */}
      <svg viewBox={`0 0 ${W} 16`} className="w-full h-12" preserveAspectRatio="none">
        {/* Background (gaps) */}
        <rect x={0} y={5} width={W} height={6} fill="#e2e8f0" />
        {/* Timeline blocks */}
        {segments.map((s, i) => {
          const x = dayToPct(s.start)
          const w = Math.max(0.3, dayToPct(s.end) - x)
          const isDbs = s.tl.from_type === 'DBS'
          return (
            <g key={s.tl.id}>
              <rect x={x} y={5} width={w} height={6} fill={isDbs ? '#a78bfa' : '#60a5fa'} />
            </g>
          )
        })}
        {/* Sowing tick at 0 */}
        <line x1={dayToPct(0)} y1={2} x2={dayToPct(0)} y2={14} stroke="#0f172a" strokeWidth={0.3} />
      </svg>
      {/* Tick labels */}
      <div className="flex justify-between text-[11px] text-slate-500 mt-1 font-mono">
        <span>{xMin === 0 ? '0' : `−${maxDbs}`} DBS</span>
        <span>0 · sowing</span>
        <span>{duration} DAS</span>
      </div>
      <div className="flex gap-4 mt-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-2 bg-blue-400 rounded-sm" /> DAS</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-2 bg-violet-400 rounded-sm" /> DBS</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-2 bg-slate-300 rounded-sm" /> uncovered</span>
      </div>
    </div>
  )
}

// ── Perennial coverage ring ──────────────────────────────────────────────
function PerennialCoverageRing({ timelines, startDate }: {
  timelines: Timeline[]; startDate: Date
}) {
  const cx = 130, cy = 130, rOuter = 110, rInner = 78
  // For each timeline, build an arc path from from_value DOY to to_value DOY.
  const doyToAngle = (doy: number) => ((doy - 1) / 365) * 2 * Math.PI - Math.PI / 2  // start at 12 o'clock
  function arcPath(fromDoy: number, toDoy: number): string {
    let a0 = doyToAngle(fromDoy), a1 = doyToAngle(toDoy)
    if (a1 < a0) a1 += 2 * Math.PI
    const x0 = cx + rOuter * Math.cos(a0), y0 = cy + rOuter * Math.sin(a0)
    const x1 = cx + rOuter * Math.cos(a1), y1 = cy + rOuter * Math.sin(a1)
    const ix1 = cx + rInner * Math.cos(a1), iy1 = cy + rInner * Math.sin(a1)
    const ix0 = cx + rInner * Math.cos(a0), iy0 = cy + rInner * Math.sin(a0)
    const largeArc = (a1 - a0) > Math.PI ? 1 : 0
    return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${rInner} ${rInner} 0 ${largeArc} 0 ${ix0} ${iy0} Z`
  }
  const calendarTls = timelines.filter(t => t.status !== 'INACTIVE' && t.from_type === 'CALENDAR')
  const startDoy = dateToDoy(startDate)
  const startAngle = doyToAngle(startDoy)
  const monthMarkers = MONTH_NAMES.map((name, i) => {
    const doy = MONTH_OFFSETS[i] + 1
    const angle = doyToAngle(doy)
    const tx = cx + (rOuter + 14) * Math.cos(angle)
    const ty = cy + (rOuter + 14) * Math.sin(angle)
    return { name: name.slice(0, 3), tx, ty }
  })
  return (
    <div className="flex items-start gap-4">
      <svg viewBox="0 0 260 260" className="w-64 h-64">
        {/* uncovered ring */}
        <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke="#e2e8f0" strokeWidth={rOuter - rInner} />
        {/* covered arcs */}
        {calendarTls.map(t => (
          <path key={t.id} d={arcPath(t.from_value, t.to_value)} fill="#60a5fa" opacity={0.85} />
        ))}
        {/* start-date radial line */}
        <line
          x1={cx + (rInner - 4) * Math.cos(startAngle)}
          y1={cy + (rInner - 4) * Math.sin(startAngle)}
          x2={cx + (rOuter + 4) * Math.cos(startAngle)}
          y2={cy + (rOuter + 4) * Math.sin(startAngle)}
          stroke="#0f172a" strokeWidth={1.5} />
        {/* month markers */}
        {monthMarkers.map(mm => (
          <text key={mm.name} x={mm.tx} y={mm.ty} textAnchor="middle"
            fontSize="9" fill="#64748b" dominantBaseline="middle">
            {mm.name}
          </text>
        ))}
      </svg>
      <div className="flex-1 text-[11px] text-slate-500 space-y-1">
        <p><span className="inline-block w-3 h-3 bg-blue-400 align-middle rounded-sm mr-1" /> covered by a timeline</p>
        <p><span className="inline-block w-3 h-3 bg-slate-200 align-middle rounded-sm mr-1" /> uncovered</p>
        <p>The dark radial line marks today's date — practices to the right of it are upcoming.</p>
      </div>
    </div>
  )
}
