import { type ReactNode, useEffect, useState } from 'react'

interface TooltipProps {
  label: string
  side?: 'top' | 'bottom'
  align?: 'center' | 'end'
  hidden?: boolean
  children: ReactNode
}

export function Tooltip({ label, side = 'bottom', align = 'center', hidden = false, children }: TooltipProps) {
  const [hovered, setOpen] = useState(false)
  const open = hovered && !hidden

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => {
        setOpen(true)
      }}
      onPointerLeave={() => {
        setOpen(false)
      }}
      onFocus={() => {
        setOpen(true)
      }}
      onBlur={() => {
        setOpen(false)
      }}
    >
      {children}
      <span
        aria-hidden="true"
        data-open={open}
        className={[
          'bg-solid text-solid-foreground shadow-pop text-caption pointer-events-none absolute z-50 rounded-full px-2.5 py-1 font-medium whitespace-nowrap',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
          open ? 'block' : 'hidden',
        ].join(' ')}
      >
        {label}
      </span>
    </span>
  )
}
