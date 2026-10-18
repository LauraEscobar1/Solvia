import { ArrowRight, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TransitionDialog, type TransitionValues } from '@/components/requests/TransitionDialog'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineAlert } from '@/components/ui/States'
import { useTranslateError } from '@/lib/api/errors'
import type { useRequestActions } from '@/lib/api/requests'
import type { AllowedTransition, RequestDetail, RequestStatus } from '@/lib/api/types'
import { STAGE_ORDER } from '@/lib/requests/tones'
import { needsDialog, transitionAction } from '@/lib/requests/transitions'
import { EditRequestDialog } from './EditRequestDialog'

type Dialog =
  | { kind: 'transition'; transition: AllowedTransition }
  | { kind: 'cancel'; transition: AllowedTransition }
  | { kind: 'reassign' }
  | { kind: 'edit' }

interface RequestActionsProps {
  detail: RequestDetail
  actions: ReturnType<typeof useRequestActions>
}

function isForward(from: RequestStatus, to: RequestStatus): boolean {
  const target = STAGE_ORDER.indexOf(to)
  return target > STAGE_ORDER.indexOf(from) && target >= 0
}

export function RequestActions({ detail, actions }: RequestActionsProps) {
  const { t } = useTranslation('requests')
  const translateError = useTranslateError()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const { transition, assign, update } = actions
  const canReassign = detail.permissions.can_assign && detail.status !== 'received'
  const canEdit = detail.permissions.editable_fields.length > 0

  const options = detail.allowed_transitions.filter((item) => item.to !== 'cancelled')
  const cancel = detail.allowed_transitions.find((item) => item.to === 'cancelled')
  const primary =
    [...options]
      .filter((item) => isForward(detail.status, item.to))
      .sort((a, b) => STAGE_ORDER.indexOf(a.to) - STAGE_ORDER.indexOf(b.to))[0] ?? options[0]
  const secondary = options.filter((item) => item !== primary)
  const open = dialog?.kind === 'transition' || dialog?.kind === 'cancel' ? dialog.transition : null
  const transitionGone = open !== null && !detail.allowed_transitions.some((item) => item.to === open.to)

  const close = () => {
    setDialog(null)
  }

  const runTransition = (target: AllowedTransition, values: TransitionValues = {}) => {
    transition.mutate({ to: target.to, version: detail.version, ...values }, { onSuccess: close })
  }

  const start = (target: AllowedTransition) => {
    transition.reset()
    assign.reset()
    if (needsDialog(target)) setDialog({ kind: 'transition', transition: target })
    else runTransition(target)
  }

  const label = (target: AllowedTransition) =>
    isForward(detail.status, target.to)
      ? t('detail.moveTo', { stage: t(`status.${target.to}`) })
      : t(`actions.${transitionAction(detail.status, target.to)}`)

  const error = transition.error ?? assign.error
  const pending = transition.isPending || assign.isPending
  if (detail.allowed_transitions.length === 0 && !canReassign && !canEdit) return null

  return (
    <div className="flex flex-col items-end gap-2">
      <div aria-label={t('detail.actions')} role="group" className="flex flex-wrap justify-end gap-2">
        {cancel && (
          <Button
            variant="danger-text"
            disabled={pending}
            onClick={() => {
              transition.reset()
              setDialog({ kind: 'cancel', transition: cancel })
            }}
          >
            {t('actions.cancel')}
          </Button>
        )}
        {canEdit && (
          <Button
            onClick={() => {
              setDialog({ kind: 'edit' })
            }}
          >
            <Pencil className="size-4" aria-hidden="true" />
            {t('detail.edit.open')}
          </Button>
        )}
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
        {secondary.map((target) => (
          <Button
            key={target.to}
            disabled={pending}
            onClick={() => {
              start(target)
            }}
          >
            {label(target)}
          </Button>
        ))}
        {primary && (
          <Button
            variant="solid"
            loading={pending && !dialog}
            disabled={pending}
            onClick={() => {
              start(primary)
            }}
          >
            {label(primary)}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      {transitionGone && <InlineAlert tone="warning">{t('detail.transitionGone')}</InlineAlert>}
      {error && !dialog && <InlineAlert tone="error">{translateError(error)}</InlineAlert>}

      {dialog?.kind === 'transition' && !transitionGone && (
        <TransitionDialog
          code={detail.code}
          area={detail.area}
          from={detail.status}
          transition={dialog.transition}
          pending={transition.isPending}
          error={transition.error ? translateError(transition.error) : null}
          onCancel={close}
          onConfirm={(values) => {
            runTransition(dialog.transition, values)
          }}
        />
      )}
      {dialog?.kind === 'cancel' && !transitionGone && needsDialog(dialog.transition) && (
        <TransitionDialog
          title={t('detail.cancelTitle', { code: detail.code })}
          code={detail.code}
          area={detail.area}
          from={detail.status}
          transition={dialog.transition}
          pending={transition.isPending}
          error={transition.error ? translateError(transition.error) : null}
          onCancel={close}
          onConfirm={(values) => {
            runTransition(dialog.transition, values)
          }}
        />
      )}
      {dialog?.kind === 'cancel' && !transitionGone && !needsDialog(dialog.transition) && (
        <ConfirmDialog
          title={t('detail.cancelTitle', { code: detail.code })}
          message={t('detail.cancelMessage', { code: detail.code })}
          confirmLabel={t('actions.cancel')}
          cancelLabel={t('detail.keep')}
          pending={transition.isPending}
          error={transition.error ? translateError(transition.error) : null}
          onCancel={close}
          onConfirm={() => {
            runTransition(dialog.transition)
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
          onCancel={close}
          onConfirm={(values) => {
            if (!values.assignee_id) return
            assign.mutate(
              { assignee_id: values.assignee_id, version: detail.version, comment: values.comment },
              { onSuccess: close },
            )
          }}
        />
      )}
      {dialog?.kind === 'edit' && <EditRequestDialog detail={detail} update={update} onClose={close} />}
    </div>
  )
}
