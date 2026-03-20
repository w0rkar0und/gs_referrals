import ReferralForm from '@/components/referrals/ReferralForm'

export default function SubmitPage() {
  return (
    <div className="py-8">
      <div className="max-w-lg mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-8">
          <h1 className="text-xl font-semibold text-slate-900 mb-6">Register New Referral</h1>
          <ReferralForm />
        </div>
      </div>
    </div>
  )
}
