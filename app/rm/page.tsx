'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

interface UserResult {
  id: string; name: string | null; phone: string | null; email: string | null
  district: string | null; state: string | null; clients: string[]
}

export default function RMHomePage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserResult[]>([])
  const [searching, setSearching] = useState(false)
  const [alertSummary, setAlertSummary] = useState<{ start_date: number; input_due: number } | null>(null)
  const [openCases, setOpenCases] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Load summary stats
    Promise.all([
      api.get('/admin/rm/alerts?alert_type=START_DATE').then(r => ({ start_date: (r.data as unknown[]).length })).catch(() => ({ start_date: 0 })),
      api.get('/admin/rm/alerts?alert_type=INPUT_DUE').then(r => ({ input_due: (r.data as unknown[]).length })).catch(() => ({ input_due: 0 })),
      api.get('/admin/rm/cases?resolution_status=OPEN').then(r => ({ open: (r.data as unknown[]).length })).catch(() => ({ open: 0 })),
    ]).then(([sd, id, cases]) => {
      setAlertSummary({ start_date: sd.start_date, input_due: id.input_due })
      setOpenCases(cases.open)
    })
    // Auto-focus search
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  function onSearch(value: string) {
    setQuery(value)
    if (timer.current) clearTimeout(timer.current)
    if (value.trim().length < 2) { setResults([]); return }
    setSearching(true)
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get<UserResult[]>(`/admin/rm/users/search?q=${encodeURIComponent(value.trim())}`)
        setResults(data)
      } finally { setSearching(false) }
    }, 300)
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">RM Support Desk</h1>
          <p className="text-slate-500 text-sm mt-0.5">Search any user or monitor alerts across all clients</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-7">
          <button onClick={() => router.push('/rm/alerts?type=START_DATE')}
            className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left hover:bg-amber-100 transition-colors">
            <p className="text-2xl font-bold text-amber-800">{alertSummary?.start_date ?? '…'}</p>
            <p className="text-xs font-semibold text-amber-600 mt-1">Start Date Pending</p>
            <p className="text-xs text-amber-500">Subscribed but no sow date</p>
          </button>
          <button onClick={() => router.push('/rm/alerts?type=INPUT_DUE')}
            className="bg-red-50 border border-red-200 rounded-xl p-4 text-left hover:bg-red-100 transition-colors">
            <p className="text-2xl font-bold text-red-700">{alertSummary?.input_due ?? '…'}</p>
            <p className="text-xs font-semibold text-red-600 mt-1">Input Due</p>
            <p className="text-xs text-red-400">Advisory window open, no order</p>
          </button>
          <button onClick={() => router.push('/rm/cases')}
            className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left hover:bg-blue-100 transition-colors">
            <p className="text-2xl font-bold text-blue-700">{openCases}</p>
            <p className="text-xs font-semibold text-blue-600 mt-1">Open Cases</p>
            <p className="text-xs text-blue-400">Pending resolution</p>
          </button>
        </div>

        {/* Search — the primary UX */}
        <div className="relative">
          <div className="flex items-center bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 gap-3 focus-within:border-blue-400 transition-colors shadow-sm">
            <span className="text-slate-400 text-lg">🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => onSearch(e.target.value)}
              placeholder="Search by name or phone number…"
              className="flex-1 text-base text-slate-800 focus:outline-none placeholder:text-slate-300"
            />
            {searching && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
            {query && !searching && (
              <button onClick={() => { setQuery(''); setResults([]) }} className="text-slate-400 hover:text-slate-600">✕</button>
            )}
          </div>

          {/* Results dropdown */}
          {results.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl mt-2 z-20 overflow-hidden max-h-96 overflow-y-auto">
              {results.map(user => (
                <button key={user.id}
                  onClick={() => router.push(`/rm/users/${user.id}`)}
                  className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-sky-200 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                    {(user.name || user.phone || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{user.name || 'No name'}</p>
                    <p className="text-xs text-slate-400">{user.phone}{user.district ? ` · ${user.district}` : ''}</p>
                    {user.clients.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {user.clients.map(c => (
                          <span key={c} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-slate-300 text-lg self-center">›</span>
                </button>
              ))}
            </div>
          )}

          {query.length >= 2 && !searching && results.length === 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl mt-2 z-20 px-5 py-8 text-center">
              <p className="text-slate-400">No users found for &quot;{query}&quot;</p>
            </div>
          )}
        </div>

        {/* Quick nav */}
        <div className="flex gap-3 mt-6">
          <button onClick={() => router.push('/rm/alerts')}
            className="flex-1 py-3 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
            📢 Alert Queue
          </button>
          <button onClick={() => router.push('/rm/cases')}
            className="flex-1 py-3 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
            📋 All Cases
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}
