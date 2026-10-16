import type { CSSProperties } from 'react'
import type { ThemeColors } from '@/lib/themeColors'

export const CHART_HEIGHT = 240

export function chartFrame(): CSSProperties {
  return { width: '100%', height: CHART_HEIGHT }
}

export function axisProps(colors: ThemeColors) {
  return {
    stroke: colors.border,
    tick: { fill: colors['muted-foreground'], fontSize: 12 },
    tickLine: false,
  }
}

export function tooltipProps(colors: ThemeColors) {
  return {
    contentStyle: {
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      color: colors.foreground,
      fontSize: 12,
    },
    labelStyle: { color: colors.foreground },
    cursor: { fill: colors['surface-muted'] },
  }
}
