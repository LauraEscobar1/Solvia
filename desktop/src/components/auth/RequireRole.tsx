import { Navigate, Outlet } from 'react-router'
import type { UserRole } from '@/lib/api/types'
import { useSessionStore } from '@/stores/session'

const ADMIN_ROLES: readonly UserRole[] = ['admin']

export function RequireRole({ roles }: { roles: readonly UserRole[] }) {
  const role = useSessionStore((state) => state.user?.role)
  if (!role || !roles.includes(role)) return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireAdmin() {
  return <RequireRole roles={ADMIN_ROLES} />
}
