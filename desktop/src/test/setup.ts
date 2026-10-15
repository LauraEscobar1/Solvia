import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import i18n from '@/i18n'
import { useSessionStore } from '@/stores/session'
import { DEFAULT_API_BASE_URL, useSettingsStore } from '@/stores/settings'
import { useThemeStore } from '@/stores/theme'
import { installMatchMediaMock } from './matchMedia'

beforeEach(async () => {
  installMatchMediaMock()
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
  useThemeStore.setState({ preference: 'system' })
  useSettingsStore.setState({ apiBaseUrl: DEFAULT_API_BASE_URL })
  useSessionStore.getState().clear()
  await i18n.changeLanguage('es')
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})
