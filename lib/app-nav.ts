export interface NavLink {
  href: string
  label: string
  adminOnly: boolean
}

export const APP_NAV: Record<string, NavLink[]> = {
  _platform: [
    { href: '/apps/admin', label: 'Users & Access', adminOnly: true },
  ],
  reports: [
    { href: '/reports', label: 'Run Report', adminOnly: false },
  ],
  referrals: [
    { href: '/referrals', label: 'My Referrals', adminOnly: false },
    { href: '/referrals/submit', label: 'New Referral', adminOnly: false },
    { href: '/referrals/admin', label: 'Dashboard', adminOnly: true },
    { href: '/referrals/admin/checks', label: 'Run Checks', adminOnly: true },
  ],
}
