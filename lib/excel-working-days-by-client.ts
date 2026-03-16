import ExcelJS from 'exceljs'
import {
  titleStyle, headerStyle, sectionStyle,
  dataStyleEven, dataStyleOdd, totalStyle,
  greyItalicStyle,
} from './excel-styles'

interface Row {
  ClientName: string
  BranchName: string
  ContractTypeName: string
  ShiftCount: number
  WeightedDays: number
  SiteTotal: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateWorkingDaysByClientExcel(data: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Working Days by Client', { views: [{ state: 'frozen', ySplit: 3 }] })
  ws.properties.showGridLines = false

  const { targetEpoch, rows } = data as { targetEpoch: { year: number; week: number }; rows: Row[] }

  // Title
  const titleRow = ws.addRow([`Working Day Count by Client / Branch / Contract Type — Week ${targetEpoch.week}, ${targetEpoch.year}`])
  titleRow.eachCell((c) => { c.style = titleStyle })
  ws.mergeCells(titleRow.number, 1, titleRow.number, 6)
  titleRow.height = 30

  ws.addRow([])

  // Headers
  const hdr = ws.addRow(['Client', 'Branch', 'Contract Type', 'Shifts', 'Weighted Days', 'Site Total'])
  hdr.eachCell((c) => { c.style = headerStyle })

  // Group rows by client + branch
  interface Group {
    client: string
    branch: string
    siteTotal: number
    rows: Row[]
  }

  const groups: Group[] = []
  let currentKey = ''
  let currentGroup: Group | null = null

  for (const r of rows) {
    const key = `${r.ClientName}|${r.BranchName}`
    if (key !== currentKey) {
      currentGroup = { client: r.ClientName, branch: r.BranchName, siteTotal: r.SiteTotal, rows: [] }
      groups.push(currentGroup)
      currentKey = key
    }
    currentGroup!.rows.push(r)
  }

  let dataIdx = 0

  for (const group of groups) {
    // Section banner for client/branch
    const banner = ws.addRow([`${group.client} — ${group.branch}`])
    banner.eachCell((c) => { c.style = sectionStyle })
    ws.mergeCells(banner.number, 1, banner.number, 6)

    for (const r of group.rows) {
      const isZero = r.ContractTypeName === 'OSM' || r.ContractTypeName === 'Support'
      const style = isZero ? greyItalicStyle : dataIdx % 2 === 0 ? dataStyleEven : dataStyleOdd

      const row = ws.addRow([
        r.ClientName,
        r.BranchName,
        r.ContractTypeName,
        r.ShiftCount,
        r.WeightedDays,
        r.SiteTotal,
      ])
      row.eachCell((c) => { c.style = style })
      row.getCell(5).numFmt = '#,##0.0'
      row.getCell(6).numFmt = '#,##0.0'
      dataIdx++
    }

    // Site total row
    const groupShifts = group.rows.reduce((s, r) => s + r.ShiftCount, 0)
    const groupWeighted = group.rows.reduce((s, r) => s + r.WeightedDays, 0)
    const siteRow = ws.addRow(['', '', 'Site Total', groupShifts, groupWeighted, group.siteTotal])
    siteRow.eachCell((c) => { c.style = totalStyle })
    siteRow.getCell(5).numFmt = '#,##0.0'
    siteRow.getCell(6).numFmt = '#,##0.0'
  }

  // Grand total
  ws.addRow([])
  const grandShifts = rows.reduce((s: number, r: Row) => s + r.ShiftCount, 0)
  const grandWeighted = rows.reduce((s: number, r: Row) => s + r.WeightedDays, 0)
  const grandRow = ws.addRow(['', '', 'Grand Total', grandShifts, grandWeighted, ''])
  grandRow.eachCell((c) => { c.style = totalStyle })
  grandRow.getCell(5).numFmt = '#,##0.0'

  // Column widths
  ws.getColumn(1).width = 22
  ws.getColumn(2).width = 22
  ws.getColumn(3).width = 30
  ws.getColumn(4).width = 12
  ws.getColumn(5).width = 16
  ws.getColumn(6).width = 14

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
