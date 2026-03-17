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

  // Prevent admins from modifying themselves for destructive actions
  if (['toggle_admin', 'deactivate'].includes(action) && user_id === user.id) {
    return NextResponse.json({ error: 'You cannot perform this action on your own account.' }, { status: 400 })
  }

  if (action === 'edit_profile') {
    const { display_id, full_name, email, is_internal } = params

    const update: Record<string, unknown> = {}
    if (display_id !== undefined) update.display_id = display_id
    if (full_name !== undefined) update.full_name = full_name || null
    if (email !== undefined) update.email = email || null
    if (is_internal !== undefined) update.is_internal = is_internal

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })
    }

    const { error: updateError } = await serviceClient
      .from('profiles')
      .update(update)
      .eq('id', user_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { data: updated } = await serviceClient
      .from('profiles')
      .select('*')
      .eq('id', user_id)
      .single()

    return NextResponse.json({ ok: true, profile: updated })
  }

  if (action === 'toggle_active') {
    const { data: target } = await serviceClient
      .from('profiles')
      .select('is_active')
      .eq('id', user_id)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }

    const newActive = !target.is_active

    // Update profile
    const { error: updateError } = await serviceClient
      .from('profiles')
      .update({ is_active: newActive })
      .eq('id', user_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Ban/unban in Supabase Auth
    if (newActive) {
      await serviceClient.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
    } else {
      await serviceClient.auth.admin.updateUserById(user_id, { ban_duration: '876000h' })
    }

    return NextResponse.json({ ok: true, is_active: newActive })
  }

  if (action === 'delete_user') {
    // Delete from Supabase Auth (cascades to profiles and user_apps via FK)
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user_id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
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

  if (action === 'reset_password') {
    const { password: newPassword } = params

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    const { error: resetError } = await serviceClient.auth.admin.updateUserById(user_id, {
      password: newPassword,
    })

    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (action === 'update_apps') {
    const { app_slugs, app_permissions } = params

    if (!Array.isArray(app_slugs)) {
      return NextResponse.json({ error: 'app_slugs must be an array.' }, { status: 400 })
    }

    // Delete existing app access
    await serviceClient
      .from('user_apps')
      .delete()
      .eq('user_id', user_id)

    // Insert new app access with permissions
    if (app_slugs.length > 0) {
      const permsMap = app_permissions as Record<string, Record<string, boolean>> | undefined
      const { error: insertError } = await serviceClient.from('user_apps').insert(
        app_slugs.map((slug: string) => ({
          user_id,
          app_slug: slug,
          granted_by: user.id,
          permissions: permsMap?.[slug] ?? null,
        }))
      )

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    // Fetch back the saved access for the response
    const { data: savedAccess } = await serviceClient
      .from('user_apps')
      .select('app_slug, permissions')
      .eq('user_id', user_id)

    const appAccess = (savedAccess ?? []).map((ua: { app_slug: string; permissions: Record<string, boolean> | null }) => ({
      slug: ua.app_slug,
      permissions: ua.permissions,
    }))

    return NextResponse.json({ ok: true, app_slugs, app_access: appAccess })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
