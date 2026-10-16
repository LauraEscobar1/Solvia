import { isTauri } from '@tauri-apps/api/core'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

export function nativeNotificationsAvailable(): boolean {
  return isTauri()
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauri()) return false
  if (await isPermissionGranted()) return true
  return (await requestPermission()) === 'granted'
}

export function notify(title: string, body: string): void {
  if (isTauri()) sendNotification({ title, body })
}
