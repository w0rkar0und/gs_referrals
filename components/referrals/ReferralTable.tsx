'use client'

import { useState } from 'react'
import Link from 'next/link'
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

function QwyloStatus({ active, statusDate }: { active: boolean | null | undefined; statusDate: string | null | undefined }) {
  if (active == null) return <span className="text-slate-400">—</span>
  return (
    <div>
      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
          active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}
        title={statusDate ? `Status since: ${formatDate(statusDate)}` : ''}
      >
        {active ? 'Active' : 'Inactive'}
      </span>
      {statusDate && (
        <span className="block text-xs text-slate-400 mt-0.5">{formatDate(statusDate)}</span>
      )}
    </div>
  )
}

interface EnrichedReferral extends Referral {
  qwylo_active?: boolean | null
  qwylo_status_date?: string | null
}

function ReferralCard({ r }: { r: EnrichedReferral }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-medium text-slate-900">{r.recruited_name}</p>
          <p className="text-sm text-slate-500">{r.recruited_hr_code}</p>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <p className="text-slate-400 text-xs">Start Date</p>
          <p className="text-slate-700">{formatDate(r.start_date)}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs">Submitted</p>
          <p className="text-slate-700">{formatDate(r.submitted_at)}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs">Qwylo Status</p>
          <QwyloStatus active={r.qwylo_active} statusDate={r.qwylo_status_date} />
        </div>
      </div>
    </div>
  )
}

export default function ReferralTable({ referrals }: { referrals: EnrichedReferral[] }) {
  const [search, setSearch] = useState('')
  const filtered = referrals.filter((r) =>
    !search || r.recruited_hr_code.toLowerCase().includes(search.toLowerCase())
  )
  const { sorted, sortKey, sortDir, handleSort } = useSort(filtered, 'submitted_at', 'desc')

  if (referrals.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-1.997m0 0A8.961 8.961 0 0 1 12 15.75c-1.99 0-3.832.648-5.323 1.747" />
        </svg>
        <p className="text-slate-500 mb-3">You have no referrals registered yet.</p>
        <Link
          href="/referrals/submit"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Register your first referral
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} />
      </div>

      {/* Mobile: card layout */}
      <div className="sm:hidden space-y-3">
        {sorted.map((r) => (
          <ReferralCard key={r.id} r={r} />
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden sm:block overflow-x-auto">
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
                  <QwyloStatus active={r.qwylo_active} statusDate={r.qwylo_status_date} />
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
