import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import SyncStatusBanner from '@/components/SyncStatusBanner'
import AdminTable from '@/components/AdminTable'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()

  // Check admin
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/referrals')

  // Get last successful sync
  const { data: syncRows } = await serviceClient
    .from('sync_log')
    .select('*')
    .eq('status', 'success')
    .order('ran_at', { ascending: false })
    .limit(1)

  const lastSync = syncRows?.[0] ?? null

  // Get all referrals with recruiter display_id
  const { data: referrals } = await serviceClient
    .from('referrals')
    .select('*')
    .order('submitted_at', { ascending: false })

  // Get recruiter display IDs
  const recruiterIds = [...new Set((referrals ?? []).map((r: { recruiter_id: string }) => r.recruiter_id))]
  const { data: profiles } = recruiterIds.length > 0
    ? await serviceClient
        .from('profiles')
        .select('id, display_id')
        .in('id', recruiterIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map((p: { id: string; display_id: string }) => [p.id, p.display_id]))

  // Get contractor statuses
  const hrCodes = [...new Set((referrals ?? []).map((r: { recruited_hr_code: string }) => r.recruited_hr_code))]
  const { data: contractors } = hrCodes.length > 0
    ? await serviceClient
        .from('contractors')
        .select('hr_code, is_active, status_changed_at')
        .in('hr_code', hrCodes)
    : { data: [] }

  const contractorMap = new Map<string, { is_active: boolean; status_changed_at: string }>((contractors ?? []).map((c: { hr_code: string; is_active: boolean; status_changed_at: string }) => [c.hr_code, { is_active: c.is_active, status_changed_at: c.status_changed_at }]))

  const enrichedReferrals = (referrals ?? []).map((r: Record<string, unknown>) => {
    const contractor = contractorMap.get(r.recruited_hr_code as string)
    return {
      ...r,
      recruiter_display_id: profileMap.get(r.recruiter_id) ?? '—',
      qwylo_active: contractor?.is_active ?? null,
      qwylo_status_date: contractor?.status_changed_at ?? null,
    }
  })

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

        <SyncStatusBanner lastSync={lastSync} />

        <div className="bg-white rounded-lg shadow p-6">
          <AdminTable referrals={enrichedReferrals} />
        </div>
      </div>
    </div>
  )
}
