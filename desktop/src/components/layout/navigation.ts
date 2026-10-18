import {
  BellRing,
  BrainCircuit,
  Building2,
  ChartColumn,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Timer,
  Users,
} from 'lucide-react'

export interface NavItem {
  path: string
  labelKey: 'dashboard' | 'requests' | 'analytics' | 'alerts'
  icon: LucideIcon
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', labelKey: 'dashboard', icon: LayoutDashboard },
  { path: '/requests', labelKey: 'requests', icon: Inbox },
  { path: '/analytics', labelKey: 'analytics', icon: ChartColumn },
  { path: '/alerts', labelKey: 'alerts', icon: BellRing },
]

export interface AdminItem {
  path: string
  labelKey: 'users' | 'areas' | 'sla' | 'ai'
  icon: LucideIcon
}

export const ADMIN_ITEMS: readonly AdminItem[] = [
  { path: '/admin/users', labelKey: 'users', icon: Users },
  { path: '/admin/areas', labelKey: 'areas', icon: Building2 },
  { path: '/admin/sla', labelKey: 'sla', icon: Timer },
  { path: '/admin/ai', labelKey: 'ai', icon: BrainCircuit },
]
