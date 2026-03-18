'use client'

import { useState } from 'react'

interface Transaction {
  ContractorVehicleDepositTransactionId: number
  Amount: number
  Date: string
  CreatedBy: string | null
}

interface Deposit {
  ContractorVehicleDepositId: number
  DepositAmount: number
  DepositWeeks: number
  IsCancelled: string
  CreatedDate: string
  CreatedBy: string | null
  UpdatedDate: string | null
  UpdatedBy: string | null
  CancelledDate: string | null
  CancelledBy: string | null
}

interface Vehicle {
  VRM: string
  Model: string | null
  Make: string | null
  Supplier: string
  VehicleSupplierId: number | null
  FromDate: string
  ToDate: string | null
}

interface Charge {
  VRM: string
  Reason: string
  Reference: string | null
  IssueDate: string
  Charged: number
  Paid: number
  Outstanding: number
}

interface DepositReturn {
  Amount: number
  Date: string
  IsDeleted: boolean
  CreatedBy: string | null
  CreatedDate: string
}

interface Contractor {
  ContractorId: number
  HrCode: string
  FirstName: string
  LastName: string
  Email: string | null
  PhoneNumber: string | null
}

interface DepositReportData {
  contractor: Contractor | null
  deposit: Deposit | null
  transactions: Transaction[]
  vehicles: Vehicle[]
  charges: Charge[]
  depositReturns: DepositReturn[]
}

const tableHeader = "text-xs font-medium text-slate-500 uppercase tracking-wide"
const cellClass = "py-2.5 px-4 text-sm text-slate-700"

function currency(val: number): string {
  return val.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}

function CollapsibleSection({ title, collapsedSummary, defaultOpen = true, children }: { title: string; collapsedSummary?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left text-sm font-semibold text-white bg-[#2E75B6] px-4 py-2 flex items-center justify-between rounded-t-lg"
      >
        <span className="flex items-center gap-3">
          {title}
          {!open && collapsedSummary && (
            <span className="font-normal text-xs text-blue-100/80">{collapsedSummary}</span>
          )}
        </span>
        <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && children}
    </div>
  )
}

export default function DepositReport({ data }: { data: DepositReportData }) {
  const { contractor, deposit, transactions, vehicles, charges, depositReturns } = data

  if (!contractor) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
        Contractor not found. Please check the HR code and try again.
      </div>
    )
  }

  // Derived values for deposit section summary
  const totalCollected = transactions.reduce((s, t) => s + t.Amount, 0)
  const weeksPaid = transactions.length
  const weeksRemaining = deposit ? deposit.DepositWeeks - weeksPaid : 0
  const amountRemaining = deposit ? deposit.DepositAmount - totalCollected : 0
  const instalmentSummary = deposit && transactions.length > 0
    ? `${weeksPaid} of ${deposit.DepositWeeks} weeks paid — ${currency(amountRemaining)} remaining (${weeksRemaining} weeks)`
    : undefined

  // Derived values for vehicle section summary
  const greythornVehicleCount = vehicles.filter(v => v.VehicleSupplierId === 2).length
  const vehicleSummaryParts: string[] = []
  if (vehicles.length > 0) {
    vehicleSummaryParts.push(`${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''}`)
    if (greythornVehicleCount > 0) vehicleSummaryParts.push(`${greythornVehicleCount} Greythorn`)
  }
  const vehicleSummary = vehicleSummaryParts.length > 0 ? vehicleSummaryParts.join(' · ') : undefined

  // Derived values for charges section summary
  const partialPaidCount = charges.filter(ch => ch.Paid > 0 && ch.Outstanding > 0).length
  const unpaidCount = charges.filter(ch => ch.Paid === 0 && ch.Outstanding > 0).length
  const totalOutstanding = charges.reduce((s, c) => s + c.Outstanding, 0)
  const chargeSummaryParts: string[] = []
  if (partialPaidCount > 0) chargeSummaryParts.push(`${partialPaidCount} partial paid`)
  if (unpaidCount > 0) chargeSummaryParts.push(`${unpaidCount} unpaid`)
  if (totalOutstanding > 0) chargeSummaryParts.push(`${currency(totalOutstanding)} outstanding`)
  const chargeSummary = chargeSummaryParts.length > 0 ? chargeSummaryParts.join(' · ') : undefined

  // Derived values for deposit return summary
  const activeReturns = depositReturns.filter(dr => !dr.IsDeleted)
  const totalReturned = activeReturns.reduce((s, dr) => s + dr.Amount, 0)
  const returnSummaryParts: string[] = []
  if (depositReturns.length > 0) {
    returnSummaryParts.push(`${activeReturns.length} return${activeReturns.length !== 1 ? 's' : ''}`)
    if (totalReturned > 0) returnSummaryParts.push(`${currency(totalReturned)} total`)
  }
  const returnSummary = returnSummaryParts.length > 0 ? returnSummaryParts.join(' · ') : undefined

  return (
    <div className="space-y-6">
      {/* Contractor header */}
      <div className="bg-[#1F3864] rounded-lg px-5 py-4 text-white">
        <h2 className="text-lg font-semibold">Deposit Report</h2>
        <p className="text-blue-200 text-sm mt-1">
          {contractor.HrCode} — {contractor.FirstName} {contractor.LastName}
          {contractor.Email && <span className="ml-3 text-blue-300">{contractor.Email}</span>}
        </p>
      </div>

      {/* Section 1: Last Deposit Record */}
      <CollapsibleSection title="Last Deposit Record">
        {!deposit ? (
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">No deposit records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Amount</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Weeks</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Status</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Created</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Created By</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Updated</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Updated By</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Cancelled</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Cancelled By</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className={cellClass}>{currency(deposit.DepositAmount)}</td>
                  <td className={cellClass}>{deposit.DepositWeeks}</td>
                  <td className={cellClass}>
                    {deposit.IsCancelled === '1' ? (
                      <span className="inline-block rounded-full bg-red-50 text-red-600 px-2.5 py-0.5 text-xs font-medium">Cancelled</span>
                    ) : (
                      <span className="inline-block rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-medium">Active</span>
                    )}
                  </td>
                  <td className={cellClass}>{deposit.CreatedDate}</td>
                  <td className={cellClass}>{deposit.CreatedBy ?? '—'}</td>
                  <td className={cellClass}>{deposit.UpdatedDate ?? '—'}</td>
                  <td className={cellClass}>{deposit.UpdatedBy ?? '—'}</td>
                  <td className={cellClass}>{deposit.CancelledDate ?? '—'}</td>
                  <td className={cellClass}>{deposit.CancelledBy ?? '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Section 2: Deposit Instalment Payments */}
      <CollapsibleSection title="Deposit Instalment Payments" collapsedSummary={instalmentSummary}>
        {!deposit ? (
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">No deposit record found for this contractor.</div>
        ) : transactions.length === 0 ? (
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">No instalment payments recorded against this deposit.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Amount</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Date</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Created By</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={t.ContractorVehicleDepositTransactionId} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-[#DEEAF1]/30' : ''}`}>
                    <td className={`${cellClass} text-right`}>{currency(t.Amount)}</td>
                    <td className={cellClass}>{t.Date}</td>
                    <td className={cellClass}>{t.CreatedBy ?? '—'}</td>
                  </tr>
                ))}
                <tr className="bg-[#E2EFDA]/50">
                  <td className={`${cellClass} text-right font-semibold`}>{currency(totalCollected)}</td>
                  <td colSpan={2} className={`${cellClass} font-semibold`}>
                    {weeksPaid} of {deposit.DepositWeeks} weeks paid — {currency(amountRemaining)} remaining ({weeksRemaining} weeks)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Section 3: Vehicle Usage History */}
      <CollapsibleSection title="Vehicle Usage History" collapsedSummary={vehicleSummary}>
        {vehicles.length === 0 ? (
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">No vehicle records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>VRM</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Make</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Model</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Supplier</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>From</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>To</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v, i) => {
                  const isNonGreythorn = v.VehicleSupplierId !== 2
                  return (
                    <tr key={`${v.VRM}-${v.FromDate}`} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-[#DEEAF1]/30' : ''} ${isNonGreythorn ? 'italic text-gray-400' : ''}`}>
                      <td className={cellClass}>{v.VRM}</td>
                      <td className={cellClass}>{v.Make ?? '—'}</td>
                      <td className={cellClass}>{v.Model ?? '—'}</td>
                      <td className={cellClass}>{v.Supplier}</td>
                      <td className={cellClass}>{v.FromDate}</td>
                      <td className={cellClass}>{v.ToDate ?? 'Current'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Section 4: Vehicle Charges */}
      <CollapsibleSection title="Vehicle Charges" collapsedSummary={chargeSummary}>
        {charges.length === 0 ? (
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">No vehicle charges found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>VRM</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Reason</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Reference</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Issue Date</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Charged</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Paid</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((ch, i) => (
                  <tr key={`${ch.VRM}-${ch.IssueDate}-${ch.Reference}`} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-[#DEEAF1]/30' : ''}`}>
                    <td className={cellClass}>{ch.VRM}</td>
                    <td className={cellClass}>{ch.Reason}</td>
                    <td className={cellClass}>{ch.Reference ?? '—'}</td>
                    <td className={cellClass}>{ch.IssueDate}</td>
                    <td className={`${cellClass} text-right`}>{currency(ch.Charged)}</td>
                    <td className={`${cellClass} text-right`}>{currency(ch.Paid)}</td>
                    <td className={`${cellClass} text-right font-medium ${ch.Outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {currency(ch.Outstanding)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#E2EFDA]/50">
                  <td colSpan={4} className={`${cellClass} font-semibold`}>Totals</td>
                  <td className={`${cellClass} text-right font-semibold`}>{currency(charges.reduce((s, c) => s + c.Charged, 0))}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{currency(charges.reduce((s, c) => s + c.Paid, 0))}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{currency(charges.reduce((s, c) => s + c.Outstanding, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Section 5: Deposit Return Audit */}
      <CollapsibleSection title="Deposit Return Audit" collapsedSummary={returnSummary}>
        {depositReturns.length === 0 ? (
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">No Deposit Return record found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Amount</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Date</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Created By</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Created Date</th>
                </tr>
              </thead>
              <tbody>
                {depositReturns.map((dr, i) => (
                  <tr key={`${dr.Date}-${dr.Amount}`} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-[#DEEAF1]/30' : ''}`}>
                    <td className={cellClass}>{currency(dr.Amount)}</td>
                    <td className={cellClass}>{dr.Date}</td>
                    <td className={cellClass}>{dr.CreatedBy ?? '—'}</td>
                    <td className={cellClass}>{dr.CreatedDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}
