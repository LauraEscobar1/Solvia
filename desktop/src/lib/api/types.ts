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
  risk_score: number | null
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

export const ALERT_TYPES = ['due_soon', 'overdue', 'stalled', 'bottleneck', 'ai_risk'] as const
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

export type UILanguage = 'es' | 'en'

export interface AIMessage {
  text: string | null
  code: string | null
  params: Record<string, unknown>
}

export const RISK_FACTORS = [
  'stage_delay',
  'sla_consumed',
  'inactivity',
  'priority',
  'assignee_load',
] as const
export type RiskFactor = (typeof RISK_FACTORS)[number]

export type ReferenceKind = 'p90_area_stage_priority' | 'p90_stage_priority' | 'sla_max'

export interface RiskFactorRead {
  factor: RiskFactor
  value: number | string | null
  reference: number | null
  reference_kind: ReferenceKind | null
  normalized: number
  weight: number
  points: number
}

export interface RiskRead {
  score: number
  factors: RiskFactorRead[]
}

export type InsightSource = 'rule' | 'ai'
export type InsightTrigger = 'manual' | 'automatic' | 'scheduled'

export interface InsightMeta {
  id: string
  source: InsightSource
  trigger: InsightTrigger
  language: UILanguage
  provider: string
  model: string | null
  tokens_used: number
  fallback_reason: string | null
  cached: boolean
  created_at: string
  feedback: Record<string, boolean>
}

export interface RequestInsightContent {
  risk_score: number
  summary: AIMessage
  causes: AIMessage[]
  actions: { title: AIMessage; detail: AIMessage }[]
}

export interface RequestInsight extends InsightMeta {
  content: RequestInsightContent
}

export interface RequestAnalysis {
  request_id: string
  risk: RiskRead | null
  insight: RequestInsight | null
  notice: string | null
}

export type FindingType = 'bottleneck' | 'delay' | 'workload' | 'trend' | 'sla'
export type RecommendationPriority = 'high' | 'medium' | 'low'

export interface RecommendationTarget {
  request_id: string | null
  request_code: string | null
  area_id: string | null
  status: RequestStatus | null
}

export interface OverviewInsightContent {
  summary: AIMessage
  findings: {
    type: FindingType
    area_id: string | null
    status: RequestStatus | null
    evidence: AIMessage
  }[]
  recommendations: {
    title: AIMessage
    detail: AIMessage
    priority: RecommendationPriority
    target: RecommendationTarget | null
  }[]
}

export interface OverviewInsight extends InsightMeta {
  area_id: string | null
  content: OverviewInsightContent
}

export interface OverviewAnalysis {
  area_id: string | null
  insight: OverviewInsight | null
  notice: string | null
}

export interface AIStatus {
  provider: 'none' | 'deepseek'
  request_model: string | null
  overview_model: string | null
  key_configured: boolean
  automatic_enabled: boolean
  send_request_text: boolean
  tokens_used_today: number
  daily_token_budget: number
  budget_exceeded: boolean
  user_hourly_limit: number
  last_daily_run: {
    created_at: string
    source: InsightSource
    fallback_reason: string | null
    tokens_used: number
    model: string | null
  } | null
}
