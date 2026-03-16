'use client'

import { useState } from 'react'
import type { Referral } from '@/lib/types'
import SortableHeader, { useSort } from './SortableHeader'
import SearchInput from './SearchInput'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatusBadge({ status }: { status: Referral['status'] }) {
  const config = {
    pending: { label: 'Pending', classes: 'bg-slate-100 text-slate-600' },
    not_yet_eligible: { label: 'Not Yet Eligible', classes: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200' },
    approved: { label: 'Approved', classes: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' },
  }
  const { label, classes } = config[status]
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}

interface EnrichedReferral extends Referral {
  qwylo_active?: boolean | null
  qwylo_status_date?: string | null
}

export default function ReferralTable({ referrals }: { referrals: EnrichedReferral[] }) {
  const [search, setSearch] = useState('')
  const filtered = referrals.filter((r) =>
    !search || r.recruited_hr_code.toLowerCase().includes(search.toLowerCase())
  )
  const { sorted, sortKey, sortDir, handleSort } = useSort(filtered, 'submitted_at', 'desc')

  if (referrals.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>You have no referrals registered yet.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} />
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <SortableHeader label="Contractor Name" sortKey="recruited_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="pr-4" />
            <SortableHeader label="HR Code" sortKey="recruited_hr_code" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="pr-4" />
            <SortableHeader label="Qwylo Status" sortKey="qwylo_active" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="pr-4" />
            <SortableHeader label="Start Date" sortKey="start_date" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="pr-4" />
            <SortableHeader label="Submitted" sortKey="submitted_at" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="pr-4" />
            <SortableHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0">
              <td className="py-3 pr-4 text-slate-900">{r.recruited_name}</td>
              <td className="py-3 pr-4 text-slate-900">{r.recruited_hr_code}</td>
              <td className="py-3 pr-4">
                {r.qwylo_active != null ? (
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      r.qwylo_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                    title={r.qwylo_status_date ? `Status since: ${formatDate(r.qwylo_status_date)}` : ''}
                  >
                    {r.qwylo_active ? 'Active' : 'Inactive'}
                  </span>
                ) : '—'}
                {r.qwylo_status_date && (
                  <span className="block text-xs text-slate-400 mt-0.5">{formatDate(r.qwylo_status_date)}</span>
                )}
              </td>
              <td className="py-3 pr-4 text-slate-900">{formatDate(r.start_date)}</td>
              <td className="py-3 pr-4 text-slate-900">{formatDate(r.submitted_at)}</td>
              <td className="py-3"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
