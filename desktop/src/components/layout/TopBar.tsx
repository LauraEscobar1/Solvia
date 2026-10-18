import { LogOut, Menu as MenuIcon, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { CountBadge } from '@/components/ui/Chip'
import { Menu, type MenuEntry } from '@/components/ui/Menu'
import { useUnreadAlertCount } from '@/lib/api/alerts'
import { signOut } from '@/lib/auth/session'
import { useFormatters } from '@/lib/format'
import { useSessionStore } from '@/stores/session'
import { ADMIN_ITEMS, NAV_ITEMS } from './navigation'

const MAX_BADGE = 99

function MainNavigation() {
  const { t } = useTranslation('nav')
  const { number } = useFormatters()
  const unread = useUnreadAlertCount().data ?? 0
  const badge = unread > MAX_BADGE ? `${number(MAX_BADGE)}+` : number(unread)

  return (
    <nav aria-label={t('mainNavigation')} className="on-dark">
      <ul className="bg-carbon flex items-center gap-1 rounded-full p-1.5">
        {NAV_ITEMS.map(({ path, labelKey, icon: Icon }) => (
          <li key={path}>
            <NavLink
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                [
                  'text-body inline-flex h-10 items-center gap-2 rounded-full px-4 font-semibold whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-nav-foreground hover:text-feature-foreground',
                ].join(' ')
              }
            >
              <Icon className="size-4 lg:hidden" aria-hidden="true" />
              <span className="max-lg:sr-only">{t(labelKey)}</span>
              {labelKey === 'alerts' && unread > 0 && (
                <>
                  <CountBadge tone="alert" className="max-lg:absolute max-lg:translate-x-3 max-lg:-translate-y-3">
                    <span aria-hidden="true">{badge}</span>
                  </CountBadge>
                  {' '}
                  <span className="sr-only">{t('unread', { count: unread })}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function AccountMenu() {
  const { t } = useTranslation(['nav', 'auth'])
  const user = useSessionStore((state) => state.user)
  if (!user) return null

  const entries: MenuEntry[] = [
    { kind: 'item', id: 'settings', label: t('settings'), icon: Settings, to: '/settings' },
  ]
  if (user.role === 'admin') {
    entries.push({
      kind: 'group',
      id: 'admin',
      label: t('admin'),
      items: ADMIN_ITEMS.map(({ path, labelKey, icon }) => ({
        kind: 'item',
        id: labelKey,
        label: t(labelKey),
        icon,
        to: path,
      })),
    })
  }
  entries.push(
    { kind: 'separator', id: 'separator' },
    {
      kind: 'item',
      id: 'sign-out',
      label: t('auth:session.signOut'),
      icon: LogOut,
      onSelect: () => {
        void signOut()
      },
    },
  )

  return (
    <Menu
      label={t('accountMenu')}
      icon={MenuIcon}
      entries={entries}
      header={
        <div className="flex flex-col gap-0.5">
          <span className="text-body font-semibold">{user.full_name}</span>
          <span className="text-caption text-muted-foreground truncate">{user.email}</span>
          <span className="text-caption text-subtle-foreground">{t(`auth:roles.${user.role}`)}</span>
        </div>
      }
    />
  )
}

function CurrentUser() {
  const { t } = useTranslation('auth')
  const user = useSessionStore((state) => state.user)
  if (!user) return null
  return (
    <div className="flex items-center gap-3">
      <Avatar name={user.full_name} size="md" self />
      <div className="hidden flex-col leading-tight xl:flex">
        <span className="text-body font-semibold">{user.full_name}</span>
        <span className="text-caption text-muted-foreground">{t(`roles.${user.role}`)}</span>
      </div>
    </div>
  )
}

export function TopBar() {
  const { t } = useTranslation()

  return (
    <header className="glass border-card-edge mx-auto flex h-17 w-full max-w-page items-center gap-4 rounded-full border px-3 pl-6 shadow-card">
      <div className="flex flex-1 items-center">
        <Link to="/" className="text-wordmark text-accent-text rounded-full lowercase">
          {t('appName')}
        </Link>
      </div>
      <MainNavigation />
      <div className="flex flex-1 items-center justify-end gap-3">
        <CurrentUser />
        <AccountMenu />
      </div>
    </header>
  )
}
