import { useSyncExternalStore } from 'react'

export const THEME_COLOR_TOKENS = [
  'foreground',
  'muted-foreground',
  'accent-line',
  'accent-band',
  'chart-grid',
  'surface-solid',
] as const

export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number]
export type ThemeColors = Record<ThemeColorToken, string>

let cached: { key: string; colors: ThemeColors } | null = null

export function readThemeColors(root: HTMLElement = document.documentElement): ThemeColors {
  const styles = getComputedStyle(root)
  const colors = {} as ThemeColors
  for (const token of THEME_COLOR_TOKENS) {
    colors[token] = styles.getPropertyValue(`--${token}`).trim()
  }
  return colors
}

function snapshot(): ThemeColors {
  const root = document.documentElement
  const key = `${root.className}|${root.getAttribute('style') ?? ''}`
  if (cached?.key !== key) cached = { key, colors: readThemeColors(root) }
  return cached.colors
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style'],
  })
  return () => {
    observer.disconnect()
  }
}

export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribe, snapshot)
}
