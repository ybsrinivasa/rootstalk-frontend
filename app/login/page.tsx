'use client'
import { useState, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { adminLogin, getToken } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (getToken()) router.replace('/dashboard')
  }, [router])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await adminLogin(email, password)
      router.replace('/dashboard')
    } catch {
      setError('Invalid email or password')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)' }}>
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(59,130,246,0.2)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" fill="#60a5fa"/>
                <circle cx="4" cy="6" r="2" fill="#60a5fa" opacity="0.7"/>
                <circle cx="20" cy="6" r="2" fill="#60a5fa" opacity="0.7"/>
                <circle cx="4" cy="18" r="2" fill="#60a5fa" opacity="0.7"/>
                <circle cx="20" cy="18" r="2" fill="#60a5fa" opacity="0.7"/>
                <line x1="12" y1="12" x2="4" y2="6" stroke="#60a5fa" strokeWidth="1" opacity="0.5"/>
                <line x1="12" y1="12" x2="20" y2="6" stroke="#60a5fa" strokeWidth="1" opacity="0.5"/>
                <line x1="12" y1="12" x2="4" y2="18" stroke="#60a5fa" strokeWidth="1" opacity="0.5"/>
                <line x1="12" y1="12" x2="20" y2="18" stroke="#60a5fa" strokeWidth="1" opacity="0.5"/>
              </svg>
            </div>
            <span className="text-blue-400 text-xs font-medium tracking-widest uppercase opacity-80">
              Neytiri Eywafarm Agritech
            </span>
          </div>
          <h1 className="text-5xl font-bold text-white leading-tight">RootsTalk</h1>
          <p className="text-blue-300 text-lg mt-2 font-light">Eywa Admin Portal</p>
          <p className="text-slate-400 text-sm mt-1">Internal operations — Neytiri team only</p>
        </div>
        <p className="text-slate-500 text-sm">
          Manage companies, sync data, configure the platform.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
            <p className="text-slate-500 text-sm mt-1">Admin Portal access</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="you@eywa.farm"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                ⚠ {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="text-center text-xs text-slate-400 mt-10">Neytiri Eywafarm Agritech Pvt Ltd</p>
        </div>
      </div>
    </div>
  )
}
