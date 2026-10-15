import { setLanguage } from '@/i18n'
import { type ProfileUpdate, updateProfile } from '@/lib/api/auth'
import type { Language } from '@/locales'
import { useSessionStore } from '@/stores/session'
import { type ThemePreference, useThemeStore } from '@/stores/theme'
import { signIn } from './session'

async function syncProfile(data: ProfileUpdate): Promise<void> {
  if (useSessionStore.getState().status !== 'authenticated') return
  try {
    useSessionStore.getState().setUser(await updateProfile(data))
  } catch {
    return
  }
}

export async function saveThemePreference(theme: ThemePreference): Promise<void> {
  useThemeStore.getState().setPreference(theme)
  await syncProfile({ theme })
}

export async function saveLanguagePreference(language: Language): Promise<void> {
  await setLanguage(language)
  await syncProfile({ language })
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = await updateProfile({ current_password: currentPassword, new_password: newPassword })
  const { remember } = useSessionStore.getState()
  await signIn({ email: user.email, password: newPassword, remember })
}
