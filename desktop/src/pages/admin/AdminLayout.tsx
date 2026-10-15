import { useTranslation } from 'react-i18next'
import { Navigate, NavLink, Outlet } from 'react-router'

const TABS = ['areas', 'users', 'sla'] as const

export function AdminLayout() {
  const { t } = useTranslation('admin')

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <nav aria-label={t('sections')} className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <NavLink
            key={tab}
            to={tab}
            className={({ isActive }) =>
              [
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              ].join(' ')
            }
          >
            {t(`tabs.${tab}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}

export function AdminIndex() {
  return <Navigate to="areas" replace />
}
