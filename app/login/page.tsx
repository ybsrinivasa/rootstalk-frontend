'use client'
import { useState, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { adminLogin, getToken } from '@/lib/auth'
import api from '@/lib/api'

type LoginMethod = 'password' | 'otp'
type OtpStage = 'request' | 'verify'

export default function LoginPage() {
  const router = useRouter()
  const [method, setMethod] = useState<LoginMethod>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStage, setOtpStage] = useState<OtpStage>('request')
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [forgotNew, setForgotNew] = useState('')
  const [forgotStage, setForgotStage] = useState<'email' | 'otp' | 'done'>('email')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (getToken()) router.replace('/dashboard')
  }, [router])

  // ── Password login ────────────────────────────────────────────────────────────
  async function handlePasswordLogin(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await adminLogin(email, password)
      router.replace('/dashboard')
    } catch { setError('Invalid email or password') } finally { setLoading(false) }
  }

  // ── OTP login ─────────────────────────────────────────────────────────────────
  async function requestOtp(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await api.post('/auth/admin/request-email-otp', { email, purpose: 'LOGIN' })
      setOtpStage('verify')
      setInfo(`A 6-digit code was sent to ${email}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Could not send OTP')
    } finally { setLoading(false) }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/auth/admin/verify-email-otp', { email, otp_code: otpCode })
      localStorage.setItem('rt_token', data.access_token)
      const me = await api.get('/auth/me')
      localStorage.setItem('rt_user', JSON.stringify((me as { data: unknown }).data))
      router.replace('/dashboard')
    } catch { setError('Invalid or expired code') } finally { setLoading(false) }
  }

  // ── Forgot password ───────────────────────────────────────────────────────────
  async function sendForgotOtp(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await api.post('/auth/admin/forgot-password', { email: forgotEmail })
      setForgotStage('otp')
      setInfo(`Reset code sent to ${forgotEmail}`)
    } catch { setError('Could not send reset code') } finally { setLoading(false) }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await api.post('/auth/admin/reset-password', { email: forgotEmail, otp_code: forgotOtp, new_password: forgotNew })
      setForgotStage('done')
      setInfo('Password reset. You can now sign in.')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Reset failed. Check the code and try again.')
    } finally { setLoading(false) }
  }

  const PortalBrand = () => (
    <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)' }}>
      <div>
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.2)' }}>
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
          <span className="text-blue-400 text-xs font-medium tracking-widest uppercase opacity-80">Neytiri Eywafarm Agritech</span>
        </div>
        <h1 className="text-5xl font-bold text-white leading-tight">RootsTalk</h1>
        <p className="text-blue-300 text-lg mt-2 font-light">Eywa Admin Portal</p>
        <p className="text-slate-400 text-sm mt-1">Internal operations — Neytiri team only</p>
      </div>
      <p className="text-slate-500 text-sm">Manage companies, sync data, configure the platform.</p>
    </div>
  )

  if (forgotMode) {
    return (
      <div className="min-h-screen flex">
        <PortalBrand />
        <div className="flex-1 flex items-center justify-center bg-white px-8 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900">Reset password</h2>
              <p className="text-slate-500 text-sm mt-1">We'll send a one-time code to your email</p>
            </div>
            {forgotStage === 'email' && (
              <form onSubmit={sendForgotOtp} className="space-y-4">
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                  required autoFocus placeholder="your@email.com"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">⚠ {error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)' }}>
                  {loading ? 'Sending…' : 'Send reset code'}
                </button>
              </form>
            )}
            {forgotStage === 'otp' && (
              <form onSubmit={resetPassword} className="space-y-4">
                {info && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-2">{info}</p>}
                <input value={forgotOtp} onChange={e => setForgotOtp(e.target.value)}
                  required maxLength={6} placeholder="6-digit code"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="password" value={forgotNew} onChange={e => setForgotNew(e.target.value)}
                  required placeholder="New password (min 8 chars)"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">⚠ {error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)' }}>
                  {loading ? 'Resetting…' : 'Set new password'}
                </button>
              </form>
            )}
            {forgotStage === 'done' && (
              <div className="text-center">
                <p className="text-3xl mb-4">✓</p>
                <p className="text-green-700 font-semibold">{info}</p>
              </div>
            )}
            <button onClick={() => { setForgotMode(false); setForgotStage('email'); setError(''); setInfo('') }}
              className="mt-6 text-sm text-blue-600 hover:underline block mx-auto">
              ← Back to sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      <PortalBrand />
      <div className="flex-1 flex items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
            <p className="text-slate-500 text-sm mt-1">Admin Portal access</p>
          </div>

          {/* Method toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
            <button onClick={() => { setMethod('password'); setError(''); setInfo('') }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${method === 'password' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
              Password
            </button>
            <button onClick={() => { setMethod('otp'); setError(''); setInfo(''); setOtpStage('request') }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${method === 'otp' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
              Email OTP
            </button>
          </div>

          {/* Password login */}
          {method === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="your@email.com"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="Password"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">⚠ {error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)' }}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
              <button type="button" onClick={() => setForgotMode(true)}
                className="w-full text-sm text-blue-600 hover:underline text-center mt-1">
                Forgot password?
              </button>
            </form>
          )}

          {/* OTP login */}
          {method === 'otp' && otpStage === 'request' && (
            <form onSubmit={requestOtp} className="space-y-4">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="your@email.com"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">⚠ {error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)' }}>
                {loading ? 'Sending…' : 'Send OTP to my email'}
              </button>
            </form>
          )}

          {method === 'otp' && otpStage === 'verify' && (
            <form onSubmit={verifyOtp} className="space-y-4">
              {info && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-2">{info}</p>}
              <input value={otpCode} onChange={e => setOtpCode(e.target.value)}
                required maxLength={6} autoFocus placeholder="6-digit code"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">⚠ {error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)' }}>
                {loading ? 'Verifying…' : 'Verify & Sign in'}
              </button>
              <button type="button" onClick={() => { setOtpStage('request'); setOtpCode(''); setError(''); setInfo('') }}
                className="w-full text-sm text-slate-400 hover:text-slate-600">
                ← Send new code
              </button>
            </form>
          )}

          <p className="text-center text-xs text-slate-300 mt-10">Neytiri Eywafarm Agritech Pvt Ltd</p>
        </div>
      </div>
    </div>
  )
}
