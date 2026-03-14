import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import ReferralTable from '@/components/ReferralTable'

export default async function ReferralsPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: referrals } = await supabase
    .from('referrals')
    .select('*')
    .eq('recruiter_id', user.id)
    .order('submitted_at', { ascending: false })

  const params = await searchParams
  const justSubmitted = params.submitted === '1'

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Referrals</h1>
          <Link
            href="/submit"
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            Register New Referral
          </Link>
        </div>

        {justSubmitted && (
          <div className="mb-4 rounded bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            Referral submitted successfully.
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6">
          <ReferralTable referrals={referrals ?? []} />
        </div>
      </div>
    </div>
  )
}
