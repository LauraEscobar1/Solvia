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

export const PILL_TONE_CLASSES: Record<PillTone, string> = {
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
