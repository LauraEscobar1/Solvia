import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, Ref } from 'react'
import { BUTTON_BASE } from './buttonStyles'
import { Tooltip } from './Tooltip'

export type IconButtonVariant = 'ghost' | 'outline' | 'solid' | 'accent' | 'glass'

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  ghost: 'text-foreground hover:bg-surface-sunken',
  outline: 'border border-divider bg-control text-foreground hover:bg-surface-sunken',
  solid: 'bg-solid text-solid-foreground hover:opacity-90',
  accent: 'bg-accent text-accent-foreground hover:brightness-95',
  glass: 'glass border border-card-edge text-foreground hover:bg-surface-sunken',
}

const SIZE_CLASSES = {
  sm: 'size-8',
  md: 'size-10',
} as const

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  icon: LucideIcon
  variant?: IconButtonVariant
  size?: keyof typeof SIZE_CLASSES
  tooltip?: boolean
  tooltipHidden?: boolean
  tooltipSide?: 'top' | 'bottom'
  tooltipAlign?: 'center' | 'end'
  spin?: boolean
  onSpinCycle?: () => void
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  label,
  icon: Icon,
  variant = 'ghost',
  size = 'md',
  tooltip = true,
  tooltipHidden = false,
  tooltipSide,
  tooltipAlign,
  spin = false,
  onSpinCycle,
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={`${BUTTON_BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      <Icon
        className={`size-4 ${spin ? 'animate-spin' : ''}`}
        aria-hidden="true"
        onAnimationIteration={onSpinCycle}
      />
    </button>
  )
  return tooltip ? (
    <Tooltip label={label} side={tooltipSide} align={tooltipAlign} hidden={tooltipHidden}>
      {button}
    </Tooltip>
  ) : (
    button
  )
}
