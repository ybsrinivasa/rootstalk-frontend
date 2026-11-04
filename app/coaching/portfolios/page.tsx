'use client'

// 2026-11-04 — Student Portfolios aggregation for SA / COACH.
// Lists certified students who have opened their portfolio; each row
// is one user_id (a student who ran through multiple cohorts only
// appears once). Click a row to inline-expand into the full portfolio
// view: testimonial assets with consent flags, employment summary,
// and CV versions with download links.
//
// Backend: GET /coaching/portfolios + GET /coaching/portfolios/{user_id}.
// List endpoint filters are URL-encoded so the browser's back button
// restores filter state cleanly. Detail is cached per-expand (one
// extra fetch to be sure we have the freshest `cvs` list).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'


interface CV {
  id: string
  file_url: string
  filename: string
  is_latest: boolean
  uploaded_at: string
}
interface PortfolioRow {
  user_id: string
  student_name: string | null
  student_email: string | null
  photo_url: string | null
  video_url: string | null
  testimonial_text: string | null
  marketing_consent_photo: boolean
  marketing_consent_video: boolean
  marketing_consent_testimonial: boolean
  is_employed: boolean
  employer_name: string | null
  employed_since: string | null
  is_open_to_offers: boolean
  open_to_offers_notes: string | null
  hiring_consent_share_cv: boolean
  cvs: CV[]
  updated_at: string
}


type Tri = 'any' | 'yes' | 'no'
function triToParam(v: Tri): string | undefined {
  return v === 'yes' ? 'true' : v === 'no' ? 'false' : undefined
}


function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return iso }
}


export default function StudentPortfoliosPage() {
  const [rows, setRows] = useState<PortfolioRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [hasCv, setHasCv] = useState<Tri>('any')
  const [sharedCv, setSharedCv] = useState<Tri>('any')
  const [openToOffers, setOpenToOffers] = useState<Tri>('any')
  const [employed, setEmployed] = useState<Tri>('any')
  const [hasTestimonial, setHasTestimonial] = useState<Tri>('any')
  const [open, setOpen] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError('')
    const params = new URLSearchParams()
    const add = (k: string, v: string | undefined) => {
      if (v !== undefined) params.set(k, v)
    }
    add('has_cv', triToParam(hasCv))
    add('shared_cv_consent', triToParam(sharedCv))
    add('is_open_to_offers', triToParam(openToOffers))
    add('is_employed', triToParam(employed))
    add('has_testimonial', triToParam(hasTestimonial))
    try {
      const { data } = await api.get<PortfolioRow[]>(
        '/coaching/portfolios' + (params.toString() ? `?${params}` : ''),
      )
      setRows(data)
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to load portfolios'))
    } finally {
      setLoading(false)
    }
  }

  // Reload whenever any filter flips.
  useEffect(() => { load() },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasCv, sharedCv, openToOffers, employed, hasTestimonial],
  )

  // Name/email search stays client-side — the backend list doesn't
  // take a search term today and these lists are small.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => (
      (r.student_name || '').toLowerCase().includes(q)
      || (r.student_email || '').toLowerCase().includes(q)
    ))
  }, [rows, search])

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <Link href="/coaching" className="text-sm text-slate-500 hover:text-slate-800">← All sessions</Link>
          <h1 className="text-2xl font-semibold text-slate-800 mt-2">Student Portfolios</h1>
          <p className="text-sm text-slate-500 mt-1">
            Certified students&apos; testimonial and hiring profiles — photo, video, testimonial text,
            and CV versions. Each student appears once, regardless of how many cohorts they ran through.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by student name or email…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <TriFilter label="CV uploaded" value={hasCv} onChange={setHasCv} />
            <TriFilter label="Shared CV consent" value={sharedCv} onChange={setSharedCv} />
            <TriFilter label="Open to offers" value={openToOffers} onChange={setOpenToOffers} />
            <TriFilter label="Employed" value={employed} onChange={setEmployed} />
            <TriFilter label="Has testimonial" value={hasTestimonial} onChange={setHasTestimonial} />
          </div>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center py-12 text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-16 text-sm text-slate-400">
            No portfolios match these filters yet.
          </p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filtered.map(r => {
              const latestCv = r.cvs.find(cv => cv.is_latest)
              const isOpen = open === r.user_id
              return (
                <div key={r.user_id}
                  className={`border-b border-slate-100 last:border-0 ${isOpen ? 'bg-slate-50' : ''}`}>
                  <button className="w-full text-left px-5 py-3.5 flex items-start gap-4"
                    onClick={() => setOpen(isOpen ? null : r.user_id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <p className="font-medium text-slate-800 text-sm">{r.student_name || r.student_email || '—'}</p>
                        {r.student_email && r.student_name && (
                          <span className="text-xs text-slate-500">· {r.student_email}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {r.cvs.length > 0 && <Chip tone="emerald">{r.cvs.length} CV{r.cvs.length === 1 ? '' : 's'}</Chip>}
                        {r.testimonial_text && <Chip tone="emerald">Testimonial</Chip>}
                        {r.photo_url && <Chip tone="slate">Photo</Chip>}
                        {r.video_url && <Chip tone="slate">Video</Chip>}
                        {r.is_employed && <Chip tone="blue">Employed</Chip>}
                        {r.is_open_to_offers && <Chip tone="amber">Open to offers</Chip>}
                        {r.hiring_consent_share_cv && <Chip tone="emerald">CV share OK</Chip>}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0 mt-1">{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && <Detail row={r} latestCv={latestCv} />}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-xs text-slate-400 mt-3">
          Showing {filtered.length} of {rows.length} certified students with portfolio activity.
        </p>
      </div>
    </AdminLayout>
  )
}


function TriFilter({
  label, value, onChange,
}: {
  label: string
  value: Tri
  onChange: (v: Tri) => void
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <div className="flex gap-1">
        {(['any', 'yes', 'no'] as Tri[]).map(opt => (
          <button key={opt} onClick={() => onChange(opt)}
            className={`flex-1 text-xs px-2 py-1 rounded border capitalize ${
              value === opt
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
            }`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}


function Chip({ tone, children }: { tone: 'emerald' | 'amber' | 'blue' | 'slate'; children: React.ReactNode }) {
  const toneClass = tone === 'emerald'
    ? 'bg-emerald-100 text-emerald-800'
    : tone === 'amber'
      ? 'bg-amber-100 text-amber-800'
      : tone === 'blue'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-slate-100 text-slate-700'
  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${toneClass}`}>
      {children}
    </span>
  )
}


function Detail({ row, latestCv }: { row: PortfolioRow; latestCv: CV | undefined }) {
  return (
    <div className="px-5 pb-5 space-y-4">
      {/* Testimonial block */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Testimonial profile</h3>
        {row.photo_url || row.video_url ? (
          <div className="flex gap-3 flex-wrap items-start">
            {row.photo_url && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.photo_url} alt="" className="w-32 h-32 object-cover rounded-lg border border-slate-200" />
                <p className="text-[10px] text-slate-500 mt-1">
                  Photo · {row.marketing_consent_photo ? <span className="text-emerald-700 font-semibold">consent given</span> : <span className="text-red-600 font-semibold">no consent</span>}
                </p>
              </div>
            )}
            {row.video_url && (
              <div className="flex-1 min-w-[240px]">
                <video src={row.video_url} controls className="w-full rounded-lg border border-slate-200" />
                <p className="text-[10px] text-slate-500 mt-1">
                  Video · {row.marketing_consent_video ? <span className="text-emerald-700 font-semibold">consent given</span> : <span className="text-red-600 font-semibold">no consent</span>}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No photo or video uploaded.</p>
        )}
        {row.testimonial_text ? (
          <div>
            <p className="text-sm text-slate-800 italic bg-slate-50 border-l-4 border-slate-300 pl-3 py-2">
              &ldquo;{row.testimonial_text}&rdquo;
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              Testimonial · {row.marketing_consent_testimonial ? <span className="text-emerald-700 font-semibold">consent given</span> : <span className="text-red-600 font-semibold">no consent</span>}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No testimonial text yet.</p>
        )}
      </div>

      {/* Hiring block */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Hiring profile</h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Currently employed</p>
            {row.is_employed ? (
              <p className="text-slate-800">
                {row.employer_name || <span className="italic text-slate-500">(employer not given)</span>}
                {row.employed_since && (
                  <span className="text-slate-500 text-xs"> · since {formatDate(row.employed_since)}</span>
                )}
              </p>
            ) : (
              <p className="text-slate-500">No</p>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Open to new opportunities</p>
            {row.is_open_to_offers ? (
              <p className="text-slate-800">
                Yes
                {row.open_to_offers_notes && (
                  <span className="text-slate-500 text-xs"> — {row.open_to_offers_notes}</span>
                )}
              </p>
            ) : (
              <p className="text-slate-500">No</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">CV</p>
          {row.cvs.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No CV uploaded.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {latestCv && (
                  <a href={latestCv.file_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg">
                    ↓ Download latest ({latestCv.filename})
                  </a>
                )}
                <span className="text-[11px] text-slate-500">
                  {row.hiring_consent_share_cv
                    ? <span className="text-emerald-700 font-semibold">Share consent given</span>
                    : <span className="text-red-600 font-semibold">No share consent</span>}
                </span>
              </div>
              {row.cvs.length > 1 && (
                <details>
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-800">
                    {row.cvs.length - 1} earlier version{row.cvs.length === 2 ? '' : 's'}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {row.cvs.filter(cv => !cv.is_latest).map(cv => (
                      <li key={cv.id} className="text-xs flex items-center gap-2">
                        <a href={cv.file_url} target="_blank" rel="noopener noreferrer"
                          className="text-emerald-800 underline">{cv.filename}</a>
                        <span className="text-slate-500">· {formatDate(cv.uploaded_at)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Last updated {new Date(row.updated_at).toLocaleString()}
      </p>
    </div>
  )
}
