'use client'

import { useState, useMemo } from 'react'

export type SortDir = 'asc' | 'desc'

interface SortableHeaderProps {
  label: string
  sortKey: string
  currentSort: string | null
  currentDir: SortDir
  onSort: (key: string) => void
  className?: string
}

export default function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className = '',
}: SortableHeaderProps) {
  const active = currentSort === sortKey
  return (
    <th
      className={`pb-3 pr-3 font-medium cursor-pointer select-none hover:text-gray-900 ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-xs ${active ? 'text-blue-600' : 'text-gray-300'}`}>
          {active ? (currentDir === 'asc' ? '▲' : '▼') : '▲'}
        </span>
      </span>
    </th>
  )
}

export function useSort<T>(items: T[], defaultKey: string | null = null, defaultDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted: T[] = useMemo(() => {
    if (!sortKey) return items
    return [...items].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey]
      const bv = (b as Record<string, unknown>)[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const as = String(av)
      const bs = String(bv)
      const cmp = as.localeCompare(bs)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, sortKey, sortDir])

  return { sorted, sortKey, sortDir, handleSort }
}
