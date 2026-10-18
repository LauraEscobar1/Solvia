const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.closest('[inert]') && element.getAttribute('aria-hidden') !== 'true',
  )
}

export function trapTab(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') return
  const items = focusableWithin(container)
  const first = items[0]
  const last = items.at(-1)
  if (!first || !last) {
    event.preventDefault()
    container.focus()
    return
  }
  const active = document.activeElement
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

export function moveFocus(items: HTMLElement[], current: Element | null, key: string): boolean {
  if (items.length === 0) return false
  const index = current ? items.indexOf(current as HTMLElement) : -1
  const next =
    key === 'Home'
      ? 0
      : key === 'End'
        ? items.length - 1
        : key === 'ArrowDown' || key === 'ArrowRight'
          ? (index + 1) % items.length
          : key === 'ArrowUp' || key === 'ArrowLeft'
            ? (index - 1 + items.length) % items.length
            : null
  if (next === null) return false
  items[next]?.focus()
  return true
}
