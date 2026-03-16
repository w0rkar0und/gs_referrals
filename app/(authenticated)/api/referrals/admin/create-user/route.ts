import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  // Authenticate the caller
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

  // Check admin
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { display_id, password, is_internal, app_slugs } = await request.json()

  if (!display_id || !password) {
    return NextResponse.json({ error: 'Display ID and password are required.' }, { status: 400 })
  }

  const domain = is_internal ? 'greythorn.internal' : 'greythorn.external'
  const email = `${display_id.toLowerCase()}@${domain}`

  const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_id,
      is_internal: !!is_internal,
    },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // Grant app access
  const slugs: string[] = Array.isArray(app_slugs) && app_slugs.length > 0
    ? app_slugs
    : ['referrals']

  await serviceClient.from('user_apps').insert(
    slugs.map((slug: string) => ({
      user_id: newUser.user.id,
      app_slug: slug,
      granted_by: user.id,
    }))
  )

  // Fetch the auto-created profile
  const { data: newProfile } = await serviceClient
    .from('profiles')
    .select('*')
    .eq('id', newUser.user.id)
    .single()

  return NextResponse.json({ ok: true, profile: newProfile })
}
