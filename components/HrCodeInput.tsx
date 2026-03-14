'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Contractor } from '@/lib/types'

interface HrCodeInputProps {
  startDate: string
  onContractorFound: (contractor: Contractor | null) => void
  onError: (error: string | null) => void
}

export default function HrCodeInput({ startDate, onContractorFound, onError }: HrCodeInputProps) {
  const [hrCode, setHrCode] = useState('')
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const code = hrCode.trim().toUpperCase()
    if (!code) {
      onContractorFound(null)
      onError(null)
      return
    }

    if (!startDate) {
      onError(null)
      onContractorFound(null)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      onError(null)

      const { data, error: fetchError } = await supabase
        .from('contractors')
        .select('*')
        .eq('hr_code', code)
        .single()

      if (fetchError || !data) {
        onContractorFound(null)
        onError('HR code not found. Please check and try again.')
        setLoading(false)
        return
      }

      if (!data.is_active) {
        onContractorFound(null)
        onError('This contractor is not currently active.')
        setLoading(false)
        return
      }

      // REF-002: rehire within 6 months check
      if (data.last_worked_date && startDate) {
        const lastWorked = new Date(data.last_worked_date)
        const start = new Date(startDate)
        const diffDays = Math.floor((start.getTime() - lastWorked.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays < 180) {
          onContractorFound(null)
          onError(
            "This contractor's last recorded working day falls within six months of the submitted start date. " +
            "This referral cannot be accepted. If you believe this is an error, please contact SLT quoting reference REF-002."
          )
          setLoading(false)
          return
        }
      }

      onContractorFound(data)
      setLoading(false)
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [hrCode, startDate])

  return (
    <div>
      <label htmlFor="hr_code" className="block text-sm font-medium text-gray-700 mb-1">
        HR Code
      </label>
      {!startDate && (
        <p className="text-sm text-amber-600 mb-1">Please enter a start date first.</p>
      )}
      <div className="relative">
        <input
          id="hr_code"
          type="text"
          value={hrCode}
          onChange={(e) => setHrCode(e.target.value)}
          disabled={!startDate}
          placeholder="e.g. X123456"
          className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
        />
        {loading && (
          <span className="absolute right-3 top-2.5 text-sm text-gray-400">Checking...</span>
        )}
      </div>
    </div>
  )
}
