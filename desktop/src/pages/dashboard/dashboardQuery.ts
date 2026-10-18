import { useCallback } from 'react'
import { useDashboardAreaStore } from '@/stores/dashboardArea'
import { useSessionStore } from '@/stores/session'

export function useDashboardArea(): [string | undefined, (areaId: string | undefined) => void] {
  const user = useSessionStore((state) => state.user)
  const stored = useDashboardAreaStore((state) => (state.userId === user?.id ? state.areaId : undefined))
  const setArea = useDashboardAreaStore((state) => state.setArea)

  const update = useCallback(
    (areaId: string | undefined) => {
      if (user) setArea(user.id, areaId)
    },
    [user, setArea],
  )

  return [user?.role === 'admin' ? stored : undefined, update]
}
