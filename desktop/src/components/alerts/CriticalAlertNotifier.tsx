import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAlertMessage } from '@/lib/alerts/messages'
import { nativeNotificationsAvailable, notify } from '@/lib/alerts/notifications'
import { useCriticalAlerts } from '@/lib/api/alerts'
import { useSettingsStore } from '@/stores/settings'

export function CriticalAlertNotifier() {
  const { t } = useTranslation('alerts')
  const wanted = useSettingsStore((state) => state.criticalNotifications)
  const enabled = wanted && nativeNotificationsAvailable()
  const alerts = useCriticalAlerts(enabled)
  const message = useAlertMessage()
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!enabled) {
      seen.current = null
      return
    }
    if (!alerts.data) return
    if (seen.current === null) {
      seen.current = new Set(alerts.data.map((alert) => alert.id))
      return
    }
    for (const alert of alerts.data) {
      if (seen.current.has(alert.id)) continue
      seen.current.add(alert.id)
      notify(t('notification.title'), message(alert))
    }
  }, [alerts.data, enabled, message, t])

  return null
}
