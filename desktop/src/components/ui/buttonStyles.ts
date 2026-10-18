export type ButtonVariant = 'accent' | 'solid' | 'outline' | 'ghost' | 'danger' | 'danger-text'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  accent: 'bg-accent text-accent-foreground shadow-accent hover:brightness-95',
  solid: 'bg-solid text-solid-foreground hover:opacity-90',
  outline: 'border border-divider bg-control text-foreground hover:bg-surface-sunken',
  ghost: 'text-foreground hover:bg-surface-sunken',
  danger: 'bg-danger text-danger-foreground hover:brightness-95',
  'danger-text': 'text-danger-text hover:bg-danger-soft/50',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-caption',
  md: 'h-10 px-4.5 text-body',
  lg: 'h-12 px-6 text-body',
}

export const BUTTON_BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[transform,box-shadow] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] not-disabled:motion-safe:hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-55'

export function buttonClasses(variant: ButtonVariant = 'outline', size: ButtonSize = 'md'): string {
  return `${BUTTON_BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`
}
