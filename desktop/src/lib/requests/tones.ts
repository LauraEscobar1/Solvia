import type { StatusTone } from '@/components/StatusBadge'
import type { RequestStatus } from '@/lib/api/types'
import type { ThemeColorToken } from '@/lib/themeColors'

export const STATUS_TONES: Record<RequestStatus, StatusTone> = {
  received: 'neutral',
  assigned: 'warning',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
}

export const TONE_COLORS: Record<StatusTone, ThemeColorToken> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'muted-foreground',
}
