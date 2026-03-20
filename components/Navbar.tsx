'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { APP_NAV } from '@/lib/app-nav'
import { getAppByPath } from '@/lib/apps'

interface NavbarProps {
  isAdmin: boolean
  displayId: string
}

export default function Navbar({ isAdmin, displayId }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Determine which app we're in based on the current path
  const currentApp = getAppByPath(pathname)
  const appSlug = currentApp?.slug

  // Get nav links — use platform links on /apps, otherwise app-specific links
  const isOnPlatform = pathname === '/apps' || pathname.startsWith('/apps/')
  const navKey = appSlug ?? (isOnPlatform ? '_platform' : null)
  const links = navKey && APP_NAV[navKey]
    ? APP_NAV[navKey].filter((link) => !link.adminOnly || isAdmin)
    : []

  return (
    <nav className="bg-white border-b border-slate-200/80 sticky top-0 z-50 backdrop-blur-sm bg-white/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-8">
          <Link href="/apps" className="flex items-center gap-2">
            <Image
              src="/greythorn-logo.png"
              alt="Greythorn"
              width={28}
              height={28}
              className="w-7 h-7"
            />
            <span className="font-semibold text-slate-900 text-sm hidden sm:block">
              {currentApp ? currentApp.name : 'GS Apps'}
            </span>
          </Link>
          {links.length > 0 && (
            <div className="hidden sm:flex items-center gap-0.5">
              {links.map((link) => {
                const active = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      active
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-slate-50 rounded-lg">
            <div className="w-5 h-5 bg-slate-200 rounded-full flex items-center justify-center">
              <span className="text-[10px] font-semibold text-slate-600 uppercase">{displayId.charAt(0)}</span>
            </div>
            <span className="text-sm text-slate-600">{displayId}</span>
          </div>
          <button
            onClick={handleSignOut}
            className="hidden sm:block text-sm text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-50"
          >
            Sign out
          </button>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-50"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-t border-slate-200/80 bg-white">
          <div className="px-4 py-3 space-y-1">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + '/')
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                    active
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
          <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-slate-200 rounded-full flex items-center justify-center">
                <span className="text-[10px] font-semibold text-slate-600 uppercase">{displayId.charAt(0)}</span>
              </div>
              <span className="text-sm text-slate-600">{displayId}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
