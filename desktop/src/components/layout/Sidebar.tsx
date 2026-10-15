import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { NAV_ITEMS } from './navigation'

export function Sidebar() {
  const { t } = useTranslation(['common', 'nav'])

  return (
    <aside className="bg-sidebar flex w-60 shrink-0 flex-col border-r">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <img src="/solvia.svg" alt="" className="size-8" />
        <div className="leading-tight">
          <p className="font-semibold tracking-tight">{t('appName')}</p>
          <p className="text-muted-foreground text-xs">{t('tagline')}</p>
        </div>
      </div>

      <nav aria-label={t('nav:mainNavigation')} className="flex flex-col gap-0.5 px-3">
        {NAV_ITEMS.map(({ path, labelKey, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-soft text-primary'
                  : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
              ].join(' ')
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {t(`nav:${labelKey}`)}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
