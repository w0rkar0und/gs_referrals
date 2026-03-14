'use client'

import { useState } from 'react'
import SortableHeader, { useSort } from '@/components/SortableHeader'

interface Referral {
  recruited_hr_code: string
  recruited_name: string
  status: string
  working_days_total: number | null
  last_checked_at: string | null
  start_date: string
  qwylo_active?: boolean | null
  qwylo_status_date?: string | null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function daysSince(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    pending: { label: 'Pending', classes: 'bg-gray-100 text-gray-700' },
    not_yet_eligible: { label: 'Not Yet Eligible', classes: 'bg-amber-100 text-amber-800' },
    approved: { label: 'Approved', classes: 'bg-green-100 text-green-800' },
  }
  const { label, classes } = config[status] ?? { label: status, classes: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}

export default function ChecksPanel({
  pendingReferrals,
  allReferrals,
}: {
  pendingReferrals: Referral[]
  allReferrals: Referral[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  const displayList = showAll ? allReferrals : pendingReferrals
  const { sorted, sortKey, sortDir, handleSort } = useSort(displayList, 'start_date', 'asc')

  function toggleSelect(hrCode: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(hrCode)) next.delete(hrCode)
      else next.add(hrCode)
      return next
    })
  }

  function selectAllVisible() {
    setSelected(new Set(displayList.map((r) => r.recruited_hr_code)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  const selectedCodes = Array.from(selected).sort()

  // Build commands
  const singleCommand = selectedCodes.length > 0
    ? `python scripts/referral_check.py ${selectedCodes.join(' ')}`
    : null
  const allPendingCommand = `python scripts/referral_check.py --all`

  return (
    <div className="space-y-6">
      {/* Command panel */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Run Commands</h2>
        <p className="text-sm text-gray-500 mb-4">
          These commands must be run from a machine with Greythorn network access (e.g. via Claude Code or terminal).
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check all non-approved referrals</label>
            <div className="flex gap-2">
              <code className="flex-1 bg-gray-900 text-green-400 rounded px-4 py-2.5 text-sm font-mono select-all overflow-x-auto">
                {allPendingCommand}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(allPendingCommand)}
                className="shrink-0 bg-gray-100 text-gray-700 rounded px-3 py-2 text-sm hover:bg-gray-200"
              >
                Copy
              </button>
            </div>
          </div>

          {singleCommand && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Check selected ({selectedCodes.length})
              </label>
              <div className="flex gap-2">
                <code className="flex-1 bg-gray-900 text-green-400 rounded px-4 py-2.5 text-sm font-mono select-all overflow-x-auto whitespace-nowrap">
                  {singleCommand}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(singleCommand)}
                  className="shrink-0 bg-gray-100 text-gray-700 rounded px-3 py-2 text-sm hover:bg-gray-200"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Referrals table */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              {showAll ? 'All Referrals' : 'Pending / Not Yet Eligible'}
            </h2>
            <span className="text-sm text-gray-500">({displayList.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowAll(!showAll); clearSelection() }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showAll ? 'Show pending only' : 'Show all referrals'}
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={selectAllVisible} className="text-sm text-blue-600 hover:text-blue-800">
              Select all
            </button>
            <button onClick={clearSelection} className="text-sm text-gray-500 hover:text-gray-700">
              Clear
            </button>
          </div>
        </div>

        {displayList.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">No referrals to check.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-3 pr-3 w-8">
                    <input
                      type="checkbox"
                      checked={sorted.length > 0 && sorted.every((r) => selected.has(r.recruited_hr_code))}
                      onChange={(e) => e.target.checked ? selectAllVisible() : clearSelection()}
                    />
                  </th>
                  <SortableHeader label="HR Code" sortKey="recruited_hr_code" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Contractor" sortKey="recruited_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Qwylo Status" sortKey="qwylo_active" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Start Date" sortKey="start_date" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Working Days" sortKey="working_days_total" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Last Checked" sortKey="last_checked_at" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.recruited_hr_code}
                    className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                      selected.has(r.recruited_hr_code) ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => toggleSelect(r.recruited_hr_code)}
                  >
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(r.recruited_hr_code)}
                        onChange={() => toggleSelect(r.recruited_hr_code)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="py-3 pr-3 text-gray-900 font-mono">{r.recruited_hr_code}</td>
                    <td className="py-3 pr-3 text-gray-900">{r.recruited_name}</td>
                    <td className="py-3 pr-3">
                      {r.qwylo_active != null ? (
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            r.qwylo_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                          title={r.qwylo_status_date ? `Synced: ${formatDate(r.qwylo_status_date)}` : ''}
                        >
                          {r.qwylo_active ? 'Active' : 'Inactive'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-3 pr-3 text-gray-900">{formatDate(r.start_date)}</td>
                    <td className="py-3 pr-3"><StatusBadge status={r.status} /></td>
                    <td className="py-3 pr-3 text-gray-900">{r.working_days_total ?? '—'}</td>
                    <td className="py-3 text-gray-500 text-xs">{daysSince(r.last_checked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
