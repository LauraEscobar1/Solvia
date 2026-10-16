import type { Language } from '@/locales'
import type { ThemePreference } from '@/stores/theme'

export const USER_ROLES = ['admin', 'supervisor', 'assignee', 'requester'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const REQUEST_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number]

export const SLA_STAGES = ['received', 'assigned', 'in_progress'] as const
export type SlaStage = (typeof SLA_STAGES)[number]

export interface AreaRef {
  id: string
  name: string
}

export interface UserRef {
  id: string
  full_name: string
}

export interface User {
  id: string
  full_name: string
  email: string
  role: UserRole
  area: AreaRef | null
  language: Language
  theme: ThemePreference
  is_active: boolean
  must_change_password: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  refresh_token: string
  refresh_expires_at: string
  user: User
}

export interface Area {
  id: string
  name: string
  description: string | null
  manager: UserRef | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SlaPolicy {
  priority: RequestPriority
  status: SlaStage
  max_hours: number
  inactivity_hours: number
  updated_at: string
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface PageParams {
  page: number
  size: number
  q?: string
}

export const REQUEST_STATUSES = [
  'received',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const BOARD_STATUSES = ['received', 'assigned', 'in_progress', 'completed'] as const

export type SlaStatus = 'on_track' | 'at_risk' | 'overdue'

export type EditableField = 'title' | 'description' | 'priority' | 'due_at'

export interface RequestSummary {
  id: string
  code: string
  title: string
  area: AreaRef
  requester: UserRef
  assignee: UserRef | null
  priority: RequestPriority
  status: RequestStatus
  received_at: string
  due_at: string | null
  last_activity_at: string
  completed_at: string | null
  version: number
  sla_status: SlaStatus | null
  is_stalled: boolean
}

export interface AllowedTransition {
  to: RequestStatus
  requires_comment: boolean
  requires_assignee: boolean
}

export interface RequestPermissions {
  editable_fields: EditableField[]
  can_assign: boolean
  can_comment: boolean
}

export interface RequestDetail extends RequestSummary {
  description: string
  created_at: string
  updated_at: string
  allowed_transitions: AllowedTransition[]
  permissions: RequestPermissions
}

export type RequestEventType = 'created' | 'status_changed' | 'assigned' | 'comment' | 'updated'

export interface RequestEvent {
  id: string
  type: RequestEventType
  from_status: RequestStatus | null
  to_status: RequestStatus | null
  actor: UserRef | null
  comment: string | null
  details: Record<string, unknown>
  created_at: string
}

export interface BoardCard extends RequestSummary {
  allowed_transitions: AllowedTransition[]
}

export interface BoardColumn {
  status: RequestStatus
  total: number
  items: BoardCard[]
}

export interface RequestBoard {
  columns: BoardColumn[]
}

export interface DueEstimate {
  priority: RequestPriority
  hours: number | null
}

export interface DashboardQuery {
  area_id?: string
  date_from?: string
  date_to?: string
}

export interface DateRange {
  date_from: string
  date_to: string
  timezone: string
}

export interface DashboardSummary {
  open: number
  due_soon: number
  overdue: number
  stalled: number
  completed_last_7_days: number
  completed_since: string
  avg_resolution_hours: number | null
  range: DateRange
}

export interface StatusBreakdown {
  items: { status: RequestStatus; count: number }[]
  range: DateRange
}

export interface DashboardRequestItem {
  id: string
  code: string
  title: string
  area: AreaRef
  assignee: UserRef | null
  priority: RequestPriority
  status: RequestStatus
  due_at: string | null
  last_activity_at: string
  sla_status: SlaStatus | null
  consumed_pct: number | null
  idle_hours: number
  inactivity_hours: number | null
}

export interface RequestHighlights {
  items: DashboardRequestItem[]
}

export type BottleneckReason = 'count_above_median' | 'avg_above_sla'

export interface BottleneckCell {
  area: AreaRef
  status: SlaStage
  count: number
  avg_hours: number | null
  median_count: number
  median_avg_hours: number | null
  sla_max_hours: number | null
  is_bottleneck: boolean
  reasons: BottleneckReason[]
}

export interface BottleneckMatrix {
  cells: BottleneckCell[]
}

export interface TrendPoint {
  day: string
  created: number
  completed: number
}

export interface TrendSeries {
  days: TrendPoint[]
  range: DateRange
}

export const ALERT_TYPES = ['due_soon', 'overdue', 'stalled', 'bottleneck'] as const
export type AlertType = (typeof ALERT_TYPES)[number]

export const ALERT_SEVERITIES = ['warning', 'critical'] as const
export type AlertSeverity = 'info' | (typeof ALERT_SEVERITIES)[number]

export type AlertState = 'open' | 'resolved'

export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  source: 'rule' | 'ai'
  message_code: string
  params: Record<string, unknown>
  area: AreaRef
  request: { id: string; code: string; title: string; status: RequestStatus } | null
  is_read: boolean
  created_at: string
  resolved_at: string | null
}

export interface AlertListParams {
  page: number
  size: number
  type: AlertType[]
  severity: AlertSeverity[]
  state?: AlertState
  is_read?: boolean
}
