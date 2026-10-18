import type { RequestSummary } from '@/lib/api/types'

export type DueRequest = Pick<
  RequestSummary,
  'status' | 'due_at' | 'sla_status' | 'is_stalled' | 'last_activity_at'
>

export type DueKind = 'overdue' | 'at_risk' | 'stalled' | 'on_track' | 'none' | 'closed'

export function dueKind(request: DueRequest): DueKind {
  if (request.status === 'completed' || request.status === 'cancelled') return 'closed'
  if (request.sla_status === 'overdue') return 'overdue'
  if (request.sla_status === 'at_risk') return 'at_risk'
  if (request.is_stalled) return 'stalled'
  return request.due_at ? 'on_track' : 'none'
}
