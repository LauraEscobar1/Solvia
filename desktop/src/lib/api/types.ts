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
