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

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-5xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Referral Checks</h1>
        <ChecksPanel
          pendingReferrals={pending ?? []}
          allReferrals={allReferrals ?? []}
        />
      </div>
    </div>
  )
}
