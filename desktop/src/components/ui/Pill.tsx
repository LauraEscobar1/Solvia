import type { ReactNode } from 'react'
import { PILL_TONE_CLASSES, type PillTone } from './pillStyles'

export type { PillTone } from './pillStyles'

const PILL_SIZES = {
  sm: 'text-micro h-5 px-2',
  md: 'text-caption h-6 px-2.5',
  lg: 'text-body h-7 px-3',
} as const

interface PillProps {
  tone?: PillTone
  icon?: ReactNode
  size?: 'sm' | 'md' | 'lg'
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
        PILL_SIZES[size],
        PILL_TONE_CLASSES[tone],
        className,
      ].join(' ')}
    >
      {icon}
      {children}
    </span>
  )
}
