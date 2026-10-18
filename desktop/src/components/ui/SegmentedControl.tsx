import type { LucideIcon } from 'lucide-react'
import { type KeyboardEvent, useRef } from 'react'
import { moveFocus } from '@/lib/focus'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

interface SegmentedControlProps<T extends string> {
  label: string
  options: readonly SegmentOption<T>[]
  value: T | null
  onChange: (value: T) => void
  variant?: 'solid' | 'raised'
  className?: string
}

const SELECTED = {
  solid: 'bg-solid text-solid-foreground',
  raised: 'bg-surface-raised text-foreground shadow-card',
} as const

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'solid',
  className = '',
}: SegmentedControlProps<T>) {
  const group = useRef<HTMLDivElement>(null)
  const tabbable = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const radios = Array.from(group.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])
    if (!moveFocus(radios, document.activeElement, event.key)) return
    event.preventDefault()
    const focused = document.activeElement
    const option = options.find((item) => focused instanceof HTMLElement && item.value === focused.dataset.value)
    if (option) onChange(option.value)
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`glass border-card-edge inline-flex items-center gap-1 rounded-full border p-1 ${className}`}
    >
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }, index) => {
        const checked = optionValue === value
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabbable ? 0 : -1}
            data-value={optionValue}
            onClick={() => {
              onChange(optionValue)
            }}
            className={[
              'text-body inline-flex h-8 items-center gap-1.5 rounded-full px-4 font-semibold whitespace-nowrap transition-colors',
              checked ? SELECTED[variant] : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {Icon && <Icon className="size-4" aria-hidden="true" />}
            {optionLabel}
          </button>
        )
      })}
    </div>
  )
}
