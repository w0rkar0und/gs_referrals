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

  // Fetch all profiles and their app access
  const [{ data: profiles }, { data: allUserApps }] = await Promise.all([
    serviceClient.from('profiles').select('*').order('created_at', { ascending: false }),
    serviceClient.from('user_apps').select('user_id, app_slug'),
  ])

  // Build a map of user_id → app_slugs
  const appsByUser = new Map<string, string[]>()
  for (const ua of allUserApps ?? []) {
    const existing = appsByUser.get(ua.user_id) ?? []
    existing.push(ua.app_slug)
    appsByUser.set(ua.user_id, existing)
  }

  const usersWithApps = (profiles ?? []).map((p: { id: string; display_id: string; is_internal: boolean; is_admin: boolean; created_at: string }) => ({
    ...p,
    app_slugs: appsByUser.get(p.id) ?? [],
  }))

  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
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
