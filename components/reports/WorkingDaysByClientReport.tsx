'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

interface DataRow {
  ClientName: string
  BranchName: string
  ContractTypeName: string
  ShiftCount: number
  WeightedDays: number
  SiteTotal: number
}

interface WorkingDaysByClientData {
  targetEpoch: { year: number; week: number }
  rows: DataRow[]
}

const ZERO_WEIGHT_TYPES = ['OSM', 'Support']

function isZeroWeight(contractType: string): boolean {
  return ZERO_WEIGHT_TYPES.includes(contractType) || contractType.startsWith('Sameday_6')
}

function isZeroWeightStrict(contractType: string): boolean {
  return contractType === 'OSM' || contractType === 'Support'
}

const PRIMARY_BLUE = '#2E75B6'
const GREY = '#9CA3AF'

const sectionHeading = 'text-sm font-semibold text-white bg-[#2E75B6] px-4 py-2 rounded-t-lg'
const tableHeader = 'text-xs font-medium text-slate-500 uppercase tracking-wide'
const cellClass = 'py-2.5 px-4 text-sm text-slate-700'

const selectClasses = 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 focus:bg-white'

export default function WorkingDaysByClientReport({ data }: { data: WorkingDaysByClientData }) {
  const { targetEpoch, rows } = data

  const [clientFilter, setClientFilter] = useState<string>('All')
  const [branchFilter, setBranchFilter] = useState<string>('All')
  const [contractTypeFilter, setContractTypeFilter] = useState<string>('All')

  // Derive filter options
  const clients = useMemo(() => {
    const set = new Set(rows.map((r) => r.ClientName))
    return Array.from(set).sort()
  }, [rows])

  const branches = useMemo(() => {
    const filtered = clientFilter === 'All' ? rows : rows.filter((r) => r.ClientName === clientFilter)
    const set = new Set(filtered.map((r) => r.BranchName))
    return Array.from(set).sort()
  }, [rows, clientFilter])

  const contractTypes = useMemo(() => {
    let filtered = rows
    if (clientFilter !== 'All') filtered = filtered.filter((r) => r.ClientName === clientFilter)
    if (branchFilter !== 'All') filtered = filtered.filter((r) => r.BranchName === branchFilter)
    const set = new Set(filtered.map((r) => r.ContractTypeName))
    return Array.from(set).sort()
  }, [rows, clientFilter, branchFilter])

  // Reset dependent filters when parent changes
  function handleClientChange(val: string) {
    setClientFilter(val)
    setBranchFilter('All')
    setContractTypeFilter('All')
  }

  function handleBranchChange(val: string) {
    setBranchFilter(val)
    setContractTypeFilter('All')
  }

  // Filtered rows
  const filteredRows = useMemo(() => {
    let result = rows
    if (clientFilter !== 'All') result = result.filter((r) => r.ClientName === clientFilter)
    if (branchFilter !== 'All') result = result.filter((r) => r.BranchName === branchFilter)
    if (contractTypeFilter !== 'All') result = result.filter((r) => r.ContractTypeName === contractTypeFilter)
    return result
  }, [rows, clientFilter, branchFilter, contractTypeFilter])

  // Chart data
  const chartData = useMemo(() => {
    if (branchFilter !== 'All') {
      // Show by contract type at this branch
      const map = new Map<string, { name: string; value: number; isZero: boolean }>()
      for (const r of filteredRows) {
        const existing = map.get(r.ContractTypeName)
        if (existing) {
          existing.value += r.WeightedDays
        } else {
          map.set(r.ContractTypeName, {
            name: r.ContractTypeName,
            value: r.WeightedDays,
            isZero: isZeroWeightStrict(r.ContractTypeName),
          })
        }
      }
      return Array.from(map.values()).sort((a, b) => b.value - a.value)
    }

    if (clientFilter !== 'All') {
      // Show by branch within client
      const map = new Map<string, { name: string; value: number; isZero: boolean }>()
      for (const r of filteredRows) {
        const existing = map.get(r.BranchName)
        if (existing) {
          existing.value += r.WeightedDays
        } else {
          map.set(r.BranchName, { name: r.BranchName, value: r.WeightedDays, isZero: false })
        }
      }
      return Array.from(map.values()).sort((a, b) => b.value - a.value)
    }

    // Show by client
    const map = new Map<string, { name: string; value: number; isZero: boolean }>()
    for (const r of filteredRows) {
      const existing = map.get(r.ClientName)
      if (existing) {
        existing.value += r.WeightedDays
      } else {
        map.set(r.ClientName, { name: r.ClientName, value: r.WeightedDays, isZero: false })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value)
  }, [filteredRows, clientFilter, branchFilter])

  // Group rows for table display
  const groupedRows = useMemo(() => {
    const groups: { client: string; branch: string; siteTotal: number; rows: DataRow[] }[] = []
    let currentKey = ''
    let currentGroup: (typeof groups)[0] | null = null

    for (const r of filteredRows) {
      const key = `${r.ClientName}|${r.BranchName}`
      if (key !== currentKey) {
        currentGroup = { client: r.ClientName, branch: r.BranchName, siteTotal: r.SiteTotal, rows: [] }
        groups.push(currentGroup)
        currentKey = key
      }
      currentGroup!.rows.push(r)
    }

    return groups
  }, [filteredRows])

  const grandTotal = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.WeightedDays, 0)
  }, [filteredRows])

  const grandShiftTotal = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.ShiftCount, 0)
  }, [filteredRows])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#1F3864] rounded-lg px-5 py-4 text-white">
        <h2 className="text-lg font-semibold">Working Day Count by Client / Branch / Contract Type</h2>
        <p className="text-blue-200 text-sm mt-1">
          Epoch: Year {targetEpoch.year}, Week {targetEpoch.week}
          <span className="ml-3 text-blue-300">{filteredRows.length} record{filteredRows.length !== 1 ? 's' : ''}</span>
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-full sm:w-48">
            <label htmlFor="clientFilter" className="block text-sm font-medium text-slate-700 mb-1.5">
              Client
            </label>
            <select
              id="clientFilter"
              value={clientFilter}
              onChange={(e) => handleClientChange(e.target.value)}
              className={selectClasses + ' w-full'}
            >
              <option value="All">All</option>
              {clients.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="w-full sm:w-48">
            <label htmlFor="branchFilter" className="block text-sm font-medium text-slate-700 mb-1.5">
              Branch
            </label>
            <select
              id="branchFilter"
              value={branchFilter}
              onChange={(e) => handleBranchChange(e.target.value)}
              className={selectClasses + ' w-full'}
            >
              <option value="All">All</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="w-full sm:w-52">
            <label htmlFor="contractTypeFilter" className="block text-sm font-medium text-slate-700 mb-1.5">
              Contract Type
            </label>
            <select
              id="contractTypeFilter"
              value={contractTypeFilter}
              onChange={(e) => setContractTypeFilter(e.target.value)}
              className={selectClasses + ' w-full'}
            >
              <option value="All">All</option>
              {contractTypes.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Weighted Days — {branchFilter !== 'All' ? 'by Contract Type' : clientFilter !== 'All' ? 'by Branch' : 'by Client'}
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={180}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value) => [Number(value).toFixed(1), 'Weighted Days']}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.isZero ? GREY : PRIMARY_BLUE} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Data table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className={sectionHeading}>Data Breakdown</div>
        {groupedRows.length === 0 ? (
          <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 italic">No data found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Client</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Branch</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-left`}>Contract Type</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Shifts</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Weighted Days</th>
                  <th className={`${tableHeader} py-2.5 px-4 text-right`}>Site Total</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((group, gi) => (
                  <>
                    {/* Group header */}
                    <tr key={`header-${gi}`} className="bg-[#2E75B6]/10 border-b border-slate-200">
                      <td colSpan={5} className="py-2 px-4 text-sm font-semibold text-[#1F3864]">
                        {group.client} — {group.branch}
                      </td>
                      <td className="py-2 px-4 text-sm font-semibold text-[#1F3864] text-right">
                        {group.siteTotal.toFixed(1)}
                      </td>
                    </tr>
                    {/* Data rows */}
                    {group.rows.map((r, ri) => {
                      const zeroWeight = isZeroWeightStrict(r.ContractTypeName)
                      return (
                        <tr
                          key={`row-${gi}-${ri}`}
                          className={`border-b border-slate-100 ${zeroWeight ? '' : ri % 2 === 1 ? 'bg-[#DEEAF1]/30' : ''}`}
                        >
                          <td className={`${cellClass} ${zeroWeight ? 'italic text-slate-400' : ''}`}>{r.ClientName}</td>
                          <td className={`${cellClass} ${zeroWeight ? 'italic text-slate-400' : ''}`}>{r.BranchName}</td>
                          <td className={`${cellClass} ${zeroWeight ? 'italic text-slate-400' : ''}`}>{r.ContractTypeName}</td>
                          <td className={`${cellClass} text-right ${zeroWeight ? 'italic text-slate-400' : ''}`}>{r.ShiftCount}</td>
                          <td className={`${cellClass} text-right ${zeroWeight ? 'italic text-slate-400' : ''}`}>{r.WeightedDays.toFixed(1)}</td>
                          <td className={`${cellClass} text-right ${zeroWeight ? 'italic text-slate-400' : ''}`}>{r.SiteTotal.toFixed(1)}</td>
                        </tr>
                      )
                    })}
                  </>
                ))}
                {/* Grand total row */}
                <tr className="bg-[#E2EFDA]/50">
                  <td colSpan={3} className={`${cellClass} font-semibold`}>Grand Total</td>
                  <td className={`${cellClass} text-right font-semibold`}>{grandShiftTotal}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{grandTotal.toFixed(1)}</td>
                  <td className={cellClass} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
