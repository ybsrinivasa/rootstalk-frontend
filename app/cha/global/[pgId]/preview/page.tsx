'use client'

// Batch 39P-d2 (2026-05-16) — read-only Preview for a Global PG
// Recommendation. The CM views the protocol the way an SE will see
// it when they import: timelines ordered by Days After Detection,
// each timeline's practices with full element detail, relations and
// conditional questions rendered inline.
//
// Simpler than the CCA Package preview because PG content is
// trigger-based (the timer starts when the farmer reports the
// problem) — no crop calendar, no start-date picker, no DBS/DAS
// toggle, no coverage diagram.
//
// Authoring affordances (add / edit / delete) are deliberately
// omitted — preview is strict read.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import type { RelationOut } from '@/components/advisory-authoring/RelationsSection'
import type { CQOut } from '@/components/advisory-authoring/CQsSection'
import {
  PracticeCard, RelationCard, CQCard,
  type PreviewPractice,
} from '@/components/advisory-authoring/PreviewCards'

interface PGRec {
  id: string
  problem_group_cosh_id: string
  area_or_plant: string | null
  status: string
  version: number
}

interface ProblemGroup { cosh_id: string; name_en: string }

interface PGTimeline {
  id: string
  pg_recommendation_id: string
  name: string
  from_type: string
  from_value: number
  to_value: number
  practices?: PreviewPractice[]
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
}

const AREA_PLANT_LABEL: Record<string, string> = {
  AREA_WISE: 'Area-wise',
  PLANT_WISE: 'Plant-wise',
}

function formatPGTimelineRange(tl: PGTimeline): string {
  // PG timelines anchor on DAYS_AFTER_DETECTION (or DAYS_AFTER_RESPONSE
  // for QA, when that pipe gets its preview). Either way the unit is
  // plain "Day N".
  return `Day ${tl.from_value} → ${tl.to_value}`
}

export default function GlobalPGPreviewPage() {
  const { pgId } = useParams<{ pgId: string }>()

  const [pg, setPg] = useState<PGRec | null>(null)
  const [pgName, setPgName] = useState('')
  const [timelines, setTimelines] = useState<PGTimeline[]>([])
  const [relationsByTl, setRelationsByTl] = useState<Record<string, RelationOut[]>>({})
  const [cqsByTl, setCqsByTl] = useState<Record<string, CQOut[]>>({})
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!pgId) return
    let cancelled = false
    Promise.all([
      api.get<PGRec>(`/advisory/global/pg-recommendations/${pgId}`),
      api.get<PGTimeline[]>(`/advisory/global/pg-recommendations/${pgId}/timelines`),
      api.get<ProblemGroup[]>('/advisory/global/problem-groups'),
    ]).then(async ([pgRes, tlRes, pgsRes]) => {
      if (cancelled) return
      setPg(pgRes.data)
      setTimelines(tlRes.data)
      const match = pgsRes.data.find(p => p.cosh_id === pgRes.data.problem_group_cosh_id)
      if (match) setPgName(match.name_en)

      // Walk timelines in parallel to fetch each one's relations + CQs.
      const tasks = tlRes.data.flatMap(tl => [
        api.get<RelationOut[]>(`/advisory/global/pg-recommendations/${pgId}/timelines/${tl.id}/relations`)
          .then(r => [tl.id, 'rel', r.data] as const)
          .catch(() => [tl.id, 'rel', [] as RelationOut[]] as const),
        api.get<CQOut[]>(`/advisory/global/pg-recommendations/${pgId}/timelines/${tl.id}/conditional-questions`)
          .then(r => [tl.id, 'cq', r.data] as const)
          .catch(() => [tl.id, 'cq', [] as CQOut[]] as const),
      ])
      const results = await Promise.all(tasks)
      if (cancelled) return
      const rels: Record<string, RelationOut[]> = {}
      const cqs: Record<string, CQOut[]> = {}
      for (const [tlid, kind, data] of results) {
        if (kind === 'rel') rels[tlid] = data as RelationOut[]
        else cqs[tlid] = data as CQOut[]
      }
      setRelationsByTl(rels)
      setCqsByTl(cqs)
    }).catch(() => {
      if (!cancelled) setLoadError('Failed to load preview.')
    })
    return () => { cancelled = true }
  }, [pgId])

  if (loadError) {
    return (
      <AdminLayout>
        <div className="max-w-3xl">
          <p className="text-sm text-red-600">{loadError}</p>
          <Link href={`/cha/global/${pgId}`} className="text-sm text-blue-600 hover:underline mt-3 inline-block">
            ← Back to editor
          </Link>
        </div>
      </AdminLayout>
    )
  }

  if (!pg) {
    return (
      <AdminLayout>
        <p className="text-sm text-slate-400">Loading…</p>
      </AdminLayout>
    )
  }

  const sortedTimelines = [...timelines].sort(
    (a, b) => a.from_value - b.from_value || a.to_value - b.to_value,
  )

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        <div>
          <Link href={`/cha/global/${pgId}`} className="text-xs text-slate-500 hover:text-slate-700">
            ← Back to editor
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">
                {pgName || pg.problem_group_cosh_id}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">PREVIEW</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOUR[pg.status] || 'bg-slate-100 text-slate-600'}`}>
                {pg.status}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white">
                v{pg.version}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              {AREA_PLANT_LABEL[pg.area_or_plant || ''] || '—'} · Trigger: Days after problem detection
            </p>
          </div>
        </div>

        {/* Read-only framing */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-900">
          <strong>Preview</strong> — how an SE will see this PG Recommendation when they import it.
          Edits are made from the editor.
        </div>

        {/* Timelines */}
        {sortedTimelines.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-200">
            <p className="text-slate-500 text-sm">No timelines on this PG yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedTimelines.map(tl => {
              const tlPractices = tl.practices || []
              const tlRelations = relationsByTl[tl.id] || []
              const tlCQs = cqsByTl[tl.id] || []
              const label = `${tl.name} · ${formatPGTimelineRange(tl)}`
              // Practices already inside a Relation render inside their
              // RelationCard; only "loose" practices render standalone.
              const inRelation = new Set<string>()
              for (const r of tlRelations) {
                for (const part of r.parts) for (const opt of part) for (const pid of opt) {
                  inRelation.add(pid)
                }
              }
              const loosePractices = tlPractices.filter(p => !inRelation.has(p.id))
              return (
                <section key={tl.id} className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-slate-700">{tl.name}</h2>
                    <span className="text-xs text-slate-500">{formatPGTimelineRange(tl)}</span>
                  </div>
                  {loosePractices.length === 0 && tlRelations.length === 0 && tlCQs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No practices, relations, or conditional questions on this timeline.</p>
                  ) : (
                    <div className="space-y-2">
                      {loosePractices.map(p => (
                        <PracticeCard key={p.id} practice={p} timelineLabel={label} />
                      ))}
                      {tlRelations.map(r => (
                        <RelationCard key={r.id} rel={r} practices={tlPractices} timelineLabel={label} />
                      ))}
                      {tlCQs.map(cq => (
                        <CQCard key={cq.id} cq={cq} practices={tlPractices}
                          relations={tlRelations} timelineLabel={label} />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
