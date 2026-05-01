'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout, getUser } from '@/lib/auth'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⬡' },
  { href: '/clients', label: 'Companies', icon: '🏢' },
  { href: '/advisory/global', label: 'Global CCA Library', icon: '🌿' },
  { href: '/cha/global', label: 'Global CHA Library', icon: '🔬' },
  { href: '/languages', label: 'Languages', icon: '🌐' },
  { href: '/sync', label: 'Sync Log', icon: '↻' },
]

export default function Sidebar() {
  const path = usePathname()
  const user = getUser()

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col min-h-screen"
      style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e3a5f 100%)' }}>
      {/* Brand */}
      <div className="px-5 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(59,130,246,0.25)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" fill="#60a5fa"/>
              <circle cx="4" cy="6" r="2" fill="#60a5fa" opacity="0.7"/>
              <circle cx="20" cy="18" r="2" fill="#60a5fa" opacity="0.7"/>
              <line x1="12" y1="12" x2="4" y2="6" stroke="#60a5fa" strokeWidth="1.5"/>
              <line x1="12" y1="12" x2="20" y2="18" stroke="#60a5fa" strokeWidth="1.5"/>
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">RootsTalk</p>
            <p className="text-blue-400 text-xs opacity-70">Eywa Portal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(item => {
          const active = path === item.href || path.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 pb-6 border-t border-white/10 pt-4 space-y-1">
        <button onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
          <span>→</span> Sign out
        </button>
        <div className="px-3 py-1">
          <p className="text-white text-xs font-medium truncate">{user?.name || user?.email}</p>
          <p className="text-slate-500 text-xs truncate">{user?.email}</p>
        </div>
      </div>
    </aside>
  )
}
