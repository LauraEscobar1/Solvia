import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ensureNotificationPermission,
  nativeNotificationsAvailable,
} from '@/lib/alerts/notifications'
import { useSettingsStore } from '@/stores/settings'

export function NotificationSettings() {
  const { t } = useTranslation('settings')
  const inputId = useId()
  const enabled = useSettingsStore((state) => state.criticalNotifications)
  const setEnabled = useSettingsStore((state) => state.setCriticalNotifications)
  const [denied, setDenied] = useState(false)
  const available = nativeNotificationsAvailable()

  const onToggle = async (checked: boolean) => {
    setDenied(false)
    if (!checked) {
      setEnabled(false)
      return
    }
    const granted = await ensureNotificationPermission()
    setEnabled(granted)
    setDenied(!granted)
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="flex items-center gap-3 text-sm font-medium">
        <input
          id={inputId}
          type="checkbox"
          className="accent-primary size-4"
          checked={enabled && available}
          disabled={!available}
          onChange={(event) => {
            void onToggle(event.target.checked)
          }}
        />
        {t('notifications.critical')}
      </label>
      {!available && (
        <p className="text-muted-foreground text-xs">{t('notifications.unavailable')}</p>
      )}
      {denied && (
        <p role="alert" className="text-danger text-xs">
          {t('notifications.denied')}
        </p>
      )}
    </div>
  )
}
