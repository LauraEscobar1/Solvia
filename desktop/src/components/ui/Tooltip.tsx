import { type ReactNode, useEffect, useState } from 'react'

interface TooltipProps {
  label: string
  side?: 'top' | 'bottom'
  hidden?: boolean
  children: ReactNode
}

export function Tooltip({ label, side = 'bottom', hidden = false, children }: TooltipProps) {
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
          'bg-solid text-solid-foreground shadow-pop text-caption pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-full px-2.5 py-1 font-medium whitespace-nowrap transition-opacity duration-150',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          open ? 'visible opacity-100' : 'invisible opacity-0',
        ].join(' ')}
      >
        {label}
      </span>
    </span>
  )
}
