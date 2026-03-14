'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

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

  const links = [
    { href: '/referrals', label: 'My Referrals' },
    { href: '/submit', label: 'New Referral' },
  ]

  if (isAdmin) {
    links.push(
      { href: '/admin', label: 'Dashboard' },
      { href: '/admin/checks', label: 'Run Checks' },
      { href: '/admin/users', label: 'Users' },
    )
  }

  return (
    <nav className="bg-white border-b border-slate-200/80 sticky top-0 z-50 backdrop-blur-sm bg-white/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-8">
          <Link href="/referrals" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-1.997m0 0A8.961 8.961 0 0 1 12 15.75c-1.99 0-3.832.648-5.323 1.747" />
              </svg>
            </div>
            <span className="font-semibold text-slate-900 text-sm hidden sm:block">Greythorn</span>
          </Link>
          <div className="flex items-center gap-0.5">
            {links.map((link) => {
              const active = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href + '/'))
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
