'use client'

import { useState } from 'react'
import type { Referral, ReferralStatus } from '@/lib/types'
import CheckDetailView from './CheckDetailView'
import SortableHeader, { useSort } from './SortableHeader'
import SearchInput from './SearchInput'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatusBadge({ status }: { status: ReferralStatus }) {
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

interface AdminReferral extends Referral {
  recruiter_display_id?: string
  qwylo_active?: boolean | null
  qwylo_status_date?: string | null
}

async function updateReferral(id: string, updates: Record<string, unknown>) {
  const res = await fetch('/api/referrals/admin/update-referral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  })
  if (!res.ok) throw new Error('Update failed')
  return res.json()
}

export default function AdminTable({ referrals: initialReferrals }: { referrals: AdminReferral[] }) {
  const [referrals, setReferrals] = useState(initialReferrals)
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const filtered = referrals.filter((r) =>
    !search || r.recruited_hr_code.toLowerCase().includes(search.toLowerCase())
  )
  const { sorted, sortKey, sortDir, handleSort } = useSort(filtered, 'submitted_at', 'desc')

  async function handleStatusChange(id: string, newStatus: ReferralStatus) {
    setSavingId(id)
    try {
      const updates: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'approved') {
        updates.approved_at = new Date().toISOString()
      }
      await updateReferral(id, updates)
      setReferrals((prev) =>
        prev.map((r) => r.id === id ? { ...r, status: newStatus, ...(newStatus === 'approved' ? { approved_at: new Date().toISOString() } : {}) } : r)
      )
    } catch {
      alert('Failed to update status.')
    }
    setSavingId(null)
  }

  async function handleReset(id: string) {
    if (!confirm('Reset this referral to pending? This clears all check data and approval status.')) return
    setSavingId(id)
    try {
      await updateReferral(id, {
        status: 'pending',
        working_days_approved: null,
        working_days_projected: null,
        working_days_total: null,
        last_checked_at: null,
        last_check_snapshot: null,
        approved_at: null,
        query_version: null,
      })
      setReferrals((prev) =>
        prev.map((r) => r.id === id ? {
          ...r,
          status: 'pending' as ReferralStatus,
          working_days_approved: null,
          working_days_projected: null,
          working_days_total: null,
          last_checked_at: null,
          last_check_snapshot: null,
          approved_at: null,
          query_version: null,
        } : r)
      )
      if (expandedId === id) setExpandedId(null)
    } catch {
      alert('Failed to reset referral.')
    }
    setSavingId(null)
  }

  async function handleNotesSave(id: string) {
    setSavingId(id)
    try {
      await updateReferral(id, { approval_notes: editingNotes[id] ?? '' })
      setReferrals((prev) =>
        prev.map((r) => r.id === id ? { ...r, approval_notes: editingNotes[id] ?? '' } : r)
      )
      setEditingNotes((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } catch {
      alert('Failed to save notes.')
    }
    setSavingId(null)
  }

  if (referrals.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>No referrals have been submitted yet.</p>
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
            <th className="pb-3 pr-3 w-8"></th>
            <SortableHeader label="Recruiter" sortKey="recruiter_display_id" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Contractor" sortKey="recruited_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="HR Code" sortKey="recruited_hr_code" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Qwylo Status" sortKey="qwylo_active" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Start Date" sortKey="start_date" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Working Days" sortKey="working_days_total" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Last Checked" sortKey="last_checked_at" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <th className="pb-3 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isEditingNotes = r.id in editingNotes
            const isExpanded = expandedId === r.id
            const hasDetail = !!r.last_check_snapshot
            return (
              <Fragment key={r.id}>
                <tr className={`border-b border-slate-100 align-top ${isExpanded ? 'bg-slate-50' : ''}`}>
                  <td className="py-3 pr-1">
                    {hasDetail && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="text-slate-400 hover:text-gray-700 w-6 h-6 flex items-center justify-center"
                        title="View working day breakdown"
                      >
                        <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                          &#9656;
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-slate-900">{r.recruiter_display_id ?? '—'}</td>
                  <td className="py-3 pr-3 text-slate-900">{r.recruited_name}</td>
                  <td className="py-3 pr-3 text-slate-900">{r.recruited_hr_code}</td>
                  <td className="py-3 pr-3">
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
                  <td className="py-3 pr-3 text-slate-900">{formatDate(r.start_date)}</td>
                  <td className="py-3 pr-3 text-slate-900">
                    {r.working_days_total != null ? (
                      <span
                        className={hasDetail ? 'cursor-pointer text-blue-600 hover:text-blue-800 underline decoration-dotted' : ''}
                        onClick={() => hasDetail && setExpandedId(isExpanded ? null : r.id)}
                      >
                        {r.working_days_total}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 pr-3 text-slate-900">
                    {r.last_checked_at ? formatDate(r.last_checked_at) : '—'}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-1">
                      <select
                        value={r.status}
                        onChange={(e) => handleStatusChange(r.id, e.target.value as ReferralStatus)}
                        disabled={savingId === r.id}
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                      >
                        <option value="pending">Pending</option>
                        <option value="not_yet_eligible">Not Yet Eligible</option>
                        <option value="approved">Approved</option>
                      </select>
                      {(r.status !== 'pending' || r.last_checked_at) && (
                        <button
                          onClick={() => handleReset(r.id)}
                          disabled={savingId === r.id}
                          className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap"
                          title="Reset to pending and clear all check data"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    {isEditingNotes ? (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={editingNotes[r.id]}
                          onChange={(e) => setEditingNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          className="rounded border border-slate-200 px-2 py-1 text-xs w-40"
                        />
                        <button
                          onClick={() => handleNotesSave(r.id)}
                          disabled={savingId === r.id}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingNotes((prev) => {
                            const next = { ...prev }
                            delete next[r.id]
                            return next
                          })}
                          className="text-xs text-slate-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span
                        onClick={() => setEditingNotes((prev) => ({ ...prev, [r.id]: r.approval_notes ?? '' }))}
                        className="text-slate-900 cursor-pointer hover:text-blue-600"
                      >
                        {r.approval_notes || <span className="text-slate-400 italic">Click to add</span>}
                      </span>
                    )}
                  </td>
                </tr>
                {isExpanded && hasDetail && (
                  <tr className="bg-slate-50">
                    <td colSpan={10} className="px-6 py-4 border-b border-slate-200">
                      <CheckDetailView
                        detail={r.last_check_snapshot as never}
                        checkedAt={r.last_checked_at ?? undefined}
                        workingDaysApproved={r.working_days_approved ?? undefined}
                        workingDaysProjected={r.working_days_projected ?? undefined}
                        workingDaysTotal={r.working_days_total ?? undefined}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

import { Fragment } from 'react'
