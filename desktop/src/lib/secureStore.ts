import { invoke, isTauri } from '@tauri-apps/api/core'

const COMMAND_PREFIX = 'plugin:secure-store|'

export async function saveRefreshToken(token: string): Promise<void> {
  if (!isTauri()) return
  await invoke(`${COMMAND_PREFIX}save_refresh_token`, { token })
}

export async function loadRefreshToken(): Promise<string | null> {
  if (!isTauri()) return null
  return invoke<string | null>(`${COMMAND_PREFIX}load_refresh_token`)
}

export async function clearRefreshToken(): Promise<void> {
  if (!isTauri()) return
  await invoke(`${COMMAND_PREFIX}clear_refresh_token`)
}
