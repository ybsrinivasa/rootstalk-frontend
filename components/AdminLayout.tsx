'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'
import Sidebar from './Sidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    if (!getToken()) router.replace('/login')
  }, [router])

  return (
    // 2026-09-24: `h-screen overflow-hidden` fixes the sidebar sign-out
    // scrolling off. Previously `min-h-screen` let the whole page grow
    // taller than the viewport for long pages, and the sidebar grew
    // with it — the "Sign out" at the sidebar footer scrolled off with
    // the rest of the content. Now the outer container is exactly
    // viewport-height, and the main pane scrolls internally.
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[#F7F5F0]">
        <div className="max-w-5xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
