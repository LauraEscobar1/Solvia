import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import type { ButtonSize, ButtonVariant } from '@/components/ui/buttonStyles'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useTranslateError } from '@/lib/api/errors'
import { useRequestActions } from '@/lib/api/requests'
import type { AssignmentSuggestion } from '@/lib/api/types'

interface ReassignButtonProps {
  requestId: string
  code: string
  version: number
  suggestion: AssignmentSuggestion
  variant?: ButtonVariant
  size?: ButtonSize
  label?: string
}

export function ReassignButton({ requestId, code, version, suggestion, variant = 'accent', size = 'md', label }: ReassignButtonProps) {
  const { t } = useTranslation('dashboard')
  const translateError = useTranslateError()
  const { assign } = useRequestActions(requestId)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          assign.reset()
          setConfirming(true)
        }}
      >
        {label ?? t('risk.reassignNow')}
      </Button>
      {confirming && (
        <ConfirmDialog
          title={t('risk.confirmTitle', { code })}
          message={t('risk.confirmMessage', {
            code,
            name: suggestion.assignee.full_name,
            count: suggestion.open_count,
          })}
          confirmLabel={t('risk.confirm')}
          variant="solid"
          pending={assign.isPending}
          error={assign.error ? translateError(assign.error) : null}
          onCancel={() => {
            setConfirming(false)
          }}
          onConfirm={() => {
            assign.mutate(
              { assignee_id: suggestion.assignee.id, version },
              {
                onSuccess: () => {
                  setConfirming(false)
                },
              },
            )
          }}
        />
      )}
    </>
  )
}
