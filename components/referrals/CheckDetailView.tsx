'use client'

interface CheckRow {
  source: string
  year: number
  week: number
  week_start: string
  week_end: string
  contract_type: string
  shift_count: number
  working_days: number
}

interface CheckDetail {
  start_date_filter: string
  query_version: string
  first_rota_date: string | null
  start_date_discrepancy_days: number
  rows: CheckRow[]
}

function formatDate(dateStr: string): string {
  // Handle both YYYY-MM-DD and DD/MM/YYYY
  if (dateStr.includes('-')) {
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }
  return dateStr
}

export default function CheckDetailView({
  detail,
  checkedAt,
  workingDaysApproved,
  workingDaysProjected,
  workingDaysTotal,
}: {
  detail: CheckDetail
  checkedAt?: string
  workingDaysApproved?: number
  workingDaysProjected?: number
  workingDaysTotal?: number
}) {
  const approvedRows = detail.rows.filter((r) => r.source === 'Approved')
  const projectedRows = detail.rows.filter((r) => r.source !== 'Approved')

  const totalApproved = approvedRows.reduce((sum, r) => sum + r.working_days, 0)
  const totalProjected = projectedRows.reduce((sum, r) => sum + r.working_days, 0)
  const total = totalApproved + totalProjected

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-gray-500">
          Start date: <span className="text-gray-900 font-medium">{formatDate(detail.start_date_filter)}</span>
        </span>
        {detail.first_rota_date && (
          <span className="text-gray-500">
            First rota entry: <span className="text-gray-900 font-medium">{formatDate(detail.first_rota_date)}</span>
          </span>
        )}
        {detail.start_date_discrepancy_days > 7 && (
          <span className="text-amber-700 font-medium">
            Start date discrepancy: {detail.start_date_discrepancy_days} days
          </span>
        )}
        <span className="text-gray-500">
          Query: <span className="text-gray-900">{detail.query_version}</span>
        </span>
        {checkedAt && (
          <span className="text-gray-500">
            Checked: <span className="text-gray-900">
              {new Date(checkedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              {' '}
              {new Date(checkedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
        )}
      </div>

      {detail.rows.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No working days recorded.</p>
      ) : (
        <>
          {/* Approved debriefs */}
          {approvedRows.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Approved Debriefs</h4>
              <BreakdownTable rows={approvedRows} />
              <div className="text-right text-sm font-medium text-gray-900 mt-1 pr-1">
                Subtotal: {totalApproved.toFixed(1)} days
              </div>
            </div>
          )}

          {/* Projected rota */}
          {projectedRows.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rota (Projected)</h4>
              <BreakdownTable rows={projectedRows} />
              <div className="text-right text-sm font-medium text-gray-900 mt-1 pr-1">
                Subtotal: {totalProjected.toFixed(1)} days
              </div>
            </div>
          )}

          {/* Total */}
          <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
            <div className="flex gap-4 text-sm text-gray-500">
              <span>Approved: <span className="font-medium text-gray-900">{(workingDaysApproved ?? totalApproved).toFixed(1)}</span></span>
              <span>Projected: <span className="font-medium text-gray-900">{(workingDaysProjected ?? totalProjected).toFixed(1)}</span></span>
            </div>
            <div className="text-sm">
              <span className="font-semibold text-gray-900 text-base">
                Total: {(workingDaysTotal ?? total).toFixed(1)} days
              </span>
              {(workingDaysTotal ?? total) >= 30 ? (
                <span className="ml-2 text-green-700 font-medium">Threshold met</span>
              ) : (
                <span className="ml-2 text-amber-700 font-medium">
                  {(30 - (workingDaysTotal ?? total)).toFixed(1)} days remaining
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function BreakdownTable({ rows }: { rows: CheckRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 text-xs">
            <th className="pb-1 pr-3 font-medium">Week</th>
            <th className="pb-1 pr-3 font-medium">Period</th>
            <th className="pb-1 pr-3 font-medium">Contract Type</th>
            <th className="pb-1 pr-3 font-medium text-right">Shifts</th>
            <th className="pb-1 font-medium text-right">Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50">
              <td className="py-1.5 pr-3 text-gray-700">
                {r.year} W{r.week}
              </td>
              <td className="py-1.5 pr-3 text-gray-700">
                {r.week_start} — {r.week_end}
              </td>
              <td className="py-1.5 pr-3 text-gray-700">{r.contract_type}</td>
              <td className="py-1.5 pr-3 text-gray-700 text-right">{r.shift_count}</td>
              <td className="py-1.5 text-gray-900 text-right font-medium">{r.working_days.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
