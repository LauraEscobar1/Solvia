import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  selected: boolean
  children: ReactNode
}

export function Chip({ selected, className = '', type = 'button', children, ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={[
        'text-body inline-flex h-10 items-center gap-2 rounded-full border px-4 font-semibold whitespace-nowrap transition-colors',
        selected
          ? 'bg-accent text-accent-foreground border-transparent'
          : 'border-divider bg-control text-foreground hover:bg-surface-sunken',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}

type CountTone = 'solid' | 'alert' | 'accent'

const COUNT_TONES: Record<CountTone, string> = {
  solid: 'bg-solid text-solid-foreground',
  alert: 'bg-alert-count text-ink',
  accent: 'bg-accent text-accent-foreground',
}

export function CountBadge({
  tone = 'solid',
  className = '',
  children,
}: {
  tone?: CountTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={`text-micro inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 tabular-nums ${COUNT_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
