import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const DEFAULT_API_BASE_URL = 'http://localhost:8000'
export const SETTINGS_STORAGE_KEY = 'solvia.settings'

interface SettingsState {
  apiBaseUrl: string
  criticalNotifications: boolean
  setApiBaseUrl: (url: string) => void
  resetApiBaseUrl: () => void
  setCriticalNotifications: (enabled: boolean) => void
}

export function normalizeApiBaseUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  url.hash = ''
  url.search = ''
  return url.href.replace(/\/+$/, '')
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiBaseUrl: DEFAULT_API_BASE_URL,
      criticalNotifications: false,
      setApiBaseUrl: (url) => {
        set({ apiBaseUrl: url })
      },
      resetApiBaseUrl: () => {
        set({ apiBaseUrl: DEFAULT_API_BASE_URL })
      },
      setCriticalNotifications: (enabled) => {
        set({ criticalNotifications: enabled })
      },
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ apiBaseUrl, criticalNotifications }) => ({
        apiBaseUrl,
        criticalNotifications,
      }),
    },
  ),
)
