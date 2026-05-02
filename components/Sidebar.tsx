'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout, getUser } from '@/lib/auth'

// ── SVG icons ─────────────────────────────────────────────────────────────────
function IconHome() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}
function IconBuilding() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}
function IconBook() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}
function IconBeaker() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  )
}
function IconGlobe() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function IconRefresh() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}
function IconHeadphones() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 18v-6a9 9 0 0118 0v6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
    </svg>
  )
}
function IconBriefcase() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}
function IconLeaf() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}
function IconTag() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  )
}
function IconLock() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

// ── Nav definition ─────────────────────────────────────────────────────────────
interface NavItem {
  href: string
  label: string
  Icon: React.ComponentType
  roles: string[]
  group: string
}

const ALL_NAV: NavItem[] = [
  // PLATFORM
  { href: '/dashboard',            label: 'Dashboard',          Icon: IconHome,       roles: ['SA', 'CM', 'RM'], group: 'PLATFORM' },
  { href: '/clients',              label: 'Companies',          Icon: IconBuilding,   roles: ['SA', 'RM'],        group: 'PLATFORM' },
  { href: '/languages',            label: 'Languages',          Icon: IconGlobe,      roles: ['SA'],              group: 'PLATFORM' },
  { href: '/sync',                 label: 'Sync Log',           Icon: IconRefresh,    roles: ['SA'],              group: 'PLATFORM' },
  // CONTENT
  { href: '/advisory/global',      label: 'Global CCA Library', Icon: IconBook,       roles: ['SA', 'CM'],        group: 'CONTENT' },
  { href: '/cha/global',           label: 'Global CHA Library', Icon: IconBeaker,     roles: ['SA', 'CM'],        group: 'CONTENT' },
  { href: '/crop-health-crops',    label: 'Crop Health',        Icon: IconLeaf,       roles: ['SA', 'CM'],        group: 'CONTENT' },
  { href: '/brand-handling',       label: 'Brand Handling',     Icon: IconTag,        roles: ['SA', 'CM'],        group: 'CONTENT' },
  { href: '/volume-calculations',  label: 'Volume Formulas',    Icon: IconBeaker,     roles: ['SA', 'CM'],        group: 'CONTENT' },
  // MY WORK
  { href: '/my-clients',           label: 'My Clients',         Icon: IconBriefcase,  roles: ['CM'],              group: 'MY WORK' },
  { href: '/rm',                   label: 'RM Support Desk',    Icon: IconHeadphones, roles: ['SA', 'RM'],        group: 'MY WORK' },
  // TEAM
  { href: '/users',                label: 'Team Users',         Icon: IconUsers,      roles: ['SA'],              group: 'TEAM' },
  { href: '/change-password',      label: 'Change Password',    Icon: IconLock,       roles: ['SA', 'CM', 'RM'],  group: 'TEAM' },
]

const GROUP_ORDER = ['PLATFORM', 'CONTENT', 'MY WORK', 'TEAM']

function GroupLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
      {label}
    </p>
  )
}

export default function Sidebar() {
  const path = usePathname()
  const user = getUser()

  const userRoles = user?.roles?.map((r: { role_type: string }) => r.role_type) || []
  const effectiveRole = userRoles.length === 0 ? 'SA' : userRoles[0]

  const filteredNav = ALL_NAV.filter(item => item.roles.includes(effectiveRole))

  const grouped = GROUP_ORDER.map(group => ({
    group,
    items: filteredNav.filter(item => item.group === group),
  })).filter(g => g.items.length > 0)

  const initials = (() => {
    const name = user?.name || user?.email || ''
    const parts = name.split(/[\s@]/)
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  })()

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col min-h-screen bg-[#0D1B2A]">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-white/10 bg-[#0D1B2A]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.2)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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
      <nav className="flex-1 overflow-y-auto pb-2">
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <GroupLabel label={group} />
            {items.map(item => {
              const active = path === item.href || path.startsWith(item.href + '/')
              const { Icon } = item
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-white/10 border-l-2 border-blue-400 text-white font-medium pl-[10px]'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}>
                  <Icon />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="overflow-hidden flex-1 min-w-0">
            <p className="text-white/80 text-xs font-medium truncate">{user?.name || user?.email}</p>
            {user?.name && <p className="text-white/40 text-xs truncate">{user?.email}</p>}
          </div>
        </div>
        <button onClick={logout}
          className="text-white/40 text-xs hover:text-white transition-colors">
          Sign out
        </button>
      </div>
    </aside>
  )
}
