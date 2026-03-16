export interface AppDefinition {
  slug: string
  name: string
  description: string
  icon: 'referrals' | 'generic'
  basePath: string
}

export const APPS: AppDefinition[] = [
  {
    slug: 'referrals',
    name: 'Referrals',
    description: 'Register and track contractor referrals',
    icon: 'referrals',
    basePath: '/referrals',
  },
]

export function getAppBySlug(slug: string): AppDefinition | undefined {
  return APPS.find((app) => app.slug === slug)
}

export function getAppByPath(pathname: string): AppDefinition | undefined {
  return APPS.find((app) => pathname === app.basePath || pathname.startsWith(app.basePath + '/'))
}
