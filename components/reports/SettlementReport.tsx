'use client'

import { useState } from 'react'

interface Deposit {
  ContractorVehicleDepositId: number
  DepositAmount: number
  DepositWeeks: number
  IsCancelled: string
  CreatedDate: string
  UpdatedDate: string | null
  DeletedDate: string | null
  CreatedBy: string | null
  UpdatedBy: string | null
  DeletedBy: string | null
}

interface Transaction {
  ContractorVehicleDepositTransactionId: number
  Amount: number
  Date: string
  CreatedBy: string | null
}

interface Vehicle {
  VRM: string
  Make: string | null
  Model: string | null
  Supplier: string
  OwnershipType: string | null
  IsOwnedByContractor: string | null
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

interface Remittance {
  Year: number
  Week: number
  DebriefAmount: number
  AdditionalPayAmount: number
  DeductionsAmount: number
  TotalPay: number
}

interface Contractor {
  ContractorId: number
  HrCode: string
  FirstName: string
  LastName: string
  Email: string | null
  PhoneNumber: string | null
}

interface AccountStatus {
  Active: boolean
  StatusDate: string
  ChangedBy: string | null
}

interface SettlementReportData {
  contractor: Contractor | null
  accountStatus: AccountStatus | null
  deposit: Deposit | null
  transactions: Transaction[]
  vehicles: Vehicle[]
  charges: Charge[]
  remittances: Remittance[]
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

export default function SettlementReport({ data }: { data: SettlementReportData }) {
  const { contractor, accountStatus, deposit, transactions, vehicles, charges, remittances } = data

  if (!contractor) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
        Contractor not found. Please check the HR code and try again.
      </div>
    )
  }

  // Derived values for deposit summary
  const totalCollected = transactions.reduce((s, t) => s + t.Amount, 0)
  const weeksPaid = transactions.length
  const weeksRemaining = deposit ? deposit.DepositWeeks - weeksPaid : 0
  const amountRemaining = deposit ? deposit.DepositAmount - totalCollected : 0

  // Collapsed summary: instalments
  const instalmentSummary = deposit && transactions.length > 0
    ? `${weeksPaid} of ${deposit.DepositWeeks} weeks paid — ${currency(amountRemaining)} remaining (${weeksRemaining} weeks)`
    : undefined

  // Collapsed summary: vehicles — count non-DA (non-Greythorn) vehicles
  const nonDaCount = (vehicles ?? []).filter(v => v.IsOwnedByContractor !== '1').length
  const vehicleSummary = (vehicles ?? []).length > 0 && nonDaCount > 0
    ? `${nonDaCount} non-DA supplied vehicle${nonDaCount !== 1 ? 's' : ''}`
    : undefined

  // Collapsed summary: charges
  const partialPaidCount = charges.filter(ch => ch.Paid > 0 && ch.Outstanding > 0).length
  const unpaidCount = charges.filter(ch => ch.Paid === 0 && ch.Outstanding > 0).length
  const totalOutstanding = charges.reduce((s, c) => s + c.Outstanding, 0)
  const chargeSummaryParts: string[] = []
  if (partialPaidCount > 0) chargeSummaryParts.push(`${partialPaidCount} partial paid`)
  if (unpaidCount > 0) chargeSummaryParts.push(`${unpaidCount} unpaid`)
  if (totalOutstanding > 0) chargeSummaryParts.push(`${currency(totalOutstanding)} outstanding`)
  const chargeSummary = chargeSummaryParts.length > 0 ? chargeSummaryParts.join(' · ') : undefined

  return (
    <div className="space-y-6">
      {/* Contractor header */}
      <div className="bg-[#1F3864] rounded-lg px-5 py-4 text-white">
        <h2 className="text-lg font-semibold">DA Relations Settlement Data</h2>
        <p className="text-blue-200 text-sm mt-1">
          {contractor.HrCode} — {contractor.FirstName} {contractor.LastName}
          {contractor.Email && <span className="ml-3 text-blue-300">{contractor.Email}</span>}
        </p>
        <div className="flex items-center gap-3 mt-2">
          {accountStatus ? (
            <>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${accountStatus.Active ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}>
                {accountStatus.Active ? 'Active' : 'Deactivated'}
              </span>
              <span className="text-blue-300 text-xs">
                Status changed {accountStatus.StatusDate}
                {accountStatus.ChangedBy && <> by {accountStatus.ChangedBy}</>}
              </span>
            </>
          ) : (
            <span className="inline-block rounded-full bg-emerald-500/20 text-emerald-200 px-2.5 py-0.5 text-xs font-medium">Active</span>
          )}
        </div>
      </div>

      {/* Section 1: Last Deposit Record */}
      <CollapsibleSection title="Last Deposit Record">
        {!deposit ? (
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">No deposit record found for this contractor.</div>
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
                  <td className={cellClass}>{deposit.DeletedDate ?? '—'}</td>
                  <td className={cellClass}>{deposit.DeletedBy ?? '—'}</td>
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

      {/* Section 3: Vehicles Since Deposit */}
      <CollapsibleSection title={`Vehicles Assigned${deposit ? ` (since ${deposit.CreatedDate})` : ''}`} collapsedSummary={vehicleSummary}>
        {(vehicles ?? []).length === 0 ? (
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">
            {deposit ? 'No vehicles assigned since the last deposit record.' : 'No deposit record — no date window to filter vehicles.'}
          </div>
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
                {(vehicles ?? []).map((v, i) => {
                  const isNonGreythorn = v.IsOwnedByContractor !== '1'
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
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">No vehicle charges found for this contractor during any Greythorn vehicle assignment window.</div>
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

      {/* Section 5: Last Two Remittance Notices */}
      <CollapsibleSection title="Recent Remittance Notices">
        {remittances.length === 0 ? (
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">No remittance notices found for this contractor.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Year</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Week</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Debrief Pay</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Additional Pay</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Deductions</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Total Pay</th>
                </tr>
              </thead>
              <tbody>
                {remittances.map((r, i) => (
                  <tr key={`${r.Year}-${r.Week}`} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-[#DEEAF1]/30' : ''}`}>
                    <td className={cellClass}>{r.Year}</td>
                    <td className={cellClass}>{r.Week}</td>
                    <td className={`${cellClass} text-right`}>{currency(r.DebriefAmount)}</td>
                    <td className={`${cellClass} text-right`}>{currency(r.AdditionalPayAmount)}</td>
                    <td className={`${cellClass} text-right`}>{currency(r.DeductionsAmount)}</td>
                    <td className={`${cellClass} text-right font-semibold`}>{currency(r.TotalPay)}</td>
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
