import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/Checkbox'
import { InlineAlert } from '@/components/ui/States'
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={inputId} className="text-body font-semibold">
          {t('notifications.critical')}
        </label>
        <Switch
          id={inputId}
          label={t('notifications.critical')}
          checked={enabled && available}
          disabled={!available}
          onChange={(checked) => {
            void onToggle(checked)
          }}
        />
      </div>
      {!available && <p className="text-caption text-muted-foreground">{t('notifications.unavailable')}</p>}
      {denied && <InlineAlert tone="error">{t('notifications.denied')}</InlineAlert>}
    </div>
  )
}
