import { useState } from 'react'
import { useReducedMotion } from './useReducedMotion'

export function useCompleteSpin(active: boolean): { spinning: boolean; onCycle: () => void } {
  const reduced = useReducedMotion()
  const [running, setRunning] = useState(false)
  if (active && !running) setRunning(true)
  return {
    spinning: reduced ? active : running,
    onCycle: () => {
      if (!active) setRunning(false)
    },
  }
}
