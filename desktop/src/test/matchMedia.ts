type Listener = (event: MediaQueryListEvent) => void

const listeners = new Set<Listener>()
let prefersDark = false

export function installMatchMediaMock(): void {
  listeners.clear()
  prefersDark = false
  window.matchMedia = (query: string) =>
    ({
      media: query,
      get matches() {
        return query.includes('reduce') || (query.includes('dark') && prefersDark)
      },
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList
}

export function setSystemPrefersDark(value: boolean): void {
  prefersDark = value
  for (const listener of listeners) listener({ matches: value } as MediaQueryListEvent)
}
