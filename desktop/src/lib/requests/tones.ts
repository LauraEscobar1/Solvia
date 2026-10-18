import type { RequestStatus } from '@/lib/api/types'

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
