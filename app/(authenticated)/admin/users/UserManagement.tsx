'use client'

import { useState } from 'react'
import type { Profile } from '@/lib/types'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

const inputClasses = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 focus:bg-white"

export default function UserManagement({ initialProfiles }: { initialProfiles: Profile[] }) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [displayId, setDisplayId] = useState('')
  const [password, setPassword] = useState('')
  const [isInternal, setIsInternal] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setSuccess(null)

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_id: displayId.trim(),
        password,
        is_internal: isInternal,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Failed to create user.')
      setCreating(false)
      return
    }

    setSuccess(`User "${displayId.trim()}" created successfully.`)
    setProfiles((prev) => [data.profile, ...prev])
    setDisplayId('')
    setPassword('')
    setCreating(false)
  }

  return (
    <div className="space-y-6">
      {/* Create user form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Create New User</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="display_id" className="block text-sm font-medium text-slate-700 mb-1.5">
                Display ID
              </label>
              <input
                id="display_id"
                type="text"
                value={displayId}
                onChange={(e) => setDisplayId(e.target.value)}
                required
                placeholder="e.g. X123456 or j.smith"
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Temporary Password
              </label>
              <input
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className={inputClasses}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
              <div className="flex items-center gap-4 pt-1.5">
                <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="user_type"
                    checked={isInternal}
                    onChange={() => setIsInternal(true)}
                    className="accent-blue-600"
                  />
                  Internal
                </label>
                <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="user_type"
                    checked={!isInternal}
                    onChange={() => setIsInternal(false)}
                    className="accent-blue-600"
                  />
                  External
                </label>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">{success}</div>
          )}

          <button
            type="submit"
            disabled={creating}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {creating ? 'Creating...' : 'Create User'}
          </button>
        </form>
      </div>

      {/* User list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">All Users</h2>
        {profiles.length === 0 ? (
          <p className="text-slate-500 text-sm">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Display ID</th>
                  <th className="pb-3 pr-4 font-medium">Type</th>
                  <th className="pb-3 pr-4 font-medium">Admin</th>
                  <th className="pb-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 text-slate-900">{p.display_id}</td>
                    <td className="py-3 pr-4 text-slate-600">{p.is_internal ? 'Internal' : 'External'}</td>
                    <td className="py-3 pr-4">
                      {p.is_admin ? (
                        <span className="inline-block rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-xs font-medium">Admin</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 text-slate-600">{formatDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
