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

export const STAGE_COLORS: Record<RequestStatus, string> = {
  received: 'bg-stage-received',
  assigned: 'bg-stage-assigned',
  in_progress: 'bg-stage-in-progress',
  completed: 'bg-stage-completed',
  cancelled: 'bg-neutral-soft',
}

export const STAGE_ORDER: readonly RequestStatus[] = ['received', 'assigned', 'in_progress', 'completed']

export type RiskLevel = 'high' | 'medium' | 'low'

export const HIGH_RISK = 70
export const MEDIUM_RISK = 40

export function riskLevel(score: number): RiskLevel {
  if (score >= HIGH_RISK) return 'high'
  if (score >= MEDIUM_RISK) return 'medium'
  return 'low'
}
