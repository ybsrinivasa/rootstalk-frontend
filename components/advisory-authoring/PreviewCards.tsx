'use client'

// Batch 39P-d2 (2026-05-16) — shared read-only Preview cards.
//
// The Preview surfaces (CCA's `/advisory/global/[id]/preview` and
// CHA-PG's `/cha/global/[pgId]/preview`) render the same authoring
// content in farmer-view shape: Practice cards with full element
// detail, Relation cards walking the 3-D `parts` shape into
// bracketed expressions, Conditional Question cards bundling YES/NO
// attachments. These bits are pure render — no fetches, no state —
// so they're trivially shared via these prop-driven components.
//
// Pipe-specific concerns stay in the calling page:
//   • CCA Preview wraps these with calendar coverage diagrams + a
//     DBS/DAS toggle + start-date picker.
//   • PG Preview wraps them with simpler "Day N after detection"
//     timeline grouping — no calendar, no toggle.
//
// Each card takes the timeline LABEL as a string rather than the
// full Timeline row, so the caller decides how to render the time
// anchor (e.g. CCA's `formatTimelineRange` vs PG's "Day N → M").

import { practiceLabel, humanize, type RelationsPractice, type RelationOut } from './RelationsSection'
import type { CQOut, CQAttachment } from './CQsSection'

const L0_COLOUR: Record<string, string> = {
  INPUT: 'bg-blue-100 text-blue-700', NON_INPUT: 'bg-purple-100 text-purple-700',
  INSTRUCTION: 'bg-amber-100 text-amber-700', MEDIA: 'bg-pink-100 text-pink-700',
}

// Practice with elements (the Preview-specific shape; element
// labels are server-resolved into `display_value`).
export interface PreviewElement {
  element_type: string
  label?: string
  cosh_ref?: string | null
  // Nullable but defined — matches the RelationsPractice.elements
  // shape so the Preview-flavoured Practice type still satisfies
  // the Relations chain-builder's prop contract.
  value: string | null
  unit_cosh_id?: string | null
  display_value?: string | null
  display_order?: number
}

export interface PreviewPractice extends RelationsPractice {
  is_brand_locked?: boolean
  relation_id?: string | null
  elements?: PreviewElement[]
}

// ── Labellers ─────────────────────────────────────────────────────────

/** Distinguishing label for the practice row — surfaces each L0's
 *  most identity-bearing attribute so two practices of the same L2
 *  look different at a glance. */
export function practiceShortLabel(p: PreviewPractice): string {
  if (!p.l2_type) return 'No sub-type'
  const l2Human = humanize(p.l2_type)
  if (p.l0_type === 'INPUT') return practiceLabel(p)
  if (p.l0_type === 'INSTRUCTION' || p.l0_type === 'MEDIA') {
    const title = p.elements?.find(e => e.element_type === 'TITLE')
    const t = title?.display_value || title?.value
    return t ? `${l2Human} • ${t}` : l2Human
  }
  // NON_INPUT — walk elements, pick first non-INSTRUCTIONS value,
  // append the adjacent *_UNIT field if present.
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

// ── Element detail list ──────────────────────────────────────────────

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

function HyperlinkPreviewMini({ url }: { url: string }) {
  const yt = isYouTube(url)
  if (yt) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-2 border border-slate-200 rounded-lg overflow-hidden hover:border-blue-400 max-w-xs">
        <div className="relative w-20 aspect-video bg-slate-100 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://img.youtube.com/vi/${yt.id}/hqdefault.jpg`} alt="" className="w-full h-full object-cover" />
        </div>
        <span className="text-[11px] text-slate-600 pr-2 truncate">YouTube</span>
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{url}</a>
  )
}

export function ElementDetailList({ elements }: { elements: PreviewElement[] }) {
  return (
    <div className="mt-2 space-y-1 pl-1 border-l-2 border-slate-100">
      {elements.map(el => {
        const url = el.value || ''
        const isImg = el.element_type === 'UPLOAD_IMAGE' && url
        const isAud = el.element_type === 'UPLOAD_AUDIO' && url
        const isLnk = el.element_type === 'HYPERLINK' && url
        return (
          <div key={el.element_type} className={isImg || isAud || isLnk ? 'flex items-start gap-2 text-xs pl-2' : 'flex items-baseline gap-2 text-xs pl-2'}>
            <span className="text-slate-500 min-w-[140px] shrink-0">{el.label || el.element_type}:</span>
            <span className="text-slate-800 font-medium min-w-0 break-words">
              {isImg ? (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="max-h-24 rounded border border-slate-200" />
                </a>
              ) : isAud ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio controls src={url} className="max-w-xs" />
              ) : isLnk ? (
                <HyperlinkPreviewMini url={url} />
              ) : (
                el.display_value || <span className="text-slate-300 italic">—</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Practice card ────────────────────────────────────────────────────

export function PracticeCard({
  practice, timelineLabel,
}: { practice: PreviewPractice; timelineLabel: string }) {
  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${L0_COLOUR[practice.l0_type] || 'bg-slate-100'}`}>
          {practice.l0_type}
        </span>
        <span className="text-sm font-medium text-slate-800 break-words">{practiceShortLabel(practice)}</span>
        {practice.is_special_input && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">special</span>}
        {practice.is_brand_locked && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">🔒 locked</span>}
        <span className="ml-auto text-[11px] text-slate-400">{timelineLabel}</span>
      </div>
      {practice.elements && practice.elements.length > 0 && (
        <ElementDetailList elements={practice.elements} />
      )}
    </div>
  )
}

// ── Relation card ────────────────────────────────────────────────────

export function RelationCard({
  rel, practices, timelineLabel,
}: {
  rel: RelationOut
  practices: PreviewPractice[]
  timelineLabel: string
}) {
  const findP = (pid: string) => practices.find(p => p.id === pid) || null
  const typeColour =
    rel.relation_type === 'AND' ? 'bg-blue-100 text-blue-700' :
    rel.relation_type === 'OR'  ? 'bg-amber-100 text-amber-700' :
                                  'bg-purple-100 text-purple-700'
  const renderExpression = (): string => {
    const labelFor = (pid: string) => {
      const p = findP(pid)
      return p ? practiceLabel(p) : pid.slice(0, 8)
    }
    const partTexts: string[] = []
    for (const part of rel.parts) {
      const optTexts: string[] = []
      for (const opt of part) {
        if (opt.length === 0) continue
        optTexts.push(opt.length === 1 ? labelFor(opt[0]) : '(' + opt.map(labelFor).join(' + ') + ')')
      }
      if (optTexts.length === 0) continue
      partTexts.push(optTexts.length === 1 ? optTexts[0] : optTexts.join(' or '))
    }
    return rel.expression || partTexts.join(rel.relation_type === 'OR' ? ' or ' : ' + ')
  }
  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/40">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${typeColour}`}>{rel.relation_type}</span>
        <span className="text-sm font-medium text-slate-800 break-words flex-1 min-w-0">{renderExpression()}</span>
        <span className="text-[11px] text-slate-400">{timelineLabel}</span>
      </div>
      <div className="space-y-2 ml-1 border-l-2 border-slate-200 pl-3">
        {rel.parts.map((part, pIdx) => (
          <div key={pIdx} className="space-y-1">
            {pIdx > 0 && rel.relation_type !== 'OR' && (
              <div className="text-[10px] uppercase tracking-wider text-blue-600 font-semibold">AND</div>
            )}
            {part.map((opt, oIdx) => (
              <div key={oIdx}>
                {oIdx > 0 && (
                  <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">OR</div>
                )}
                {opt.map(pid => {
                  const p = findP(pid)
                  if (!p) return null
                  return (
                    <PracticeCard key={pid} practice={p} timelineLabel={timelineLabel} />
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Conditional Question card ────────────────────────────────────────

export function CQCard({
  cq, practices, relations, timelineLabel,
}: {
  cq: CQOut
  practices: PreviewPractice[]
  relations: RelationOut[]
  timelineLabel: string
}) {
  const renderSide = (side: CQAttachment | null) => {
    if (!side) return <span className="text-slate-400 italic text-xs">—</span>
    if (side.kind === 'practice') {
      const p = practices.find(x => x.id === side.id)
      if (!p) return <span className="text-slate-400 italic text-xs">—</span>
      return <PracticeCard practice={p} timelineLabel={timelineLabel} />
    }
    const r = relations.find(x => x.id === side.id)
    if (!r) return <span className="text-slate-400 italic text-xs">—</span>
    return <RelationCard rel={r} practices={practices} timelineLabel={timelineLabel} />
  }
  return (
    <div className="border border-purple-200 rounded-xl p-3 bg-purple-50/30">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-[10px] uppercase tracking-wider text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded font-semibold">IF</span>
        <span className="text-sm font-medium text-slate-800 break-words flex-1 min-w-0">{cq.question_text}</span>
        <span className="text-[11px] text-slate-400">{timelineLabel}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-emerald-800 bg-emerald-100 inline-block px-1.5 py-0.5 rounded font-semibold mb-1.5">YES</p>
          {renderSide(cq.yes)}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-rose-800 bg-rose-100 inline-block px-1.5 py-0.5 rounded font-semibold mb-1.5">NO</p>
          {renderSide(cq.no)}
        </div>
      </div>
    </div>
  )
}
