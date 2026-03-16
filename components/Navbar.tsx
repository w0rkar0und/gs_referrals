'use client'

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
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
              </svg>
            </div>
            <span className="font-semibold text-slate-900 text-sm hidden sm:block">
              {currentApp ? currentApp.name : 'GS Apps'}
            </span>
          </Link>
          {links.length > 0 && (
            <div className="flex items-center gap-0.5">
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
            className="text-sm text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
