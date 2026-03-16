import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { APPS } from '@/lib/apps'
import PlatformUserManagement from '@/components/platform/PlatformUserManagement'

export default async function PlatformAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/apps')

  // Fetch all profiles and their app access (including permissions)
  const [{ data: profiles }, { data: allUserApps }] = await Promise.all([
    serviceClient.from('profiles').select('*').order('created_at', { ascending: false }),
    serviceClient.from('user_apps').select('user_id, app_slug, permissions'),
  ])

  // Build maps per user
  const appsByUser = new Map<string, string[]>()
  const accessByUser = new Map<string, { slug: string; permissions: Record<string, boolean> | null }[]>()

  for (const ua of allUserApps ?? []) {
    // app_slugs list
    const slugs = appsByUser.get(ua.user_id) ?? []
    slugs.push(ua.app_slug)
    appsByUser.set(ua.user_id, slugs)

    // full access with permissions
    const access = accessByUser.get(ua.user_id) ?? []
    access.push({ slug: ua.app_slug, permissions: ua.permissions ?? null })
    accessByUser.set(ua.user_id, access)
  }

  const usersWithApps = (profiles ?? []).map((p: { id: string; display_id: string; full_name: string | null; email: string | null; is_internal: boolean; is_admin: boolean; is_active: boolean | null; created_at: string }) => ({
    ...p,
    app_slugs: appsByUser.get(p.id) ?? [],
    app_access: accessByUser.get(p.id) ?? [],
  }))

  return (
    <div className="py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">User Management</h1>
        <PlatformUserManagement
          initialUsers={usersWithApps}
          allApps={APPS}
          currentUserId={user.id}
        />
      </div>
    </div>
  )
}
