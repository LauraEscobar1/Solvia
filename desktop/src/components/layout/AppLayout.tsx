import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { CriticalAlertNotifier } from '@/components/alerts/CriticalAlertNotifier'
import { TopBar } from './TopBar'

const MAIN_ID = 'main-content'

export function AppLayout() {
  const { t } = useTranslation('nav')

  return (
    <div className="flex min-h-full flex-col">
      <CriticalAlertNotifier />
      <button
        type="button"
        onClick={() => {
          document.getElementById(MAIN_ID)?.focus()
        }}
        className="bg-solid text-solid-foreground text-body sr-only fixed top-3 left-3 z-50 rounded-full px-4 py-2 font-semibold focus:not-sr-only"
      >
        {t('skipToContent')}
      </button>
      <div className="sticky top-0 z-40 px-6 pt-4 xl:px-10">
        <TopBar />
      </div>
      <div className="flex-1 px-6 xl:px-10">
        <main id={MAIN_ID} tabIndex={-1} className="mx-auto w-full max-w-page pt-8 pb-16 outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
