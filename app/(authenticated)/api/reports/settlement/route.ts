import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: profile }, { data: access }] = await Promise.all([
    serviceClient.from('profiles').select('is_admin').eq('id', user.id).single(),
    serviceClient.from('user_apps').select('id, permissions').eq('user_id', user.id).eq('app_slug', 'reports').limit(1),
  ])

  if (!profile?.is_admin) {
    if (!access || access.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const perms = access[0].permissions as Record<string, boolean> | null
    if (!perms?.settlement) {
      return NextResponse.json({ error: 'You do not have access to the DA Relations Settlement Data report.' }, { status: 403 })
    }
  }

  const { hrCode } = await request.json()
  if (!hrCode) {
    return NextResponse.json({ error: 'HR code is required.' }, { status: 400 })
  }

  try {
    const proxyRes = await fetch(`${process.env.RAILWAY_PROXY_URL}/report/settlement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Report-Secret': process.env.RAILWAY_PROXY_SECRET!,
      },
      body: JSON.stringify({ hrCode }),
    })

    if (!proxyRes.ok) {
      const err = await proxyRes.json()
      return NextResponse.json({ error: err.error || 'Report query failed.' }, { status: proxyRes.status })
    }

    const data = await proxyRes.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to connect to report service.' }, { status: 502 })
  }
}
