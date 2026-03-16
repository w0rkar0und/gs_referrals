import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import ReportRunner from '@/components/reports/ReportRunner'

const ALL_REPORT_TYPES = ['deposit', 'working-days'] as const

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()

  const [{ data: profile }, { data: access }] = await Promise.all([
    serviceClient.from('profiles').select('is_admin').eq('id', user.id).single(),
    serviceClient.from('user_apps').select('permissions').eq('user_id', user.id).eq('app_slug', 'reports').limit(1),
  ])

  const isAdmin = profile?.is_admin ?? false

  // Admins get all report types; non-admins get only those in their permissions
  let allowedReports: string[]

  if (isAdmin) {
    allowedReports = [...ALL_REPORT_TYPES]
  } else {
    const perms = access?.[0]?.permissions as Record<string, boolean> | null
    allowedReports = ALL_REPORT_TYPES.filter((rt) => perms?.[rt] === true)
  }

  if (allowedReports.length === 0) {
    return (
      <div className="py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h1 className="text-xl font-semibold text-slate-900 mb-6">Reports</h1>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <p className="text-slate-500 text-sm">
              You do not have access to any report types. Please contact your administrator.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">Reports</h1>
        <ReportRunner allowedReports={allowedReports as ('deposit' | 'working-days')[]} />
      </div>
    </div>
  )
}
