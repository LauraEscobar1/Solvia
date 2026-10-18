import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useSessionStore } from '@/stores/session'

export const CHANGE_PASSWORD_PATH = '/change-password'

export function RequireAuth() {
  const { t } = useTranslation('auth')
  const status = useSessionStore((state) => state.status)
  const user = useSessionStore((state) => state.user)
  const { pathname } = useLocation()

  if (status === 'loading') {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-body">
        {t('session.loading')}
      </div>
    )
  }
  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace state={{ from: pathname }} />
  }
  if (user.must_change_password && pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />
  }
  return <Outlet />
}
