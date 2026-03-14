'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import HrCodeInput from './HrCodeInput'
import type { Contractor } from '@/lib/types'

const inputClasses = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 focus:bg-white"

export default function ReferralForm() {
  const router = useRouter()
  const supabase = createClient()
  const [startDate, setStartDate] = useState('')
  const [contractor, setContractor] = useState<Contractor | null>(null)
  const [hrError, setHrError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)

  function validateStartDate(date: string): string | null {
    if (!date) return null
    const start = new Date(date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffDays = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > 7) {
      return (
        'The start date is more than 7 days before today. ' +
        'Referrals cannot be backdated beyond 7 days. ' +
        'If you believe this is an error, please contact SLT quoting reference REF-003.'
      )
    }
    return null
  }

  const canSubmit = contractor && startDate && !hrError && !dateError && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setSubmitError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSubmitError('You must be logged in to submit a referral.')
      setSubmitting(false)
      return
    }

    const { error } = await supabase.from('referrals').insert({
      recruiter_id: user.id,
      recruited_hr_code: contractor.hr_code,
      recruited_name: `${contractor.first_name} ${contractor.last_name}`,
      start_date: startDate,
    })

    if (error) {
      if (error.code === '23505') {
        setSubmitError(
          'This HR code has already been registered by another user. ' +
          'If you believe this is an error, please contact SLT quoting reference REF-001.'
        )
      } else {
        setSubmitError(error.message)
      }
      setSubmitting(false)
      return
    }

    router.push('/referrals?submitted=1')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="start_date" className="block text-sm font-medium text-slate-700 mb-1.5">
          Start Date
        </label>
        <input
          id="start_date"
          type="date"
          value={startDate}
          onChange={(e) => {
            const val = e.target.value
            setStartDate(val)
            setDateError(validateStartDate(val))
            setContractor(null)
            setHrError(null)
          }}
          required
          className={inputClasses}
        />
        {dateError && (
          <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700 mt-2">{dateError}</div>
        )}
      </div>

      <HrCodeInput
        startDate={startDate}
        onContractorFound={setContractor}
        onError={setHrError}
      />

      {hrError && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{hrError}</div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">
          Contractor Name
        </label>
        <input
          id="name"
          type="text"
          value={contractor ? `${contractor.first_name} ${contractor.last_name}` : ''}
          readOnly
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400"
          placeholder="Auto-populated from HR code"
        />
      </div>

      {submitError && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{submitError}</div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        {submitting ? 'Submitting...' : 'Submit Referral'}
      </button>
    </form>
  )
}
