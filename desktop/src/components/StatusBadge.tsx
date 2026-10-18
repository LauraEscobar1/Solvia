import type { ReactNode } from 'react'

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral'

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-accent-soft text-accent-text',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
  neutral: 'bg-neutral-soft text-neutral-soft-foreground',
}

const DOT_CLASSES: Record<StatusTone, string> = {
  success: 'bg-accent-line',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-subtle-foreground',
}

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`text-caption inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${DOT_CLASSES[tone]}`} aria-hidden="true" />
      {children}
    </span>
  )
}
