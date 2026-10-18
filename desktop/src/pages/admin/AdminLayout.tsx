import { useTranslation } from 'react-i18next'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'

const TABS = ['users', 'areas', 'sla', 'ai'] as const

export function AdminLayout() {
  const { t } = useTranslation(['admin', 'nav'])
  const centered = useLocation().pathname.endsWith('/ai')

  return (
    <div className={`flex flex-col gap-6 ${centered ? 'max-w-settings mx-auto w-full' : ''}`}>
      <PageHeader title={t('nav:admin')} />
      <nav aria-label={t('sections')} className="glass border-card-edge inline-flex items-center gap-1 self-start rounded-full border p-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab}
            to={tab}
            className={({ isActive }) =>
              [
                'text-body inline-flex h-8 items-center rounded-full px-4 font-semibold whitespace-nowrap transition-colors',
                isActive ? 'bg-solid text-solid-foreground' : 'text-muted-foreground hover:text-foreground',
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
  return <Navigate to="users" replace />
}
