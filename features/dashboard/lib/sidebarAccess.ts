/**
 * Sidebar filtering from capabilities the session already has: the role's
 * canAccessDashboard flag and Keystone's per-session list `isHidden` from admin meta.
 * Plain module: no 'use server' / 'use client', no @/ imports.
 */

type SidebarList = { path: string; isHidden?: boolean | null }
type SidebarRole = { canAccessDashboard?: boolean | null } & Record<string, boolean | null | undefined>
type SidebarUser = { role?: SidebarRole | null } | null | undefined

/** Only an explicit false hides navigation; an unknown user is left to the middleware. */
export function canUseDashboardNav(user: SidebarUser) {
  return user?.role?.canAccessDashboard !== false
}

export function visibleSidebarLists<T extends SidebarList>(lists: T[], user: SidebarUser): T[] {
  if (!canUseDashboardNav(user)) return []
  return lists.filter((list) => !list.isHidden)
}

/**
 * Lists a platform page queries at the top level. Each list's `ui.isHidden` follows its query access
 * (features/keystone/models/index.ts), so the page is usable only when none of them is hidden.
 */
export const PLATFORM_PAGE_LISTS: Record<string, string[]> = {
  tonight: ['shows'],
  shows: ['shows', 'show-templates'],
  orders: ['ticket-orders'],
  customers: ['ticket-orders'],
  talent: ['comedians', 'shows'],
  'open-mic': ['shows', 'open-mic-signups'],
  'floor-menu': ['rooms', 'menu-items'],
  payouts: ['comedian-payouts', 'show-settlements', 'runs'],
  reports: ['comedian-payouts'],
  'promo-codes': ['promo-codes'],
  'payment-providers': ['payment-providers'],
  settings: ['venues', 'venue-settings-items'],
  store: ['venue-settings-items'],
}

/** Pages backed by a list that is hidden from navigation by design, so they follow role permissions instead. */
export const PLATFORM_PAGE_PERMISSIONS: Record<string, string[]> = {
  approvals: ['canManageOrders', 'canManageChecks', 'canIssueRefunds'],
}

export function canUsePlatformPage(slug: string, lists: SidebarList[], user: SidebarUser) {
  const hidden = new Set(lists.filter((list) => list.isHidden).map((list) => list.path))
  if ((PLATFORM_PAGE_LISTS[slug] ?? [slug]).some((path) => hidden.has(path))) return false
  const needed = PLATFORM_PAGE_PERMISSIONS[slug]
  if (!needed || !user?.role) return true
  return needed.some((permission) => user.role?.[permission] === true)
}

/**
 * A platform page whose first segment is a list path follows that list's visibility;
 * pages that are not tied to one list stay visible to dashboard users.
 */
export function visiblePlatformItems<T extends { href: string }>(
  items: T[],
  lists: SidebarList[],
  user: SidebarUser
): T[] {
  if (!canUseDashboardNav(user)) return []
  return items.filter((item) => {
    const slug = item.href.split('/platform/')[1]?.split(/[/?#]/)[0]
    return !slug || canUsePlatformPage(slug, lists, user)
  })
}
