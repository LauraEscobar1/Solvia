import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
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

interface RequestEditFormProps {
  detail: RequestDetail
  update: ReturnType<typeof useRequestActions>['update']
}

export function RequestEditForm({ detail, update }: RequestEditFormProps) {
  const { t } = useTranslation(['requests', 'common'])
  const translateError = useTranslateError()
  const ids = { title: useId(), description: useId(), priority: useId(), due: useId() }
  const editable = new Set(detail.permissions.editable_fields)
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditValues>({ resolver: zodResolver(editSchema), defaultValues: valuesOf(detail) })

  useEffect(() => {
    reset(valuesOf(detail), { keepDirtyValues: true })
  }, [detail, reset])

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false)
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
    setSaved(true)
  })

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event).catch(() => undefined)}
      className="bg-surface flex flex-col gap-4 rounded-xl border p-5 shadow-xs"
    >
      <h2 className="font-semibold">{t('detail.edit.title')}</h2>
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
        <textarea
          id={ids.description}
          rows={5}
          disabled={!editable.has('description')}
          aria-invalid={Boolean(errors.description)}
          className={inputClass}
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
      {update.error && (
        <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2 text-sm">
          {translateError(update.error)}
        </p>
      )}
      {saved && !isDirty && (
        <p role="status" className="text-success text-sm">
          {t('detail.edit.saved')}
        </p>
      )}
      {editable.size === 0 ? (
        <p className="text-muted-foreground text-xs">{t('detail.edit.readOnly')}</p>
      ) : (
        <div className="flex gap-2">
          <Button type="submit" variant="solid" disabled={!isDirty || update.isPending}>
            {update.isPending ? t('common:actions.saving') : t('detail.edit.save')}
          </Button>
          {isDirty && (
            <Button
              onClick={() => {
                update.reset()
                reset(valuesOf(detail))
              }}
            >
              {t('detail.edit.discard')}
            </Button>
          )}
        </div>
      )}
    </form>
  )
}
