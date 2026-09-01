'use client'

// Coaching Sandbox — certified students registry (Phase 6b).
// SA sees all certifications across every coach; a non-SA coach
// sees only students they certified. Backend endpoint:
//   GET /coaching/certified
// Filterable client-side by search (name/email/reference client) +
// grade chips.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'
import { extractErrorMessage } from '@/lib/errors'


interface CertifiedRecord {
  id: string
  certificate_number: string | null
  student_name: string | null
  student_email: string | null
  reference_client_name: string
  reference_client_short_name: string
  coach_name: string | null
  session_id: string
  session_started_at: string | null
  session_closed_at: string | null
  grade: 'SATISFACTORY' | 'GOOD' | 'EXCELLENT'
  certified_at: string
  certificate_generated_at: string | null
  certificate_pdf_url: string | null
}

const GRADE_LABEL: Record<string, string> = {
  SATISFACTORY: 'Satisfactory', GOOD: 'Good', EXCELLENT: 'Excellent',
}
const GRADE_COLOUR: Record<string, string> = {
  SATISFACTORY: 'bg-blue-100 text-blue-800',
  GOOD:         'bg-emerald-100 text-emerald-800',
  EXCELLENT:    'bg-purple-100 text-purple-800',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) } catch { return iso }
}


export default function CertifiedRegistryPage() {
  const [rows, setRows] = useState<CertifiedRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState<string>('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get<CertifiedRecord[]>('/coaching/certified')
      setRows(data)
    } catch (e) {
      setError(extractErrorMessage(e, 'Failed to load certified students'))
    } finally {
      setLoading(false)
    }
  }

  const filtered = rows.filter(r => {
    if (gradeFilter && r.grade !== gradeFilter) return false
    if (search) {
      const s = search.toLowerCase()
      if (!(
        (r.student_name || '').toLowerCase().includes(s) ||
        (r.student_email || '').toLowerCase().includes(s) ||
        (r.reference_client_name || '').toLowerCase().includes(s) ||
        (r.certificate_number || '').toLowerCase().includes(s)
      )) return false
    }
    return true
  })

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <Link href="/coaching" className="text-sm text-slate-500 hover:text-slate-800">← All sessions</Link>
          <h1 className="text-2xl font-semibold text-slate-800 mt-2">Certified Students</h1>
          <p className="text-sm text-slate-500 mt-1">
            Registry of all students who completed a rootsTALK coaching program. Verifiable via each row&apos;s certificate number.
          </p>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, client, or cert number…"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[240px]" />
          {[
            { label: 'All grades', value: '' },
            { label: 'Satisfactory', value: 'SATISFACTORY' },
            { label: 'Good', value: 'GOOD' },
            { label: 'Excellent', value: 'EXCELLENT' },
          ].map(c => (
            <button key={c.value} onClick={() => setGradeFilter(c.value)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                gradeFilter === c.value
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}>
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-slate-500 text-sm p-8 text-center">Loading…</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <p className="text-slate-600 font-medium">
              {rows.length === 0 ? 'No certifications yet.' : 'No matches for your filter.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Student</th>
                  <th className="text-left px-4 py-3 font-medium">Reference Client</th>
                  <th className="text-left px-4 py-3 font-medium">Coach</th>
                  <th className="text-left px-4 py-3 font-medium">Grade</th>
                  <th className="text-left px-4 py-3 font-medium">Certified</th>
                  <th className="text-left px-4 py-3 font-medium">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-800 font-medium">{r.student_name || '—'}</p>
                      <p className="text-xs text-slate-500">{r.student_email || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">{r.reference_client_name}</p>
                      <p className="text-xs text-slate-400">{r.reference_client_short_name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.coach_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${GRADE_COLOUR[r.grade]}`}>
                        {GRADE_LABEL[r.grade]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDate(r.certified_at)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.certificate_number ? (
                        <>
                          <p className="text-slate-500 font-mono">{r.certificate_number.slice(0, 8)}…</p>
                          {r.certificate_pdf_url && (
                            <a href={r.certificate_pdf_url} target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-700 hover:text-purple-900 font-medium">
                              Open PDF
                            </a>
                          )}
                        </>
                      ) : (
                        <Link href={`/coaching/${r.session_id}`}
                          className="text-amber-700 hover:text-amber-900 font-medium">
                          Not generated →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
