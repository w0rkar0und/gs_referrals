'use client'

import type { SyncLogEntry } from '@/lib/types'

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

export default function SyncStatusBanner({ lastSync }: { lastSync: SyncLogEntry | null }) {
  if (!lastSync) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 mb-6 flex items-center gap-2">
        <span className="w-2 h-2 bg-red-500 rounded-full shrink-0" />
        No sync has ever run.
      </div>
    )
  }

  if (isToday(lastSync.ran_at)) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 mb-6 flex items-center gap-2">
        <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
        Contractor sync completed today at {new Date(lastSync.ran_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.
      </div>
    )
  }

  const dateStr = new Date(lastSync.ran_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = new Date(lastSync.ran_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 mb-6 flex items-center gap-2">
      <span className="w-2 h-2 bg-amber-500 rounded-full shrink-0" />
      Last sync: {dateStr} {timeStr} — contractors table may be stale.
    </div>
  )
}
