import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { focusableWithin } from '@/lib/focus'

export interface PopoverTriggerProps {
  ref: RefObject<HTMLButtonElement | null>
  'aria-expanded': boolean
  'aria-controls': string
  'aria-haspopup': 'dialog'
  onClick: () => void
}

interface PopoverProps {
  label: string
  align?: 'start' | 'end'
  trigger: (props: PopoverTriggerProps) => ReactNode
  children: ReactNode
  className?: string
}

export function Popover({ label, align = 'start', trigger, children, className = '' }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapper = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const container = panel.current
    if (container) (focusableWithin(container)[0] ?? container).focus()
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, close])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      close()
    }
  }

  return (
    <div
      ref={wrapper}
      className="relative inline-flex"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (open && !wrapper.current?.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      {trigger({
        ref: triggerRef,
        'aria-expanded': open,
        'aria-controls': panelId,
        'aria-haspopup': 'dialog',
        onClick: () => {
          setOpen((value) => !value)
        },
      })}
      {open && (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className={[
            'bg-surface-solid border-card-edge shadow-pop rounded-inner absolute top-full z-40 mt-2 min-w-56 border p-3',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          ].join(' ')}
        >
          {children}
        </div>
      )}
    </div>
  )
}
