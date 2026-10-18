import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { Dialog } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import { inputClass } from '@/components/ui/styles'
import { useAssignableUsers } from '@/lib/api/requests'
import type { AllowedTransition, AreaRef, RequestStatus } from '@/lib/api/types'
import { transitionAction } from '@/lib/requests/transitions'
import { useSessionStore } from '@/stores/session'

export interface TransitionValues {
  comment?: string
  assignee_id?: string
}

interface TransitionDialogProps {
  title?: string
  code: string
  area: AreaRef
  from: RequestStatus
  transition: AllowedTransition
  pending?: boolean
  error?: string | null
  onConfirm: (values: TransitionValues) => void
  onCancel: () => void
}

export function TransitionDialog({
  title,
  code,
  area,
  from,
  transition,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: TransitionDialogProps) {
  const { t } = useTranslation(['requests', 'common'])
  const isAdmin = useSessionStore((state) => state.user?.role === 'admin')
  const assignees = useAssignableUsers(isAdmin ? undefined : area.id, transition.requires_assignee)
  const ids = { assignee: useId(), comment: useId() }
  const schema = z.object({
    assignee_id: transition.requires_assignee ? z.string().min(1, 'required') : z.string(),
    comment: transition.requires_comment
      ? z.string().trim().min(1, 'required').max(5000, 'tooLong')
      : z.string().trim().max(5000, 'tooLong'),
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ assignee_id: string; comment: string }>({
    resolver: zodResolver(schema),
    defaultValues: { assignee_id: '', comment: '' },
  })
  const action = t(`actions.${transitionAction(from, transition.to)}`)

  const onSubmit = handleSubmit((values) => {
    onConfirm({
      comment: values.comment || undefined,
      assignee_id: values.assignee_id || undefined,
    })
  })

  return (
    <Dialog title={title ?? t('transitionDialog.title', { action, code })} onClose={onCancel}>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        {transition.requires_assignee && (
          <FormField
            label={t('transitionDialog.assignee')}
            htmlFor={ids.assignee}
            error={errors.assignee_id?.message}
          >
            <Select
              id={ids.assignee}
              aria-invalid={Boolean(errors.assignee_id)}
              {...register('assignee_id')}
            >
              <option value="">{t('transitionDialog.selectAssignee')}</option>
              {assignees.data?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.area?.id === area.id
                    ? user.full_name
                    : t('transitionDialog.otherArea', { name: user.full_name })}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField
          label={
            transition.requires_comment
              ? t('transitionDialog.commentRequired')
              : t('transitionDialog.commentOptional')
          }
          htmlFor={ids.comment}
          error={errors.comment?.message}
        >
          <textarea
            id={ids.comment}
            rows={3}
            aria-invalid={Boolean(errors.comment)}
            className={inputClass}
            {...register('comment')}
          />
        </FormField>
        {error && (
          <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2 text-sm">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>{t('common:actions.cancel')}</Button>
          <Button type="submit" variant="solid" disabled={pending}>
            {pending ? t('common:actions.saving') : t('transitionDialog.confirm')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
