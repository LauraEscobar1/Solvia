import { useEffect } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'solvia.theme'
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

interface ThemeState {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'system',
      setPreference: (preference) => {
        set({ preference })
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ preference }) => ({ preference }),
    },
  ),
)

function darkSchemeQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_SCHEME_QUERY) : null
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return darkSchemeQuery()?.matches ? 'dark' : 'light'
}

export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function useThemeSync(): void {
  const preference = useThemeStore((state) => state.preference)

  useEffect(() => {
    applyTheme(resolveTheme(preference))
    if (preference !== 'system') return

    const query = darkSchemeQuery()
    if (!query) return
    const onChange = () => {
      applyTheme(resolveTheme('system'))
    }
    query.addEventListener('change', onChange)
    return () => {
      query.removeEventListener('change', onChange)
    }
  }, [preference])
}
