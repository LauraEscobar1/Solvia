import type { LucideIcon } from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router'
import { moveFocus } from '@/lib/focus'
import { IconButton, type IconButtonVariant } from './IconButton'

export type MenuEntry =
  | { kind: 'item'; id: string; label: string; icon?: LucideIcon; to?: string; onSelect?: () => void; tone?: 'danger' }
  | { kind: 'group'; id: string; label: string; items: MenuItemEntry[] }
  | { kind: 'separator'; id: string }

type MenuItemEntry = Extract<MenuEntry, { kind: 'item' }>

interface MenuProps {
  label: string
  icon: LucideIcon
  entries: MenuEntry[]
  header?: ReactNode
  triggerVariant?: IconButtonVariant
}

const ITEM_CLASSES =
  'text-body flex w-full items-center gap-3 rounded-full px-3 py-2 text-left font-semibold outline-none hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus'

export function Menu({ label, icon, entries, header, triggerVariant = 'glass' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrapper = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    items()[0]?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, close])

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      close(false)
    } else if (moveFocus(items(), document.activeElement, event.key)) {
      event.preventDefault()
    }
  }

  const select = (entry: MenuItemEntry) => {
    close(false)
    entry.onSelect?.()
  }

  const renderItem = (entry: MenuItemEntry) => {
    const Icon = entry.icon
    const content = (
      <>
        {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
        {entry.label}
      </>
    )
    const className = `${ITEM_CLASSES} ${entry.tone === 'danger' ? 'text-danger-text' : ''}`
    return entry.to ? (
      <Link
        key={entry.id}
        to={entry.to}
        role="menuitem"
        tabIndex={-1}
        className={className}
        onClick={() => {
          select(entry)
        }}
      >
        {content}
      </Link>
    ) : (
      <button
        key={entry.id}
        type="button"
        role="menuitem"
        tabIndex={-1}
        className={className}
        onClick={() => {
          select(entry)
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <div ref={wrapper} className="relative">
      <IconButton
        ref={trigger}
        label={label}
        icon={icon}
        variant={triggerVariant}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        tooltipHidden={open}
        tooltipAlign="end"
        onClick={() => {
          setOpen((value) => !value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
      />
      {open && (
        <div className="bg-surface-solid border-card-edge shadow-pop rounded-inner absolute top-full right-0 z-50 mt-2 w-72 border p-2">
          {header && <div className="border-divider mb-2 border-b px-3 pt-2 pb-3">{header}</div>}
          <div ref={menu} id={menuId} role="menu" aria-label={label} onKeyDown={onMenuKeyDown} className="flex flex-col gap-0.5">
            {entries.map((entry) => {
              if (entry.kind === 'separator') {
                return <div key={entry.id} role="separator" className="border-divider my-1 border-t" />
              }
              if (entry.kind === 'group') {
                const headingId = `${menuId}-${entry.id}`
                return (
                  <div key={entry.id} role="group" aria-labelledby={headingId} className="flex flex-col gap-0.5">
                    <span
                      id={headingId}
                      className="text-caption text-subtle-foreground px-3 pt-2 pb-1 font-semibold"
                    >
                      {entry.label}
                    </span>
                    <div className="flex flex-col gap-0.5 pl-3">{entry.items.map(renderItem)}</div>
                  </div>
                )
              }
              return renderItem(entry)
            })}
          </div>
        </div>
      )}
    </div>
  )
}
