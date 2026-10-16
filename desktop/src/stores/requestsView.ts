import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const REQUEST_VIEWS = ['table', 'board'] as const
export type RequestView = (typeof REQUEST_VIEWS)[number]

export const REQUESTS_VIEW_STORAGE_KEY = 'solvia.requests.view'

interface RequestsViewState {
  view: RequestView
  setView: (view: RequestView) => void
}

export const useRequestsViewStore = create<RequestsViewState>()(
  persist(
    (set) => ({
      view: 'table',
      setView: (view) => {
        set({ view })
      },
    }),
    {
      name: REQUESTS_VIEW_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ view }) => ({ view }),
    },
  ),
)
