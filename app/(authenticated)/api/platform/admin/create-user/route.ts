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

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { display_id, password, full_name, email: userEmail, is_internal, is_admin, app_slugs, app_permissions } = await request.json()

  if (!display_id || !password) {
    return NextResponse.json({ error: 'Display ID and password are required.' }, { status: 400 })
  }

  const domain = is_internal ? 'greythorn.internal' : 'greythorn.external'
  const authEmail = `${display_id.toLowerCase()}@${domain}`

  const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      display_id,
      full_name: full_name || null,
      email: userEmail || null,
      is_internal: !!is_internal,
    },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // Set admin status and additional profile fields
  const profileUpdate: Record<string, unknown> = {}
  if (is_admin) profileUpdate.is_admin = true
  if (full_name) profileUpdate.full_name = full_name
  if (userEmail) profileUpdate.email = userEmail

  if (Object.keys(profileUpdate).length > 0) {
    await serviceClient
      .from('profiles')
      .update(profileUpdate)
      .eq('id', newUser.user.id)
  }

  // Grant app access
  const slugs: string[] = Array.isArray(app_slugs) && app_slugs.length > 0
    ? app_slugs
    : ['referrals']

  const permsMap = app_permissions as Record<string, Record<string, boolean>> | undefined
  await serviceClient.from('user_apps').insert(
    slugs.map((slug: string) => ({
      user_id: newUser.user.id,
      app_slug: slug,
      granted_by: user.id,
      permissions: permsMap?.[slug] ?? null,
    }))
  )

  // Fetch the auto-created profile
  const { data: newProfile } = await serviceClient
    .from('profiles')
    .select('*')
    .eq('id', newUser.user.id)
    .single()

  // Fetch app access
  const { data: newUserApps } = await serviceClient
    .from('user_apps')
    .select('app_slug, permissions')
    .eq('user_id', newUser.user.id)

  const appAccess = (newUserApps ?? []).map((ua: { app_slug: string; permissions: Record<string, boolean> | null }) => ({
    slug: ua.app_slug,
    permissions: ua.permissions,
  }))

  return NextResponse.json({
    ok: true,
    profile: newProfile,
    app_slugs: appAccess.map((a: { slug: string }) => a.slug),
    app_access: appAccess,
  })
}
