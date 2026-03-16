'use client'

import { useState } from 'react'
import DepositReport from '@/components/reports/DepositReport'
import WorkingDaysReport from '@/components/reports/WorkingDaysReport'
import WorkingDaysByClientReport from '@/components/reports/WorkingDaysByClientReport'

type ReportType = 'deposit' | 'working-days' | 'working-days-by-client'

const REPORT_LABELS: Record<ReportType, string> = {
  deposit: 'Deposit Report',
  'working-days': 'Deposit - Working Day Count',
  'working-days-by-client': 'Working Days by Client',
}

const REPORTS_WITHOUT_HR_CODE: ReportType[] = ['working-days-by-client']

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

  // Download/email state
  const [downloading, setDownloading] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const needsHrCode = !REPORTS_WITHOUT_HR_CODE.includes(reportType)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (needsHrCode) {
      const code = hrCode.trim().toUpperCase()
      if (!code) return
    }

    setLoading(true)
    setError(null)
    setReportData(null)
    setEmailSuccess(null)
    setActionError(null)

    try {
      const body = needsHrCode
        ? JSON.stringify({ hrCode: hrCode.trim().toUpperCase() })
        : JSON.stringify({})

      const res = await fetch(`/api/reports/${reportType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
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

  async function handleDownload() {
    if (!reportData || !activeReportType) return
    setDownloading(true)
    setActionError(null)

    try {
      const res = await fetch('/api/reports/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: activeReportType, reportData }),
      })

      if (!res.ok) {
        const err = await res.json()
        setActionError(err.error || 'Failed to download.')
        setDownloading(false)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'report.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setActionError('Failed to download report.')
    }

    setDownloading(false)
  }

  async function handleEmail() {
    if (!reportData || !activeReportType) return
    setEmailing(true)
    setActionError(null)
    setEmailSuccess(null)

    try {
      const res = await fetch('/api/reports/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: activeReportType,
          reportData,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setActionError(data.error || 'Failed to send email.')
        setEmailing(false)
        return
      }

      setEmailSuccess('Report sent to your email.')
    } catch {
      setActionError('Failed to send email.')
    }

    setEmailing(false)
  }

  return (
    <>
      {/* Report selector */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
        <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col sm:flex-row items-end gap-4">
          {needsHrCode && (
            <div className="w-full sm:w-48">
              <label htmlFor="hrCode" className="block text-sm font-medium text-slate-700 mb-1.5">
                HR Code
              </label>
              <input
                id="hrCode"
                type="text"
                value={hrCode}
                onChange={(e) => setHrCode(e.target.value)}
                required={needsHrCode}
                placeholder="e.g. X003663"
                pattern="[Xx]\d{6}"
                title="HR code format: X followed by 6 digits"
                className={inputClasses}
              />
            </div>
          )}
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

      {/* Actions bar — shown when report data is loaded */}
      {reportData && activeReportType && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {downloading ? 'Downloading...' : 'Download Excel'}
            </button>

            <button
              onClick={handleEmail}
              disabled={emailing}
              className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              {emailing ? 'Sending...' : 'Email to Me'}
            </button>

            {actionError && (
              <span className="text-sm text-red-600">{actionError}</span>
            )}
            {emailSuccess && (
              <span className="text-sm text-emerald-600">{emailSuccess}</span>
            )}
          </div>
        </div>
      )}

      {/* Report output */}
      {reportData && activeReportType === 'deposit' && (
        <DepositReport data={reportData} />
      )}
      {reportData && activeReportType === 'working-days' && (
        <WorkingDaysReport data={reportData} />
      )}
      {reportData && activeReportType === 'working-days-by-client' && (
        <WorkingDaysByClientReport data={reportData} />
      )}
    </>
  )
}
