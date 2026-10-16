import type { AllowedTransition, RequestStatus } from '@/lib/api/types'

export type TransitionAction =
  | 'assign'
  | 'return'
  | 'start'
  | 'complete'
  | 'stepBack'
  | 'cancel'
  | 'reopen'

const ACTIONS: Partial<Record<`${RequestStatus}:${RequestStatus}`, TransitionAction>> = {
  'received:assigned': 'assign',
  'assigned:received': 'return',
  'assigned:in_progress': 'start',
  'in_progress:completed': 'complete',
  'in_progress:assigned': 'stepBack',
  'received:cancelled': 'cancel',
  'assigned:cancelled': 'cancel',
  'in_progress:cancelled': 'cancel',
  'completed:in_progress': 'reopen',
}

export function transitionAction(from: RequestStatus, to: RequestStatus): TransitionAction {
  return ACTIONS[`${from}:${to}`] ?? 'start'
}

export function needsDialog(transition: AllowedTransition): boolean {
  return transition.requires_comment || transition.requires_assignee
}
