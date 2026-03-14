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
      { href: '/admin', label: 'Admin Dashboard' },
      { href: '/admin/checks', label: 'Run Checks' },
      { href: '/admin/users', label: 'Users' },
    )
  }

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-bold text-gray-900 text-sm">Greythorn Referrals</span>
          <div className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href + '/'))
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{displayId}</span>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
