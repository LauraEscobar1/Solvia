import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, Ref } from 'react'
import { type ButtonSize, type ButtonVariant, buttonClasses } from './buttonStyles'

export type { ButtonSize, ButtonVariant } from './buttonStyles'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'outline',
  size = 'md',
  loading = false,
  className = '',
  type = 'button',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClasses(variant, size)} ${className}`}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
