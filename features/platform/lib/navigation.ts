import {
  Mic2, CalendarDays, Ticket, Users, UtensilsCrossed, Wallet, Tag, CreditCard, Settings, Clapperboard, Radio, UserRound,
  LucideIcon, Store, RefreshCw, BarChart3,
} from 'lucide-react'

export interface PlatformNavItem {
  title: string
  href: string
  color: string
  description: string
  icon: LucideIcon
  group?: string
}

export interface PlatformNavGroup {
  id: string
  title: string
  icon: LucideIcon
  items: PlatformNavItem[]
}

export const platformNavItems: PlatformNavItem[] = [
  { title: 'Tonight',        href: '/platform/tonight',           color: 'amber',  description: 'Door check-in, seating, checks and running order.', icon: Radio,           group: 'standalone' },
  { title: 'Shows',          href: '/platform/shows',             color: 'blue',   description: 'Calendar and list of shows with tiers and orders.',  icon: CalendarDays,    group: 'standalone' },
  { title: 'Approvals', href: '/platform/approvals', color: 'amber', description: 'Independent manager approvals.', icon: Users, group: 'standalone' },
  { title: 'Orders',         href: '/platform/orders',            color: 'green',  description: 'Ticket orders, refunds and comps.',                 icon: Ticket,          group: 'standalone' },

  { title: 'Lineups & talent', href: '/platform/talent',          color: 'purple', description: 'Comedians, booking grid and offers.',               icon: Clapperboard,    group: 'booking' },
  { title: 'Open mic',       href: '/platform/open-mic',          color: 'pink',   description: 'Signup list, lottery and call order.',              icon: Mic2,            group: 'booking' },

  { title: 'Floor & menu',   href: '/platform/floor-menu',        color: 'cyan',   description: 'Rooms, sections, tables and menu items.',           icon: UtensilsCrossed, group: 'venue' },
  { title: 'Payouts',        href: '/platform/payouts',           color: 'emerald',description: 'Comedian payouts and nightly settlements.',         icon: Wallet,          group: 'venue' },
  { title: 'Reports',        href: '/platform/reports',           color: 'emerald',description: 'Attendance, revenue, talent cost and CSV export.',         icon: BarChart3,          group: 'venue' },
  { title: 'Promo codes',    href: '/platform/promo-codes',       color: 'rose',   description: 'Discount and comp codes.',                          icon: Tag,             group: 'venue' },
  { title: 'Customers',      href: '/platform/customers',         color: 'slate',  description: 'People who bought tickets.',                        icon: UserRound,       group: 'venue' },

  { title: 'Payment providers', href: '/platform/payment-providers', color: 'slate', description: 'Payment gateways.',                              icon: CreditCard,      group: 'integrations' },
  { title: 'Settings',       href: '/platform/settings',          color: 'slate',  description: 'Venue, minimum, fees and policies.',                icon: Settings,        group: 'integrations' },
  { title: 'Store',       href: '/platform/store',          color: 'slate',  description: 'Configure store settings, logo, and branding.',                icon: Store,        group: 'integrations' },
]

export const platformStandaloneItems = platformNavItems.filter((item) => item.group === 'standalone')

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'booking',      title: 'Booking',      icon: Users,     items: platformNavItems.filter((i) => i.group === 'booking') },
  { id: 'venue',        title: 'Venue',        icon: Store,     items: platformNavItems.filter((i) => i.group === 'venue') },
  { id: 'integrations', title: 'Setup',        icon: RefreshCw, items: platformNavItems.filter((i) => i.group === 'integrations') },
]

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return platformNavItems.map((item) => ({ ...item, href: `${basePath}${item.href}` }))
}
