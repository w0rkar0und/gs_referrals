import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ReferralTable from '@/components/referrals/ReferralTable'
import SuccessToast from '@/components/referrals/SuccessToast'

export default async function ReferralsPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: referrals } = await supabase
    .from('referrals')
    .select('*')
    .eq('recruiter_id', user.id)
    .order('submitted_at', { ascending: false })

  // Get contractor statuses
  const hrCodes = [...new Set((referrals ?? []).map((r: { recruited_hr_code: string }) => r.recruited_hr_code))]
  const { data: contractors } = hrCodes.length > 0
    ? await supabase
        .from('contractors')
        .select('hr_code, is_active, status_changed_at')
        .in('hr_code', hrCodes)
    : { data: [] }

  const contractorMap = new Map<string, { is_active: boolean; status_changed_at: string }>((contractors ?? []).map((c: { hr_code: string; is_active: boolean; status_changed_at: string }) => [c.hr_code, { is_active: c.is_active, status_changed_at: c.status_changed_at }]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrichedReferrals = (referrals ?? []).map((r: any) => {
    const contractor = contractorMap.get(r.recruited_hr_code as string)
    return {
      ...r,
      qwylo_active: contractor?.is_active ?? null,
      qwylo_status_date: contractor?.status_changed_at ?? null,
    }
  })

  const params = await searchParams
  const justSubmitted = params.submitted === '1'

  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">My Referrals</h1>

        {justSubmitted && (
          <SuccessToast message="Referral submitted successfully." />
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <ReferralTable referrals={enrichedReferrals} />
        </div>
      </div>
    </div>
  )
}
