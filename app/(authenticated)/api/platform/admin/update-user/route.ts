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

  const { action, user_id, ...params } = await request.json()

  if (!user_id) {
    return NextResponse.json({ error: 'user_id is required.' }, { status: 400 })
  }

  // Prevent admins from modifying their own admin status
  if (action === 'toggle_admin' && user_id === user.id) {
    return NextResponse.json({ error: 'You cannot change your own admin status.' }, { status: 400 })
  }

  if (action === 'toggle_admin') {
    const { data: target } = await serviceClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user_id)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }

    const { error: updateError } = await serviceClient
      .from('profiles')
      .update({ is_admin: !target.is_admin })
      .eq('id', user_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, is_admin: !target.is_admin })
  }

  if (action === 'update_apps') {
    const { app_slugs } = params

    if (!Array.isArray(app_slugs)) {
      return NextResponse.json({ error: 'app_slugs must be an array.' }, { status: 400 })
    }

    // Delete existing app access
    await serviceClient
      .from('user_apps')
      .delete()
      .eq('user_id', user_id)

    // Insert new app access
    if (app_slugs.length > 0) {
      const { error: insertError } = await serviceClient.from('user_apps').insert(
        app_slugs.map((slug: string) => ({
          user_id,
          app_slug: slug,
          granted_by: user.id,
        }))
      )

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, app_slugs })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
