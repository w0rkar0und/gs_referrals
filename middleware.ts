import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { APPS } from '@/lib/apps'

const PROTECTED_PATHS = ['/apps', ...APPS.map((app) => app.basePath)]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect specific paths
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
  if (!isProtected) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Check per-app access (skip for /apps launcher page)
  const matchedApp = APPS.find(
    (app) => pathname === app.basePath || pathname.startsWith(app.basePath + '/')
  )

  if (matchedApp) {
    // Check if user is admin (bypasses app-level access check)
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      // Check user_apps for this specific app
      const { data: access } = await supabase
        .from('user_apps')
        .select('id')
        .eq('user_id', user.id)
        .eq('app_slug', matchedApp.slug)
        .limit(1)

      if (!access || access.length === 0) {
        // No access — redirect to apps page
        const appsUrl = new URL('/apps', request.url)
        return NextResponse.redirect(appsUrl)
      }
    }
  }

  return response
}

export const config = {
  matcher: ['/apps/:path*', '/referrals/:path*'],
}
