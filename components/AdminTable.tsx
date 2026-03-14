'use client'

import { useState } from 'react'
import type { Referral, ReferralStatus } from '@/lib/types'
import CheckDetailView from './CheckDetailView'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatusBadge({ status }: { status: ReferralStatus }) {
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

interface AdminReferral extends Referral {
  recruiter_display_id?: string
}

async function updateReferral(id: string, updates: Record<string, unknown>) {
  const res = await fetch('/api/admin/update-referral', {
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
      <div className="text-center py-12 text-gray-500">
        <p>No referrals have been submitted yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="pb-3 pr-3 w-8"></th>
            <th className="pb-3 pr-3 font-medium">Recruiter</th>
            <th className="pb-3 pr-3 font-medium">Contractor</th>
            <th className="pb-3 pr-3 font-medium">HR Code</th>
            <th className="pb-3 pr-3 font-medium">Start Date</th>
            <th className="pb-3 pr-3 font-medium">Working Days</th>
            <th className="pb-3 pr-3 font-medium">Last Checked</th>
            <th className="pb-3 pr-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {referrals.map((r) => {
            const isEditingNotes = r.id in editingNotes
            const isExpanded = expandedId === r.id
            const hasDetail = !!r.last_check_snapshot
            return (
              <Fragment key={r.id}>
                <tr className={`border-b border-gray-100 align-top ${isExpanded ? 'bg-gray-50' : ''}`}>
                  <td className="py-3 pr-1">
                    {hasDetail && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="text-gray-400 hover:text-gray-700 w-6 h-6 flex items-center justify-center"
                        title="View working day breakdown"
                      >
                        <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                          &#9656;
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-gray-900">{r.recruiter_display_id ?? '—'}</td>
                  <td className="py-3 pr-3 text-gray-900">{r.recruited_name}</td>
                  <td className="py-3 pr-3 text-gray-900">{r.recruited_hr_code}</td>
                  <td className="py-3 pr-3 text-gray-900">{formatDate(r.start_date)}</td>
                  <td className="py-3 pr-3 text-gray-900">
                    {r.working_days_total != null ? (
                      <span
                        className={hasDetail ? 'cursor-pointer text-blue-600 hover:text-blue-800 underline decoration-dotted' : ''}
                        onClick={() => hasDetail && setExpandedId(isExpanded ? null : r.id)}
                      >
                        {r.working_days_total}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 pr-3 text-gray-900">
                    {r.last_checked_at ? formatDate(r.last_checked_at) : '—'}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-1">
                      <select
                        value={r.status}
                        onChange={(e) => handleStatusChange(r.id, e.target.value as ReferralStatus)}
                        disabled={savingId === r.id}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
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
                          className="rounded border border-gray-300 px-2 py-1 text-xs w-40"
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
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span
                        onClick={() => setEditingNotes((prev) => ({ ...prev, [r.id]: r.approval_notes ?? '' }))}
                        className="text-gray-900 cursor-pointer hover:text-blue-600"
                      >
                        {r.approval_notes || <span className="text-gray-400 italic">Click to add</span>}
                      </span>
                    )}
                  </td>
                </tr>
                {isExpanded && hasDetail && (
                  <tr className="bg-gray-50">
                    <td colSpan={9} className="px-6 py-4 border-b border-gray-200">
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
  )
}

import { Fragment } from 'react'
