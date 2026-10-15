import { create } from 'zustand'
import type { TokenResponse, User } from '@/lib/api/types'

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous'

interface SessionState {
  status: SessionStatus
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  remember: boolean
  setSession: (tokens: TokenResponse, remember: boolean) => void
  setUser: (user: User) => void
  clear: () => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  refreshToken: null,
  remember: false,
  setSession: (tokens, remember) => {
    set({
      status: 'authenticated',
      user: tokens.user,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      remember,
    })
  },
  setUser: (user) => {
    set({ user })
  },
  clear: () => {
    set({
      status: 'anonymous',
      user: null,
      accessToken: null,
      refreshToken: null,
      remember: false,
    })
  },
}))
