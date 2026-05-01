'use client'
import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'
import api from '@/lib/api'

type Lang = {
  id: string; language_code: string; language_name_en: string
  language_name_native: string; script_direction: string; status: string
}

export default function LanguagesPage() {
  const [languages, setLanguages] = useState<Lang[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data } = await api.get('/platform/languages')
      setLanguages(data)
    } finally { setLoading(false) }
  }

  async function toggle(lang: Lang) {
    if (lang.language_code === 'en') return
    setToggling(lang.language_code)
    try {
      const newStatus = lang.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      await api.put(`/platform/languages/${lang.language_code}/status`, { status: newStatus })
      load()
    } finally { setToggling(null) }
  }

  const active = languages.filter(l => l.status === 'ACTIVE')
  const inactive = languages.filter(l => l.status !== 'ACTIVE')

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Languages</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {active.length} active · {inactive.length} inactive · English is always on
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading
          ? <p className="text-center py-12 text-slate-400">Loading…</p>
          : languages.map(lang => (
            <div key={lang.id}
              className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 last:border-0">
              <div className="flex items-center gap-4">
                <span className={`w-2 h-2 rounded-full ${lang.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                <div>
                  <p className="font-medium text-slate-800 text-sm">{lang.language_name_en}</p>
                  <p className="text-lg" style={{ fontFamily: 'serif' }}>{lang.language_name_native}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{lang.language_code}</span>
                {lang.script_direction === 'RTL' && (
                  <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">RTL</span>
                )}
                {lang.language_code === 'en'
                  ? <span className="text-xs text-slate-400 italic">Always on</span>
                  : (
                    <button onClick={() => toggle(lang)} disabled={toggling === lang.language_code}
                      className={`text-xs px-3 py-1 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                        lang.status === 'ACTIVE'
                          ? 'border-red-200 text-red-500 hover:bg-red-50'
                          : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                      }`}>
                      {toggling === lang.language_code ? '…' : lang.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                    </button>
                  )
                }
              </div>
            </div>
          ))
        }
      </div>
    </AdminLayout>
  )
}
