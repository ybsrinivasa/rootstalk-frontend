'use client'
// Neytiri aggregation of coaching student Moment 2 feedback.
// 2026-10-16 — SA + CM only. Backend endpoint: GET /neytiri/coaching-feedback

import { useEffect, useMemo, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'


interface FeedbackContent {
  section1?: Record<string, { mode: string | null; text: string }>
  section2?: {
    compare_to_tech?: string
    comparison?: string | null
    comparison_reason?: string
  }
  section3?: {
    star_rating?: number
    most_valuable?: string
    would_change?: string
    would_recommend?: string | null
  }
}
interface FeedbackRow {
  student_id: string
  student_name: string
  session_id: string
  reference_client_name: string
  coach_name: string
  requested_at: string
  submitted_at: string | null
  content: FeedbackContent | null
}


const COMPARE_LABELS: Record<string, string> = {
  much_worse: 'Much worse',
  worse: 'Worse',
  similar: 'Similar',
  better: 'Better',
  much_better: 'Much better',
}


export default function CoachingFeedbackPage() {
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [minRating, setMinRating] = useState(0)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    api.get<FeedbackRow[]>('/neytiri/coaching-feedback')
      .then(r => setRows(r.data))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      if (q) {
        const hay = [
          r.student_name, r.reference_client_name, r.coach_name,
          r.content?.section3?.most_valuable || '',
          r.content?.section3?.would_change || '',
          r.content?.section2?.compare_to_tech || '',
        ].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (minRating > 0) {
        const rating = r.content?.section3?.star_rating || 0
        if (rating < minRating) return false
      }
      return true
    })
  }, [rows, query, minRating])

  return (
    <AdminLayout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Student Feedback</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Aggregated Moment 2 feedback across all coaching cohorts. Visible to SA and CM only.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input type="text" value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search student / client / coach / text…"
          className="flex-1 min-w-[220px] border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <select value={minRating}
          onChange={e => setMinRating(parseInt(e.target.value, 10))}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value={0}>Any rating</option>
          <option value={1}>1★ or higher</option>
          <option value={2}>2★ or higher</option>
          <option value={3}>3★ or higher</option>
          <option value={4}>4★ or higher</option>
          <option value={5}>5★ only</option>
        </select>
      </div>

      {loading ? (
        <p className="text-center py-12 text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center py-16 text-sm text-slate-400">
          No submitted feedback yet.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filtered.map(r => {
            const rating = r.content?.section3?.star_rating || 0
            const isOpen = open === r.student_id
            return (
              <div key={r.student_id}
                className={`border-b border-slate-100 last:border-0 ${isOpen ? 'bg-slate-50' : ''}`}>
                <button className="w-full text-left px-5 py-3.5 flex items-start gap-4"
                  onClick={() => setOpen(isOpen ? null : r.student_id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <p className="font-medium text-slate-800 text-sm">{r.student_name}</p>
                      <span className="text-xs text-slate-500">· {r.reference_client_name}</span>
                      <span className="text-xs text-slate-500">· Coach {r.coach_name}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {r.submitted_at && new Date(r.submitted_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-3">
                    {rating > 0 && (
                      <span className="text-amber-500 text-sm">
                        {'★'.repeat(rating)}<span className="text-slate-300">{'★'.repeat(5 - rating)}</span>
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>
                {isOpen && r.content && (
                  <div className="px-5 pb-4 space-y-3 text-sm">
                    {r.content.section2?.compare_to_tech && (
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Benchmark</p>
                        <p className="text-slate-700">
                          Compared to <strong>{r.content.section2.compare_to_tech}</strong>:
                          {' '}
                          <span className="font-medium">
                            {COMPARE_LABELS[r.content.section2.comparison || ''] || '—'}
                          </span>
                        </p>
                        {r.content.section2.comparison_reason && (
                          <p className="text-slate-600 text-xs mt-1 italic">
                            &ldquo;{r.content.section2.comparison_reason}&rdquo;
                          </p>
                        )}
                      </div>
                    )}
                    {r.content.section3?.most_valuable && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1">Most valuable</p>
                        <p className="text-slate-800">&ldquo;{r.content.section3.most_valuable}&rdquo;</p>
                      </div>
                    )}
                    {r.content.section3?.would_change && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">Would change</p>
                        <p className="text-slate-800">&ldquo;{r.content.section3.would_change}&rdquo;</p>
                      </div>
                    )}
                    {r.content.section3?.would_recommend && (
                      <p className="text-xs text-slate-500">
                        Would recommend: <strong className="capitalize">{r.content.section3.would_recommend}</strong>
                      </p>
                    )}
                    {r.content.section1 && Object.keys(r.content.section1).length > 0 && (
                      <details className="bg-white border border-slate-200 rounded-lg p-3">
                        <summary className="text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer">
                          Mirror of expectations
                        </summary>
                        <div className="mt-2 space-y-2">
                          {Object.entries(r.content.section1).map(([k, v]) => (
                            <div key={k} className="text-xs">
                              <code className="text-slate-500">{k}:</code>{' '}
                              <span className="text-slate-700">{v.mode || '—'}</span>
                              {v.text && <p className="italic text-slate-600 mt-0.5">&ldquo;{v.text}&rdquo;</p>}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-3">
        Showing {filtered.length} of {rows.length} submissions.
      </p>
    </AdminLayout>
  )
}
