import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeSelector } from '@/components/ThemeSelector'
import { navItemForPath } from './navigation'
import { UserMenu } from './UserMenu'

export function Header() {
  const { t } = useTranslation(['common', 'nav'])
  const { pathname } = useLocation()
  const current = navItemForPath(pathname)

  return (
    <header className="bg-background/80 flex h-16 shrink-0 items-center justify-between gap-4 border-b px-6 backdrop-blur">
      <h1 className="text-lg font-semibold tracking-tight">
        {current ? t(`nav:${current.labelKey}`) : t('appName')}
      </h1>
      <div className="flex items-center gap-3">
        <LanguageSelector />
        <ThemeSelector />
        <UserMenu />
      </div>
    </header>
  )
}
