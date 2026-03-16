import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { APPS } from '@/lib/apps'
import Link from 'next/link'

const APP_ICONS: Record<string, React.ReactNode> = {
  referrals: (
    <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-1.997m0 0A8.961 8.961 0 0 1 12 15.75c-1.99 0-3.832.648-5.323 1.747" />
    </svg>
  ),
  generic: (
    <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  ),
}

export default async function AppsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()

  const [{ data: profile }, { data: userApps }] = await Promise.all([
    serviceClient.from('profiles').select('display_id, is_admin').eq('id', user.id).single(),
    serviceClient.from('user_apps').select('app_slug').eq('user_id', user.id),
  ])

  const isAdmin = profile?.is_admin ?? false
  const grantedSlugs = new Set((userApps ?? []).map((ua: { app_slug: string }) => ua.app_slug))

  // Admins see all apps; non-admins see only granted apps
  const visibleApps = APPS.filter((app) => isAdmin || grantedSlugs.has(app.slug))

  return (
    <div className="py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold text-slate-900">GS Apps</h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back, {profile?.display_id ?? 'user'}
          </p>
        </div>

        {visibleApps.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-sm">
              You do not have access to any applications. Please contact your administrator.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleApps.map((app) => (
              <Link
                key={app.slug}
                href={app.basePath}
                className="group bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md hover:border-slate-300 transition-all"
              >
                <div className="mb-4">
                  <div className="w-14 h-14 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                    {APP_ICONS[app.icon] ?? APP_ICONS.generic}
                  </div>
                </div>
                <h2 className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                  {app.name}
                </h2>
                <p className="text-sm text-slate-500 mt-1">{app.description}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
