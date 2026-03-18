import ExcelJS from 'exceljs'
import {
  titleStyle, headerStyle, sectionStyle,
  dataStyleEven, dataStyleOdd, totalStyle, nilStyle,
  greyItalicStyle, cancelledStyle, transactionStyle,
} from './excel-styles'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateDepositExcel(data: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Deposit Report', { views: [{ state: 'frozen', ySplit: 4 }] })
  ws.properties.showGridLines = false

  const { contractor, deposit, transactions, vehicles, charges, depositReturns } = data
  const name = contractor ? `${contractor.HrCode} — ${contractor.FirstName} ${contractor.LastName}` : 'Unknown'

  // Title
  const titleRow = ws.addRow([`Deposit Report: ${name}`])
  titleRow.eachCell((c) => { c.style = titleStyle })
  ws.mergeCells(titleRow.number, 1, titleRow.number, 9)
  titleRow.height = 30

  ws.addRow([])

  // ── Section 1: Last Deposit Record ──
  const s1 = ws.addRow(['Last Deposit Record'])
  s1.eachCell((c) => { c.style = sectionStyle })
  ws.mergeCells(s1.number, 1, s1.number, 9)

  const headers1 = ['Amount', 'Weeks', 'Status', 'Created', 'Created By', 'Updated', 'Updated By', 'Cancelled', 'Cancelled By']
  const h1 = ws.addRow(headers1)
  h1.eachCell((c) => { c.style = headerStyle })

  if (!deposit) {
    const nr = ws.addRow(['No deposit records found.'])
    nr.eachCell((c) => { c.style = nilStyle })
    ws.mergeCells(nr.number, 1, nr.number, 9)
  } else {
    const isCancelled = deposit.IsCancelled === '1' || deposit.IsCancelled === true
    const style = isCancelled ? cancelledStyle : dataStyleEven
    const r = ws.addRow([
      deposit.DepositAmount, deposit.DepositWeeks,
      isCancelled ? 'Cancelled' : 'Active',
      deposit.CreatedDate, deposit.CreatedBy ?? '—',
      deposit.UpdatedDate ?? '—', deposit.UpdatedBy ?? '—',
      deposit.CancelledDate ?? '—', deposit.CancelledBy ?? '—',
    ])
    r.eachCell((c) => { c.style = style })
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
  } else if (!transactions || transactions.length === 0) {
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
    const tr = ws.addRow([totalCollected, `${weeksPaid} of ${deposit.DepositWeeks} weeks paid — ${formatCurrency(amountRemaining)} remaining (${weeksRemaining} weeks)`, ''])
    tr.eachCell((c) => { c.style = totalStyle })
    tr.getCell(1).numFmt = '£#,##0.00'
  }

  ws.addRow([])

  // ── Section 3: Vehicle Usage History ──
  const s3 = ws.addRow(['Vehicle Usage History'])
  s3.eachCell((c) => { c.style = sectionStyle })
  ws.mergeCells(s3.number, 1, s3.number, 6)

  const h3 = ws.addRow(['VRM', 'Make', 'Model', 'Supplier', 'From', 'To'])
  h3.eachCell((c) => { c.style = headerStyle })

  if (vehicles.length === 0) {
    const nr = ws.addRow(['No vehicle records found.'])
    nr.eachCell((c) => { c.style = nilStyle })
    ws.mergeCells(nr.number, 1, nr.number, 6)
  } else {
    vehicles.forEach((v: { VRM: string; Make: string; Model: string; Supplier: string; VehicleSupplierId: number | null; FromDate: string; ToDate: string | null }, i: number) => {
      const isNonGT = v.VehicleSupplierId !== 2
      const style = isNonGT ? greyItalicStyle : i % 2 === 0 ? dataStyleEven : dataStyleOdd
      const r = ws.addRow([v.VRM, v.Make ?? '—', v.Model ?? '—', v.Supplier, v.FromDate, v.ToDate ?? 'Current'])
      r.eachCell((c) => { c.style = style })
    })
  }

  ws.addRow([])

  // ── Section 4: Vehicle Charges ──
  const s4 = ws.addRow(['Vehicle Charges'])
  s4.eachCell((c) => { c.style = sectionStyle })
  ws.mergeCells(s4.number, 1, s4.number, 7)

  const h4 = ws.addRow(['VRM', 'Reason', 'Reference', 'Issue Date', 'Charged', 'Paid', 'Outstanding'])
  h4.eachCell((c) => { c.style = headerStyle })

  if (charges.length === 0) {
    const nr = ws.addRow(['No vehicle charges found.'])
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

  // ── Section 5: Deposit Return Audit ──
  const s5 = ws.addRow(['Deposit Return Audit'])
  s5.eachCell((c) => { c.style = sectionStyle })
  ws.mergeCells(s5.number, 1, s5.number, 4)

  const h5 = ws.addRow(['Amount', 'Date', 'Created By', 'Created Date'])
  h5.eachCell((c) => { c.style = headerStyle })

  if (depositReturns.length === 0) {
    const nr = ws.addRow(['No Deposit Return record found.'])
    nr.eachCell((c) => { c.style = nilStyle })
    ws.mergeCells(nr.number, 1, nr.number, 4)
  } else {
    depositReturns.forEach((dr: { Amount: number; Date: string; CreatedBy: string | null; CreatedDate: string }, i: number) => {
      const style = i % 2 === 0 ? dataStyleEven : dataStyleOdd
      const r = ws.addRow([dr.Amount, dr.Date, dr.CreatedBy ?? '—', dr.CreatedDate])
      r.eachCell((c) => { c.style = style })
      r.getCell(1).numFmt = '£#,##0.00'
    })
  }

  // Auto-fit columns
  ws.columns.forEach((col) => {
    col.width = 16
  })
  if (ws.getColumn(1)) ws.getColumn(1).width = 18
  if (ws.getColumn(2)) ws.getColumn(2).width = 14

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

function formatCurrency(val: number): string {
  return val.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}
