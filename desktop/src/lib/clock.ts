import { useSyncExternalStore } from 'react'

const TICK_MS = 60_000

let current = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function tick(): void {
  current = Date.now()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  timer ??= setInterval(tick, TICK_MS)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

function snapshot(): number {
  if (Math.abs(Date.now() - current) >= TICK_MS) current = Date.now()
  return current
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot)
}
