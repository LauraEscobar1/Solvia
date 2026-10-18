import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { inputClass } from '@/components/ui/styles'
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
        <input
          id={ids.current}
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.current)}
          className={inputClass}
          {...register('current')}
        />
      </FormField>
      <FormField
        label={t('changePassword.new')}
        htmlFor={ids.next}
        error={errors.next?.message}
        hint={t('changePassword.hint')}
      >
        <input
          id={ids.next}
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.next)}
          className={inputClass}
          {...register('next')}
        />
      </FormField>
      <FormField
        label={t('changePassword.confirm')}
        htmlFor={ids.confirm}
        error={errors.confirm?.message}
      >
        <input
          id={ids.confirm}
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirm)}
          className={inputClass}
          {...register('confirm')}
        />
      </FormField>
      {submitError !== null && (
        <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2 text-sm">
          {translateError(submitError)}
        </p>
      )}
      {saved && (
        <p role="status" className="text-success text-sm">
          {t('changePassword.success')}
        </p>
      )}
      <div>
        <Button type="submit" variant="solid" disabled={isSubmitting}>
          {isSubmitting ? t('changePassword.submitting') : t('changePassword.submit')}
        </Button>
      </div>
    </form>
  )
}
