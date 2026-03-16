'use client'

import { useState } from 'react'
import type { Profile } from '@/lib/types'
import type { AppDefinition } from '@/lib/apps'

interface UserWithApps extends Profile {
  app_slugs: string[]
}

interface Props {
  initialUsers: UserWithApps[]
  allApps: AppDefinition[]
  currentUserId: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

const inputClasses = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 focus:bg-white"

export default function PlatformUserManagement({ initialUsers, allApps, currentUserId }: Props) {
  const [users, setUsers] = useState(initialUsers)

  // Create form state
  const [displayId, setDisplayId] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isInternal, setIsInternal] = useState(true)
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false)
  const [newUserApps, setNewUserApps] = useState<string[]>(['referrals'])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Table state
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null)
  const [editingAppsUserId, setEditingAppsUserId] = useState<string | null>(null)
  const [editingAppSlugs, setEditingAppSlugs] = useState<string[]>([])
  const [editingProfileUserId, setEditingProfileUserId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ display_id: '', full_name: '', email: '', is_internal: true })
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setSuccess(null)

    const res = await fetch('/api/platform/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_id: displayId.trim(),
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        is_internal: isInternal,
        is_admin: newUserIsAdmin,
        app_slugs: newUserApps,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Failed to create user.')
      setCreating(false)
      return
    }

    setSuccess(`User "${displayId.trim()}" created successfully.`)
    setUsers((prev) => [{ ...data.profile, app_slugs: data.app_slugs }, ...prev])
    setDisplayId('')
    setFullName('')
    setEmail('')
    setPassword('')
    setNewUserIsAdmin(false)
    setNewUserApps(['referrals'])
    setCreating(false)
  }

  async function handleToggleAdmin(userId: string) {
    setLoadingUserId(userId)
    const res = await fetch('/api/platform/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_admin', user_id: userId }),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_admin: data.is_admin } : u))
    }
    setLoadingUserId(null)
  }

  async function handleToggleActive(userId: string) {
    setLoadingUserId(userId)
    const res = await fetch('/api/platform/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_active', user_id: userId }),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: data.is_active } : u))
    }
    setLoadingUserId(null)
  }

  async function handleDeleteUser(userId: string) {
    setLoadingUserId(userId)
    const res = await fetch('/api/platform/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_user', user_id: userId }),
    })
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    }
    setConfirmDeleteUserId(null)
    setLoadingUserId(null)
  }

  function startEditProfile(user: UserWithApps) {
    setEditingProfileUserId(user.id)
    setEditForm({
      display_id: user.display_id,
      full_name: user.full_name ?? '',
      email: user.email ?? '',
      is_internal: user.is_internal,
    })
  }

  async function saveProfile(userId: string) {
    setLoadingUserId(userId)
    const res = await fetch('/api/platform/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'edit_profile',
        user_id: userId,
        display_id: editForm.display_id.trim(),
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
        is_internal: editForm.is_internal,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...data.profile } : u))
    }
    setEditingProfileUserId(null)
    setLoadingUserId(null)
  }

  function startEditApps(userId: string, currentSlugs: string[]) {
    setEditingAppsUserId(userId)
    setEditingAppSlugs([...currentSlugs])
  }

  async function saveApps(userId: string) {
    setLoadingUserId(userId)
    const res = await fetch('/api/platform/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_apps', user_id: userId, app_slugs: editingAppSlugs }),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, app_slugs: data.app_slugs } : u))
    }
    setEditingAppsUserId(null)
    setLoadingUserId(null)
  }

  function toggleNewUserApp(slug: string) {
    setNewUserApps((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  function toggleEditingApp(slug: string) {
    setEditingAppSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  const filteredUsers = searchQuery
    ? users.filter((u) =>
        u.display_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.full_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.email ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : users

  return (
    <div className="space-y-6">
      {/* Create user form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Create New User</h2>
        <form onSubmit={handleCreate} autoComplete="off" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="display_id" className="block text-sm font-medium text-slate-700 mb-1.5">
                Display ID <span className="text-red-400">*</span>
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
              <label htmlFor="full_name" className="block text-sm font-medium text-slate-700 mb-1.5">
                Full Name
              </label>
              <input
                id="full_name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. John Smith"
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. john@example.com"
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Temporary Password <span className="text-red-400">*</span>
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
              <div className="flex items-center gap-4 pt-1.5">
                <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" name="user_type" checked={isInternal} onChange={() => setIsInternal(true)} className="accent-blue-600" />
                  Internal
                </label>
                <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" name="user_type" checked={!isInternal} onChange={() => setIsInternal(false)} className="accent-blue-600" />
                  External
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">App Access</label>
              <div className="flex items-center gap-4 pt-1.5">
                {allApps.map((app) => (
                  <label key={app.slug} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newUserApps.includes(app.slug)}
                      onChange={() => toggleNewUserApp(app.slug)}
                      className="accent-blue-600 rounded"
                    />
                    {app.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Admin</label>
              <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer pt-1.5">
                <input
                  type="checkbox"
                  checked={newUserIsAdmin}
                  onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                  className="accent-blue-600 rounded"
                />
                Platform admin
              </label>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            All Users <span className="text-slate-400 font-normal">({users.length})</span>
          </h2>
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 focus:bg-white w-56"
          />
        </div>
        {filteredUsers.length === 0 ? (
          <p className="text-slate-500 text-sm">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Display ID</th>
                  <th className="pb-3 pr-4 font-medium">Full Name</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Type</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Admin</th>
                  <th className="pb-3 pr-4 font-medium">Apps</th>
                  <th className="pb-3 pr-4 font-medium">Created</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} className={`border-b border-slate-100 last:border-0 ${u.is_active === false ? 'opacity-50' : ''}`}>
                    {editingProfileUserId === u.id ? (
                      <>
                        <td className="py-3 pr-4">
                          <input
                            type="text"
                            value={editForm.display_id}
                            onChange={(e) => setEditForm((f) => ({ ...f, display_id: e.target.value }))}
                            className="rounded border border-slate-200 px-2 py-1 text-sm w-28"
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <input
                            type="text"
                            value={editForm.full_name}
                            onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                            placeholder="Full name"
                            className="rounded border border-slate-200 px-2 py-1 text-sm w-32"
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder="Email"
                            className="rounded border border-slate-200 px-2 py-1 text-sm w-40"
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            value={editForm.is_internal ? 'internal' : 'external'}
                            onChange={(e) => setEditForm((f) => ({ ...f, is_internal: e.target.value === 'internal' }))}
                            className="rounded border border-slate-200 px-2 py-1 text-sm"
                          >
                            <option value="internal">Internal</option>
                            <option value="external">External</option>
                          </select>
                        </td>
                        <td colSpan={3} />
                        <td className="py-3 pr-4" />
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveProfile(u.id)}
                              disabled={loadingUserId === u.id}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              {loadingUserId === u.id ? '...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingProfileUserId(null)}
                              className="text-xs text-slate-400 hover:text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 pr-4 text-slate-900 font-medium">{u.display_id}</td>
                        <td className="py-3 pr-4 text-slate-600">{u.full_name || <span className="text-slate-300">&mdash;</span>}</td>
                        <td className="py-3 pr-4 text-slate-600">{u.email || <span className="text-slate-300">&mdash;</span>}</td>
                        <td className="py-3 pr-4 text-slate-600">{u.is_internal ? 'Internal' : 'External'}</td>
                        <td className="py-3 pr-4">
                          {u.is_active === false ? (
                            <span className="inline-block rounded-full bg-red-50 text-red-600 px-2.5 py-0.5 text-xs font-medium">Inactive</span>
                          ) : (
                            <span className="inline-block rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-medium">Active</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {u.is_admin ? (
                            <span className="inline-block rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-xs font-medium">Admin</span>
                          ) : (
                            <span className="text-slate-300">&mdash;</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {editingAppsUserId === u.id ? (
                            <div className="flex items-center gap-3">
                              {allApps.map((app) => (
                                <label key={app.slug} className="flex items-center gap-1 text-xs text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editingAppSlugs.includes(app.slug)}
                                    onChange={() => toggleEditingApp(app.slug)}
                                    className="accent-blue-600 rounded"
                                  />
                                  {app.name}
                                </label>
                              ))}
                              <button
                                onClick={() => saveApps(u.id)}
                                disabled={loadingUserId === u.id}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingAppsUserId(null)}
                                className="text-xs text-slate-400 hover:text-slate-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {u.is_admin ? (
                                <span className="text-xs text-slate-400 italic">All apps</span>
                              ) : u.app_slugs.length === 0 ? (
                                <span className="text-xs text-slate-300">None</span>
                              ) : (
                                u.app_slugs.map((slug) => {
                                  const app = allApps.find((a) => a.slug === slug)
                                  return (
                                    <span key={slug} className="inline-block rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs">
                                      {app?.name ?? slug}
                                    </span>
                                  )
                                })
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{formatDate(u.created_at)}</td>
                        <td className="py-3">
                          {confirmDeleteUserId === u.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-600">Delete?</span>
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                disabled={loadingUserId === u.id}
                                className="text-xs font-medium text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg"
                              >
                                {loadingUserId === u.id ? '...' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteUserId(null)}
                                className="text-xs text-slate-400 hover:text-slate-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEditProfile(u)}
                                className="text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 px-2 py-1 rounded-lg"
                              >
                                Edit
                              </button>
                              {editingAppsUserId !== u.id && (
                                <button
                                  onClick={() => startEditApps(u.id, u.app_slugs)}
                                  className="text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 px-2 py-1 rounded-lg"
                                >
                                  Apps
                                </button>
                              )}
                              {u.id !== currentUserId && (
                                <>
                                  <button
                                    onClick={() => handleToggleAdmin(u.id)}
                                    disabled={loadingUserId === u.id}
                                    className={`text-xs font-medium px-2 py-1 rounded-lg ${
                                      u.is_admin
                                        ? 'text-red-600 hover:bg-red-50'
                                        : 'text-blue-600 hover:bg-blue-50'
                                    } disabled:opacity-50`}
                                  >
                                    {loadingUserId === u.id ? '...' : u.is_admin ? 'Unadmin' : 'Admin'}
                                  </button>
                                  <button
                                    onClick={() => handleToggleActive(u.id)}
                                    disabled={loadingUserId === u.id}
                                    className={`text-xs font-medium px-2 py-1 rounded-lg ${
                                      u.is_active === false
                                        ? 'text-emerald-600 hover:bg-emerald-50'
                                        : 'text-amber-600 hover:bg-amber-50'
                                    } disabled:opacity-50`}
                                  >
                                    {loadingUserId === u.id ? '...' : u.is_active === false ? 'Reactivate' : 'Deactivate'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteUserId(u.id)}
                                    className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </>
                    )}
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
