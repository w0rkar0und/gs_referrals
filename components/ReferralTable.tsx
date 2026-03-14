'use client'

import type { Referral } from '@/lib/types'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatusBadge({ status }: { status: Referral['status'] }) {
  const config = {
    pending: { label: 'Pending', classes: 'bg-gray-100 text-gray-700' },
    not_yet_eligible: { label: 'Not Yet Eligible', classes: 'bg-amber-100 text-amber-800' },
    approved: { label: 'Approved', classes: 'bg-green-100 text-green-800' },
  }
  const { label, classes } = config[status]
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}

export default function ReferralTable({ referrals }: { referrals: Referral[] }) {
  if (referrals.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>You have no referrals registered yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="pb-3 pr-4 font-medium">Contractor Name</th>
            <th className="pb-3 pr-4 font-medium">HR Code</th>
            <th className="pb-3 pr-4 font-medium">Start Date</th>
            <th className="pb-3 pr-4 font-medium">Submitted</th>
            <th className="pb-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {referrals.map((r) => (
            <tr key={r.id} className="border-b border-gray-100">
              <td className="py-3 pr-4 text-gray-900">{r.recruited_name}</td>
              <td className="py-3 pr-4 text-gray-900">{r.recruited_hr_code}</td>
              <td className="py-3 pr-4 text-gray-900">{formatDate(r.start_date)}</td>
              <td className="py-3 pr-4 text-gray-900">{formatDate(r.submitted_at)}</td>
              <td className="py-3"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
