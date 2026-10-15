import { useTranslation } from 'react-i18next'
import { Button, type ButtonVariant } from './Button'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  variant?: ButtonVariant
  pending?: boolean
  error?: string | null
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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-muted-foreground text-sm">{message}</p>
      {error && (
        <p role="alert" className="bg-danger-soft text-danger mt-4 rounded-lg px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel}>{t('actions.cancel')}</Button>
        <Button variant={variant} disabled={pending} onClick={onConfirm}>
          {pending ? t('actions.saving') : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
