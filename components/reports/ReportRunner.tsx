'use client'

import { useState } from 'react'
import DepositReport from '@/components/reports/DepositReport'
import WorkingDaysReport from '@/components/reports/WorkingDaysReport'

type ReportType = 'deposit' | 'working-days'

const REPORT_LABELS: Record<ReportType, string> = {
  deposit: 'Deposit Report',
  'working-days': 'Working Day Count',
}

const inputClasses = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 focus:bg-white uppercase"

interface Props {
  allowedReports: ReportType[]
}

export default function ReportRunner({ allowedReports }: Props) {
  const [hrCode, setHrCode] = useState('')
  const [reportType, setReportType] = useState<ReportType>(allowedReports[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reportData, setReportData] = useState<any>(null)
  const [activeReportType, setActiveReportType] = useState<ReportType | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = hrCode.trim().toUpperCase()
    if (!code) return

    setLoading(true)
    setError(null)
    setReportData(null)

    try {
      const res = await fetch(`/api/reports/${reportType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hrCode: code }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to generate report.')
        setLoading(false)
        return
      }

      setReportData(data)
      setActiveReportType(reportType)
    } catch {
      setError('Failed to connect to the report service.')
    }

    setLoading(false)
  }

  return (
    <>
      {/* Report selector */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
        <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col sm:flex-row items-end gap-4">
          <div className="w-full sm:w-48">
            <label htmlFor="hrCode" className="block text-sm font-medium text-slate-700 mb-1.5">
              HR Code
            </label>
            <input
              id="hrCode"
              type="text"
              value={hrCode}
              onChange={(e) => setHrCode(e.target.value)}
              required
              placeholder="e.g. X003663"
              pattern="[Xx]\d{6}"
              title="HR code format: X followed by 6 digits"
              className={inputClasses}
            />
          </div>
          <div className="w-full sm:w-56">
            <label htmlFor="reportType" className="block text-sm font-medium text-slate-700 mb-1.5">
              Report Type
            </label>
            <select
              id="reportType"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 focus:bg-white"
            >
              {allowedReports.map((rt) => (
                <option key={rt} value={rt}>{REPORT_LABELS[rt]}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] whitespace-nowrap"
          >
            {loading ? 'Generating...' : 'Run Report'}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
      </div>

      {/* Report output */}
      {reportData && activeReportType === 'deposit' && (
        <DepositReport data={reportData} />
      )}
      {reportData && activeReportType === 'working-days' && (
        <WorkingDaysReport data={reportData} />
      )}
    </>
  )
}
