import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, type ButtonVariant } from './Button'
import { Dialog } from './Dialog'
import { InlineAlert } from './States'

interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel: string
  variant?: ButtonVariant
  pending?: boolean
  error?: string | null
  children?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  variant = 'danger',
  pending = false,
  error = null,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      title={title}
      description={message}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>{t('actions.cancel')}</Button>
          <Button variant={variant} loading={pending} onClick={onConfirm}>
            {pending ? t('actions.saving') : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {children}
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
      </div>
    </Dialog>
  )
}
