import type { Language } from '@/locales'
import type { ThemePreference } from '@/stores/theme'
import { apiRequest } from './client'
import type { User } from './types'

export interface ProfileUpdate {
  language?: Language
  theme?: ThemePreference
  current_password?: string
  new_password?: string
}

export function updateProfile(data: ProfileUpdate): Promise<User> {
  return apiRequest<User>('/api/v1/auth/me', { method: 'PATCH', body: data })
}
