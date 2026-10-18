import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { InlineAlert } from '@/components/ui/States'
import { TextArea } from '@/components/ui/TextArea'
import { FormField } from '@/components/ui/FormField'
import { inputClass, selectClass } from '@/components/ui/styles'
import { useTranslateError } from '@/lib/api/errors'
import type { RequestUpdateInput, useRequestActions } from '@/lib/api/requests'
import { REQUEST_PRIORITIES, type RequestDetail } from '@/lib/api/types'

const editSchema = z.object({
  title: z.string().trim().min(1, 'required').max(200, 'tooLong'),
  description: z.string().trim().min(1, 'required').max(5000, 'tooLong'),
  priority: z.enum(REQUEST_PRIORITIES),
  due_at: z.string(),
})

type EditValues = z.infer<typeof editSchema>

function toLocalInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

function valuesOf(detail: RequestDetail): EditValues {
  return {
    title: detail.title,
    description: detail.description,
    priority: detail.priority,
    due_at: toLocalInput(detail.due_at),
  }
}

interface EditRequestDialogProps {
  detail: RequestDetail
  update: ReturnType<typeof useRequestActions>['update']
  onClose: () => void
}

export function EditRequestDialog({ detail, update, onClose }: EditRequestDialogProps) {
  const { t } = useTranslation(['requests', 'common'])
  const translateError = useTranslateError()
  const ids = { title: useId(), description: useId(), priority: useId(), due: useId() }
  const editable = new Set(detail.permissions.editable_fields)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditValues>({ resolver: zodResolver(editSchema), defaultValues: valuesOf(detail) })

  useEffect(() => {
    reset(valuesOf(detail), { keepDirtyValues: true })
  }, [detail, reset])

  const formId = useId()
  const onSubmit = handleSubmit(async (values) => {
    const input: RequestUpdateInput = { version: detail.version }
    if (editable.has('title') && values.title !== detail.title) input.title = values.title
    if (editable.has('description') && values.description !== detail.description) {
      input.description = values.description
    }
    if (editable.has('priority') && values.priority !== detail.priority) {
      input.priority = values.priority
    }
    if (editable.has('due_at') && values.due_at !== toLocalInput(detail.due_at)) {
      input.due_at = fromLocalInput(values.due_at)
    }
    const updated = await update.mutateAsync(input)
    reset(valuesOf(updated))
    onClose()
  })

  return (
    <Dialog
      title={t('detail.edit.dialogTitle', { code: detail.code })}
      size="lg"
      onClose={() => {
        update.reset()
        onClose()
      }}
      footer={
        <>
          <Button
            onClick={() => {
              update.reset()
              onClose()
            }}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="solid" loading={update.isPending} disabled={!isDirty}>
            {update.isPending ? t('common:actions.saving') : t('detail.edit.save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => void onSubmit(event).catch(() => undefined)}
        className="flex flex-col gap-4"
      >
        <FormField label={t('detail.fields.title')} htmlFor={ids.title} error={errors.title?.message}>
          <input
            id={ids.title}
            disabled={!editable.has('title')}
            aria-invalid={Boolean(errors.title)}
            className={inputClass}
            {...register('title')}
          />
        </FormField>
        <FormField
          label={t('detail.fields.description')}
          htmlFor={ids.description}
          error={errors.description?.message}
        >
          <TextArea
            id={ids.description}
            rows={5}
            disabled={!editable.has('description')}
            aria-invalid={Boolean(errors.description)}
            {...register('description')}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('detail.fields.priority')} htmlFor={ids.priority}>
            <select
              id={ids.priority}
              disabled={!editable.has('priority')}
              className={selectClass}
              {...register('priority')}
            >
              {REQUEST_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {t(`priority.${priority}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('detail.fields.due_at')} htmlFor={ids.due}>
            <input
              id={ids.due}
              type="datetime-local"
              disabled={!editable.has('due_at')}
              className={inputClass}
              {...register('due_at')}
            />
          </FormField>
        </div>
        {update.error && <InlineAlert tone="error">{translateError(update.error)}</InlineAlert>}
      </form>
    </Dialog>
  )
}
