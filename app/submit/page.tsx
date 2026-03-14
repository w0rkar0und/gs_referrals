import ReferralForm from '@/components/ReferralForm'

export default function SubmitPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Register New Referral</h1>
          <ReferralForm />
        </div>
      </div>
    </div>
  )
}
