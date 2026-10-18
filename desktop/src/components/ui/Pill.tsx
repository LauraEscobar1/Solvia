import type { ReactNode } from 'react'

export type PillTone =
  | 'neutral'
  | 'solid'
  | 'outline'
  | 'subtle-outline'
  | 'plain'
  | 'danger'
  | 'warning'
  | 'stalled'
  | 'accent'
  | 'accent-soft'

const TONE_CLASSES: Record<PillTone, string> = {
  neutral: 'bg-neutral-soft text-neutral-soft-foreground',
  solid: 'bg-solid text-solid-foreground',
  outline: 'border border-foreground text-foreground',
  'subtle-outline': 'border border-divider text-muted-foreground',
  plain: 'text-muted-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  stalled: 'bg-stalled-soft text-stalled-soft-foreground',
  accent: 'bg-accent text-accent-foreground',
  'accent-soft': 'bg-accent-soft text-accent-text',
}

interface PillProps {
  tone?: PillTone
  icon?: ReactNode
  size?: 'sm' | 'md'
  className?: string
  title?: string
  children: ReactNode
}

export function Pill({ tone = 'neutral', icon, size = 'md', className = '', title, children }: PillProps) {
  return (
    <span
      title={title}
      className={[
        'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold whitespace-nowrap',
        size === 'sm' ? 'text-micro h-5 px-2' : 'text-caption h-6 px-2.5',
        TONE_CLASSES[tone],
        className,
      ].join(' ')}
    >
      {icon}
      {children}
    </span>
  )
}
