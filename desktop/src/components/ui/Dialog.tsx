import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { focusableWithin, trapTab } from '@/lib/focus'
import { useReducedMotion } from '@/lib/useReducedMotion'
import { IconButton } from './IconButton'

const openDialogs: HTMLElement[] = []

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const

interface DialogProps {
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof SIZES
  variant?: 'center' | 'sheet'
  tone?: 'default' | 'feature'
  header?: (titleId: string, close: () => void) => ReactNode
}

export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  variant = 'center',
  tone = 'default',
  header,
}: DialogProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const titleId = useId()
  const descriptionId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const element = panel.current
    if (!element) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.getElementById('root')
    openDialogs.push(element)
    if (openDialogs.length === 1) root?.setAttribute('inert', '')

    const preferred =
      element.querySelector<HTMLElement>('[data-autofocus]') ??
      focusableWithin(element).find((item) => item.dataset.dialogClose === undefined) ??
      element
    preferred.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (openDialogs.at(-1) !== element) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      trapTab(event, element)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openDialogs.splice(openDialogs.indexOf(element), 1)
      if (openDialogs.length === 0) root?.removeAttribute('inert')
      previous?.focus()
    }
  }, [])

  const sheet = variant === 'sheet'

  return createPortal(
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={[
        'bg-overlay fixed inset-0 z-50 flex backdrop-blur-sm',
        sheet ? 'justify-end' : 'items-center justify-center p-4',
      ].join(' ')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
    >
      <motion.div
        ref={panel}
        initial={reduced || !sheet ? false : { x: '100%' }}
        animate={{ x: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={[
          tone === 'feature'
            ? 'bg-feature text-feature-foreground on-dark border-card-edge shadow-pop flex w-full flex-col border outline-none'
            : 'bg-surface-solid border-card-edge shadow-pop flex w-full flex-col border outline-none',
          sheet ? 'rounded-l-card h-full max-w-xl' : `rounded-card max-h-full ${SIZES[size]}`,
        ].join(' ')}
      >
        {header?.(titleId, onClose)}
        {!header && (
        <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="text-heading">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="text-body text-muted-foreground">
                {description}
              </div>
            )}
          </div>
          <IconButton
            label={t('actions.close')}
            icon={X}
            size="sm"
            tooltip={false}
            data-dialog-close=""
            onClick={() => {
              onCloseRef.current()
            }}
          />
        </header>
        )}
        <div
          className={
            tone === 'feature'
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-6'
              : 'flex-1 overflow-y-auto px-6 pb-6'
          }
        >
          {children}
        </div>
        {footer && (
          <footer className="border-divider flex flex-wrap justify-end gap-2 border-t px-6 py-4">{footer}</footer>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  )
}
