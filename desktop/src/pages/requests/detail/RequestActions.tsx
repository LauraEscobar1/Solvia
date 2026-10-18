import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TransitionDialog, type TransitionValues } from '@/components/requests/TransitionDialog'
import { Button } from '@/components/ui/Button'
import { useTranslateError } from '@/lib/api/errors'
import type { useRequestActions } from '@/lib/api/requests'
import type { AllowedTransition, RequestDetail } from '@/lib/api/types'
import { needsDialog, transitionAction } from '@/lib/requests/transitions'

type Dialog = { kind: 'transition'; transition: AllowedTransition } | { kind: 'reassign' }

interface RequestActionsProps {
  detail: RequestDetail
  actions: ReturnType<typeof useRequestActions>
}

export function RequestActions({ detail, actions }: RequestActionsProps) {
  const { t } = useTranslation('requests')
  const translateError = useTranslateError()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const { transition, assign } = actions
  const canReassign = detail.permissions.can_assign && detail.status !== 'received'
  const transitionGone =
    dialog?.kind === 'transition' &&
    !detail.allowed_transitions.some((item) => item.to === dialog.transition.to)

  const runTransition = (target: AllowedTransition, values: TransitionValues = {}) => {
    transition.mutate(
      { to: target.to, version: detail.version, ...values },
      {
        onSuccess: () => {
          setDialog(null)
        },
      },
    )
  }

  const start = (target: AllowedTransition) => {
    transition.reset()
    assign.reset()
    if (needsDialog(target)) {
      setDialog({ kind: 'transition', transition: target })
    } else {
      runTransition(target)
    }
  }

  const error = transition.error ?? assign.error
  const pending = transition.isPending || assign.isPending

  if (detail.allowed_transitions.length === 0 && !canReassign) return null

  return (
    <section aria-label={t('detail.actions')} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {detail.allowed_transitions.map((target) => (
          <Button
            key={target.to}
            variant={target.to === 'cancelled' ? 'danger' : 'solid'}
            disabled={pending}
            onClick={() => {
              start(target)
            }}
          >
            {t(`actions.${transitionAction(detail.status, target.to)}`)}
          </Button>
        ))}
        {canReassign && (
          <Button
            disabled={pending}
            onClick={() => {
              transition.reset()
              assign.reset()
              setDialog({ kind: 'reassign' })
            }}
          >
            {t('detail.reassign')}
          </Button>
        )}
      </div>
      {transitionGone && (
        <p role="status" className="text-warning text-sm">
          {t('detail.transitionGone')}
        </p>
      )}
      {error && !dialog && (
        <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2 text-sm">
          {translateError(error)}
        </p>
      )}

      {dialog?.kind === 'transition' && !transitionGone && (
        <TransitionDialog
          code={detail.code}
          area={detail.area}
          from={detail.status}
          transition={dialog.transition}
          pending={transition.isPending}
          error={transition.error ? translateError(transition.error) : null}
          onCancel={() => {
            setDialog(null)
          }}
          onConfirm={(values) => {
            runTransition(dialog.transition, values)
          }}
        />
      )}
      {dialog?.kind === 'reassign' && (
        <TransitionDialog
          title={t('detail.reassignTitle', { code: detail.code })}
          code={detail.code}
          area={detail.area}
          from={detail.status}
          transition={{ to: detail.status, requires_assignee: true, requires_comment: false }}
          pending={assign.isPending}
          error={assign.error ? translateError(assign.error) : null}
          onCancel={() => {
            setDialog(null)
          }}
          onConfirm={(values) => {
            if (!values.assignee_id) return
            assign.mutate(
              { assignee_id: values.assignee_id, version: detail.version, comment: values.comment },
              {
                onSuccess: () => {
                  setDialog(null)
                },
              },
            )
          }}
        />
      )}
    </section>
  )
}
