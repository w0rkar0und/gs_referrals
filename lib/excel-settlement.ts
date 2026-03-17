import ExcelJS from 'exceljs'
import {
  titleStyle, headerStyle, sectionStyle,
  dataStyleEven, dataStyleOdd, totalStyle, nilStyle, greyItalicStyle,
} from './excel-styles'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateSettlementExcel(data: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Settlement Data', { views: [{ state: 'frozen', ySplit: 4 }] })
  ws.properties.showGridLines = false

  const { contractor, accountStatus, deposit, transactions, vehicles, charges, remittances } = data
  const name = contractor ? `${contractor.HrCode} — ${contractor.FirstName} ${contractor.LastName}` : 'Unknown'

  // Title
  const titleRow = ws.addRow([`DA Relations Settlement Data: ${name}`])
  titleRow.eachCell((c) => { c.style = titleStyle })
  ws.mergeCells(titleRow.number, 1, titleRow.number, 9)
  titleRow.height = 30

  // Account status row
  const statusText = accountStatus
    ? `Account Status: ${accountStatus.Active ? 'Active' : 'Deactivated'} — Changed ${accountStatus.StatusDate}${accountStatus.ChangedBy ? ` by ${accountStatus.ChangedBy}` : ''}`
    : 'Account Status: Active (no status history recorded)'
  const statusRow = ws.addRow([statusText])
  statusRow.eachCell((c) => { c.style = { font: { size: 10, italic: true } } })
  ws.mergeCells(statusRow.number, 1, statusRow.number, 9)

  ws.addRow([])

  // ── Section 1: Last Deposit Record ──
  const s1 = ws.addRow(['Last Deposit Record'])
  s1.eachCell((c) => { c.style = sectionStyle })
  ws.mergeCells(s1.number, 1, s1.number, 9)

  const h1 = ws.addRow(['Amount', 'Weeks', 'Status', 'Created', 'Created By', 'Updated', 'Updated By', 'Cancelled', 'Cancelled By'])
  h1.eachCell((c) => { c.style = headerStyle })

  if (!deposit) {
    const nr = ws.addRow(['No deposit record found for this contractor.'])
    nr.eachCell((c) => { c.style = nilStyle })
    ws.mergeCells(nr.number, 1, nr.number, 9)
  } else {
    const r = ws.addRow([
      deposit.DepositAmount, deposit.DepositWeeks,
      deposit.IsCancelled === '1' ? 'Cancelled' : 'Active',
      deposit.CreatedDate, deposit.CreatedBy ?? '—',
      deposit.UpdatedDate ?? '—', deposit.UpdatedBy ?? '—',
      deposit.DeletedDate ?? '—', deposit.DeletedBy ?? '—',
    ])
    r.eachCell((c) => { c.style = dataStyleEven })
    r.getCell(1).numFmt = '£#,##0.00'
  }

  ws.addRow([])

  // ── Section 2: Deposit Instalment Payments ──
  const s2 = ws.addRow(['Deposit Instalment Payments'])
  s2.eachCell((c) => { c.style = sectionStyle })
  ws.mergeCells(s2.number, 1, s2.number, 3)

  const h2 = ws.addRow(['Amount', 'Date', 'Created By'])
  h2.eachCell((c) => { c.style = headerStyle })

  if (!deposit) {
    const nr = ws.addRow(['No deposit record found for this contractor.'])
    nr.eachCell((c) => { c.style = nilStyle })
    ws.mergeCells(nr.number, 1, nr.number, 3)
  } else if (transactions.length === 0) {
    const nr = ws.addRow(['No instalment payments recorded against this deposit.'])
    nr.eachCell((c) => { c.style = nilStyle })
    ws.mergeCells(nr.number, 1, nr.number, 3)
  } else {
    transactions.forEach((t: { Amount: number; Date: string; CreatedBy: string | null }, i: number) => {
      const style = i % 2 === 0 ? dataStyleEven : dataStyleOdd
      const r = ws.addRow([t.Amount, t.Date, t.CreatedBy ?? '—'])
      r.eachCell((c) => { c.style = style })
      r.getCell(1).numFmt = '£#,##0.00'
    })

    const totalCollected = transactions.reduce((s: number, t: { Amount: number }) => s + t.Amount, 0)
    const weeksPaid = transactions.length
    const weeksRemaining = deposit.DepositWeeks - weeksPaid
    const amountRemaining = deposit.DepositAmount - totalCollected
    const tr = ws.addRow([totalCollected, `${weeksPaid} of ${deposit.DepositWeeks} weeks paid — £${amountRemaining.toFixed(2)} remaining (${weeksRemaining} weeks)`])
    tr.eachCell((c) => { c.style = totalStyle })
    tr.getCell(1).numFmt = '£#,##0.00'
  }

  ws.addRow([])

  // ── Section 3: Vehicles Assigned ──
  const vehicleTitle = deposit ? `Vehicles Assigned (since ${deposit.CreatedDate})` : 'Vehicles Assigned'
  const s2b = ws.addRow([vehicleTitle])
  s2b.eachCell((c) => { c.style = sectionStyle })
  ws.mergeCells(s2b.number, 1, s2b.number, 6)

  const h2b = ws.addRow(['VRM', 'Make', 'Model', 'Supplier', 'From', 'To'])
  h2b.eachCell((c) => { c.style = headerStyle })

  if (!vehicles || vehicles.length === 0) {
    const nr = ws.addRow([deposit ? 'No vehicles assigned since the last deposit record.' : 'No deposit record — no date window to filter vehicles.'])
    nr.eachCell((c) => { c.style = nilStyle })
    ws.mergeCells(nr.number, 1, nr.number, 6)
  } else {
    vehicles.forEach((v: { VRM: string; Make: string | null; Model: string | null; Supplier: string; IsOwnedByContractor: string | null; FromDate: string; ToDate: string | null }, i: number) => {
      const isNonGreythorn = v.IsOwnedByContractor === '1'
      const style = isNonGreythorn ? greyItalicStyle : (i % 2 === 0 ? dataStyleEven : dataStyleOdd)
      const r = ws.addRow([v.VRM, v.Make ?? '—', v.Model ?? '—', v.Supplier, v.FromDate, v.ToDate ?? 'Current'])
      r.eachCell((c) => { c.style = style })
    })
  }

  ws.addRow([])

  // ── Section 4: Vehicle Charges ──
  const s4 = ws.addRow(['Vehicle Charges'])
  s4.eachCell((c) => { c.style = sectionStyle })
  ws.mergeCells(s4.number, 1, s4.number, 7)

  const h3 = ws.addRow(['VRM', 'Reason', 'Reference', 'Issue Date', 'Charged', 'Paid', 'Outstanding'])
  h3.eachCell((c) => { c.style = headerStyle })

  if (charges.length === 0) {
    const nr = ws.addRow(['No vehicle charges found for this contractor during any Greythorn vehicle assignment window.'])
    nr.eachCell((c) => { c.style = nilStyle })
    ws.mergeCells(nr.number, 1, nr.number, 7)
  } else {
    charges.forEach((ch: { VRM: string; Reason: string; Reference: string | null; IssueDate: string; Charged: number; Paid: number; Outstanding: number }, i: number) => {
      const style = i % 2 === 0 ? dataStyleEven : dataStyleOdd
      const r = ws.addRow([ch.VRM, ch.Reason, ch.Reference ?? '—', ch.IssueDate, ch.Charged, ch.Paid, ch.Outstanding])
      r.eachCell((c) => { c.style = style })
      r.getCell(5).numFmt = '£#,##0.00'
      r.getCell(6).numFmt = '£#,##0.00'
      r.getCell(7).numFmt = '£#,##0.00'
    })

    const totCharged = charges.reduce((s: number, c: { Charged: number }) => s + c.Charged, 0)
    const totPaid = charges.reduce((s: number, c: { Paid: number }) => s + c.Paid, 0)
    const totOutstanding = charges.reduce((s: number, c: { Outstanding: number }) => s + c.Outstanding, 0)
    const tr = ws.addRow(['', '', '', 'Totals', totCharged, totPaid, totOutstanding])
    tr.eachCell((c) => { c.style = totalStyle })
    tr.getCell(5).numFmt = '£#,##0.00'
    tr.getCell(6).numFmt = '£#,##0.00'
    tr.getCell(7).numFmt = '£#,##0.00'
  }

  ws.addRow([])

  // ── Section 5: Recent Remittance Notices ──
  const s5 = ws.addRow(['Recent Remittance Notices'])
  s5.eachCell((c) => { c.style = sectionStyle })
  ws.mergeCells(s5.number, 1, s5.number, 6)

  const h4 = ws.addRow(['Year', 'Week', 'Debrief Pay', 'Additional Pay', 'Deductions', 'Total Pay'])
  h4.eachCell((c) => { c.style = headerStyle })

  if (remittances.length === 0) {
    const nr = ws.addRow(['No remittance notices found for this contractor.'])
    nr.eachCell((c) => { c.style = nilStyle })
    ws.mergeCells(nr.number, 1, nr.number, 6)
  } else {
    remittances.forEach((r: { Year: number; Week: number; DebriefAmount: number; AdditionalPayAmount: number; DeductionsAmount: number; TotalPay: number }, i: number) => {
      const style = i % 2 === 0 ? dataStyleEven : dataStyleOdd
      const row = ws.addRow([r.Year, r.Week, r.DebriefAmount, r.AdditionalPayAmount, r.DeductionsAmount, r.TotalPay])
      row.eachCell((c) => { c.style = style })
      row.getCell(3).numFmt = '£#,##0.00'
      row.getCell(4).numFmt = '£#,##0.00'
      row.getCell(5).numFmt = '£#,##0.00'
      row.getCell(6).numFmt = '£#,##0.00'
    })
  }

  // Auto-fit columns
  ws.columns.forEach((col) => { col.width = 16 })
  if (ws.getColumn(1)) ws.getColumn(1).width = 18
  if (ws.getColumn(2)) ws.getColumn(2).width = 14

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
