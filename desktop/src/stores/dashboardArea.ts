import { create } from 'zustand'

interface DashboardAreaState {
  userId: string | null
  areaId: string | undefined
  setArea: (userId: string, areaId: string | undefined) => void
  reset: () => void
}

export const useDashboardAreaStore = create<DashboardAreaState>()((set) => ({
  userId: null,
  areaId: undefined,
  setArea: (userId, areaId) => {
    set({ userId, areaId })
  },
  reset: () => {
    set({ userId: null, areaId: undefined })
  },
}))
