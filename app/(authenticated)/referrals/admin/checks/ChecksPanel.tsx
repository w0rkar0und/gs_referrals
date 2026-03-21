'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SortableHeader, { useSort } from '@/components/referrals/SortableHeader'
import SearchInput from '@/components/referrals/SearchInput'

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

interface CheckResult {
  hr_code: string
  name: string
  outcome: 'approved' | 'not_yet_eligible' | 'skipped' | 'error'
  working_days_total?: number
  days_remaining?: number
  discrepancy?: boolean
  reason?: string
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
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkResults, setCheckResults] = useState<CheckResult[] | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  const displayList = showAll ? allReferrals : pendingReferrals
  const filtered = displayList.filter((r) =>
    !search || r.recruited_hr_code.toLowerCase().includes(search.toLowerCase())
  )
  const { sorted, sortKey, sortDir, handleSort } = useSort(filtered, 'start_date', 'asc')

  function toggleSelect(hrCode: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(hrCode)) {
        next.delete(hrCode)
      } else if (next.size < 4) {
        next.add(hrCode)
      }
      return next
    })
  }

  async function runCheck() {
    setChecking(true)
    setCheckError(null)
    setCheckResults(null)
    try {
      const res = await fetch('/api/referrals/admin/run-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hrCodes: Array.from(selected) }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Check failed')
      }
      const data = await res.json()
      setCheckResults(data.results)
      router.refresh()
    } catch (e: unknown) {
      setCheckError(e instanceof Error ? e.message : 'Check failed')
    } finally {
      setChecking(false)
    }
  }

  function selectAllVisible() {
    const codes = sorted.map((r) => r.recruited_hr_code).slice(0, 4)
    setSelected(new Set(codes))
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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Run Commands</h2>
        <p className="text-sm text-gray-500 mb-4">
          These commands must be run from a machine with Greythorn network access (e.g. via Claude Code or terminal).
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">1. Contractor sync (run first to update statuses)</label>
            <div className="flex gap-2">
              <code className="flex-1 bg-slate-900 text-emerald-400 rounded-lg px-4 py-2.5 text-sm font-mono select-all overflow-x-auto">
                python scripts/contractor_sync.py
              </code>
              <button
                onClick={() => navigator.clipboard.writeText('python scripts/contractor_sync.py')}
                className="shrink-0 bg-gray-100 text-gray-700 rounded px-3 py-2 text-sm hover:bg-gray-200"
              >
                Copy
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">2. Check all non-approved referrals</label>
            <div className="flex gap-2">
              <code className="flex-1 bg-slate-900 text-emerald-400 rounded-lg px-4 py-2.5 text-sm font-mono select-all overflow-x-auto">
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
                3. Check selected ({selectedCodes.length}) — copy command
              </label>
              <div className="flex gap-2">
                <code className="flex-1 bg-slate-900 text-emerald-400 rounded-lg px-4 py-2.5 text-sm font-mono select-all overflow-x-auto whitespace-nowrap">
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

        {/* Run Check button */}
        <div className="mt-5 pt-5 border-t border-slate-200">
          <div className="flex items-center gap-4">
            <button
              onClick={runCheck}
              disabled={selected.size === 0 || checking}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors ${
                selected.size === 0 || checking
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {checking ? 'Running…' : selected.size > 0 ? `Run Check (${selected.size})` : 'Run Check'}
            </button>
            <span className="text-xs text-gray-500">
              {selected.size === 0
                ? 'Select 1–4 referrals to run a check'
                : selected.size >= 4
                ? 'Maximum 4 selected'
                : `${selected.size} selected, up to 4`}
            </span>
          </div>

          {/* Check results */}
          {checkError && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              {checkError}
            </div>
          )}

          {checkResults && checkResults.length > 0 && (
            <div className="mt-4 space-y-2">
              {checkResults.map((r) => (
                <div
                  key={r.hr_code}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                    r.outcome === 'approved'
                      ? 'bg-green-50 border-green-200'
                      : r.outcome === 'not_yet_eligible'
                      ? 'bg-amber-50 border-amber-200'
                      : r.outcome === 'error'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium text-gray-900">{r.hr_code}</span>
                    <span className="text-gray-700">{r.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    {r.working_days_total != null && (
                      <span className="text-gray-600">
                        {r.working_days_total.toFixed(1)} days
                        {r.outcome === 'not_yet_eligible' && r.days_remaining != null && (
                          <span className="text-amber-700 ml-1">({r.days_remaining.toFixed(1)} remaining)</span>
                        )}
                      </span>
                    )}
                    {r.discrepancy && (
                      <span className="text-xs text-red-600 font-medium" title="Start date discrepancy > 7 days">Discrepancy</span>
                    )}
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      r.outcome === 'approved' ? 'bg-green-100 text-green-800'
                      : r.outcome === 'not_yet_eligible' ? 'bg-amber-100 text-amber-800'
                      : r.outcome === 'error' ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-700'
                    }`}>
                      {r.outcome === 'approved' ? 'Approved'
                      : r.outcome === 'not_yet_eligible' ? 'Not Yet Eligible'
                      : r.outcome === 'error' ? 'Error'
                      : 'Skipped'}
                    </span>
                    {r.reason && <span className="text-xs text-gray-500">{r.reason}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Referrals table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              {showAll ? 'All Referrals' : 'Pending / Not Yet Eligible'}
            </h2>
            <span className="text-sm text-slate-500">({filtered.length})</span>
          </div>
          <div className="flex items-center gap-3">
            <SearchInput value={search} onChange={setSearch} />
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowAll(!showAll); clearSelection() }}
                className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap"
              >
                {showAll ? 'Pending only' : 'Show all'}
              </button>
              <span className="text-slate-300">|</span>
              <button onClick={selectAllVisible} className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap">
                Select all
              </button>
              <button onClick={clearSelection} className="text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap">
                Clear
              </button>
            </div>
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
