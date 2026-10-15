import { BellRing, Inbox, LayoutDashboard, type LucideIcon, Settings, ShieldCheck } from 'lucide-react'

export interface NavItem {
  path: string
  labelKey: 'dashboard' | 'requests' | 'alerts' | 'admin' | 'settings'
  icon: LucideIcon
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', labelKey: 'dashboard', icon: LayoutDashboard },
  { path: '/requests', labelKey: 'requests', icon: Inbox },
  { path: '/alerts', labelKey: 'alerts', icon: BellRing },
  { path: '/admin', labelKey: 'admin', icon: ShieldCheck },
  { path: '/settings', labelKey: 'settings', icon: Settings },
]

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  )
}
