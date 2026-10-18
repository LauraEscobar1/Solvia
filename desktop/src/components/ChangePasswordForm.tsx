import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { InlineAlert } from '@/components/ui/States'
import { TextField } from '@/components/ui/TextField'
import { useTranslateError } from '@/lib/api/errors'
import { changePassword } from '@/lib/auth/preferences'

const passwordSchema = z
  .object({
    current: z.string().min(1, 'required'),
    next: z.string().min(12, 'passwordMin').max(128, 'tooLong'),
    confirm: z.string().min(1, 'required'),
  })
  .refine((values) => values.next === values.confirm, {
    error: 'passwordMismatch',
    path: ['confirm'],
  })

type PasswordValues = z.infer<typeof passwordSchema>

export function ChangePasswordForm({ onSuccess }: { onSuccess?: () => void }) {
  const { t } = useTranslation('auth')
  const translateError = useTranslateError()
  const ids = { current: useId(), next: useId(), confirm: useId() }
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: '', next: '', confirm: '' },
  })

  const onSubmit = handleSubmit(async ({ current, next }) => {
    setSubmitError(null)
    setSaved(false)
    try {
      await changePassword(current, next)
      reset()
      setSaved(true)
      onSuccess?.()
    } catch (error) {
      setSubmitError(error)
    }
  })

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <FormField
        label={t('changePassword.current')}
        htmlFor={ids.current}
        error={errors.current?.message}
      >
        <TextField
          id={ids.current}
          type="password"
          revealable
          autoComplete="current-password"
          aria-invalid={Boolean(errors.current)}
          {...register('current')}
        />
      </FormField>
      <FormField
        label={t('changePassword.new')}
        htmlFor={ids.next}
        error={errors.next?.message}
        hint={t('changePassword.hint')}
      >
        <TextField
          id={ids.next}
          type="password"
          revealable
          autoComplete="new-password"
          aria-invalid={Boolean(errors.next)}
          {...register('next')}
        />
      </FormField>
      <FormField
        label={t('changePassword.confirm')}
        htmlFor={ids.confirm}
        error={errors.confirm?.message}
      >
        <TextField
          id={ids.confirm}
          type="password"
          revealable
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirm)}
          {...register('confirm')}
        />
      </FormField>
      {submitError !== null && <InlineAlert tone="error">{translateError(submitError)}</InlineAlert>}
      {saved && <InlineAlert tone="success">{t('changePassword.success')}</InlineAlert>}
      <div>
        <Button type="submit" variant="solid" loading={isSubmitting}>
          {isSubmitting ? t('changePassword.submitting') : t('changePassword.submit')}
        </Button>
      </div>
    </form>
  )
}
