import { BellRing, Inbox, LayoutDashboard, type LucideIcon, Settings, ShieldCheck } from 'lucide-react'
import type { UserRole } from '@/lib/api/types'

export interface NavItem {
  path: string
  labelKey: 'dashboard' | 'requests' | 'alerts' | 'admin' | 'settings'
  icon: LucideIcon
  roles?: readonly UserRole[]
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', labelKey: 'dashboard', icon: LayoutDashboard },
  { path: '/requests', labelKey: 'requests', icon: Inbox },
  { path: '/alerts', labelKey: 'alerts', icon: BellRing },
  { path: '/admin', labelKey: 'admin', icon: ShieldCheck, roles: ['admin'] },
  { path: '/settings', labelKey: 'settings', icon: Settings },
]

export function navItemsForRole(role: UserRole | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || (role !== undefined && item.roles.includes(role)))
}

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  )
}
