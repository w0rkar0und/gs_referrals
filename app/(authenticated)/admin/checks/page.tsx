import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import ChecksPanel from './ChecksPanel'

export default async function AdminChecksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/referrals')

  // Get all non-approved referrals
  const { data: pending } = await serviceClient
    .from('referrals')
    .select('*')
    .neq('status', 'approved')
    .order('submitted_at', { ascending: true })

  // Get all referrals for the "check all" view
  const { data: allReferrals } = await serviceClient
    .from('referrals')
    .select('recruited_hr_code, recruited_name, status, working_days_total, last_checked_at, start_date')
    .order('submitted_at', { ascending: true })

  // Get contractor statuses
  const allHrCodes = [...new Set([
    ...(pending ?? []).map((r: { recruited_hr_code: string }) => r.recruited_hr_code),
    ...(allReferrals ?? []).map((r: { recruited_hr_code: string }) => r.recruited_hr_code),
  ])]
  const { data: contractors } = allHrCodes.length > 0
    ? await serviceClient
        .from('contractors')
        .select('hr_code, is_active, status_changed_at')
        .in('hr_code', allHrCodes)
    : { data: [] }

  const contractorMap = new Map<string, { is_active: boolean; status_changed_at: string }>((contractors ?? []).map((c: { hr_code: string; is_active: boolean; status_changed_at: string }) => [c.hr_code, { is_active: c.is_active, status_changed_at: c.status_changed_at }]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function enrichList(list: any[]) {
    return list.map((r: any) => {
      const c = contractorMap.get(r.recruited_hr_code as string)
      return { ...r, qwylo_active: c?.is_active ?? null, qwylo_status_date: c?.status_changed_at ?? null }
    })
  }

  return (
    <div className="py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">Referral Checks</h1>
        <ChecksPanel
          pendingReferrals={enrichList(pending ?? [])}
          allReferrals={enrichList(allReferrals ?? [])}
        />
      </div>
    </div>
  )
}
