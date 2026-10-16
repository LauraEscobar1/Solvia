import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useUnreadAlertCount } from '@/lib/api/alerts'
import { useFormatters } from '@/lib/format'

const MAX_BADGE = 99

export function AlertBell() {
  const { t } = useTranslation('alerts')
  const { number } = useFormatters()
  const unread = useUnreadAlertCount()
  const count = unread.data ?? 0

  return (
    <Link
      to="/alerts?is_read=false"
      aria-label={t('bell', { count })}
      className="text-muted-foreground hover:bg-surface-muted hover:text-foreground relative rounded-lg p-2 transition-colors"
    >
      <Bell className="size-5" aria-hidden="true" />
      {count > 0 && (
        <span
          data-testid="alert-bell-count"
          className="bg-danger absolute -top-0.5 -right-0.5 min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-semibold text-white"
        >
          {count > MAX_BADGE ? `${number(MAX_BADGE)}+` : number(count)}
        </span>
      )}
    </Link>
  )
}
