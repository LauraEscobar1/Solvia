import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router'
import { z } from 'zod'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeSelector } from '@/components/ThemeSelector'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { inputClass } from '@/components/ui/styles'
import { useTranslateError } from '@/lib/api/errors'
import { signIn } from '@/lib/auth/session'
import { useSessionStore } from '@/stores/session'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'required').pipe(z.email('email')),
  password: z.string().min(1, 'required'),
  remember: z.boolean(),
})

type LoginValues = z.infer<typeof loginSchema>

function redirectTarget(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const { from } = state
    if (typeof from === 'string' && from.startsWith('/') && from !== '/login') return from
  }
  return '/'
}

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common'])
  const translateError = useTranslateError()
  const location = useLocation()
  const status = useSessionStore((state) => state.status)
  const emailId = useId()
  const passwordId = useId()
  const [submitError, setSubmitError] = useState<unknown>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: true },
  })

  if (status === 'authenticated') {
    return <Navigate to={redirectTarget(location.state)} replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      await signIn(values)
    } catch (error) {
      setSubmitError(error)
    }
  })

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/solvia.svg" alt="" className="size-12" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('login.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('login.subtitle')}</p>
          </div>
        </div>

        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="bg-surface flex flex-col gap-4 rounded-xl border p-6 shadow-xs"
        >
          <FormField label={t('login.email')} htmlFor={emailId} error={errors.email?.message}>
            <input
              id={emailId}
              type="email"
              autoComplete="username"
              aria-invalid={Boolean(errors.email)}
              className={inputClass}
              {...register('email')}
            />
          </FormField>
          <FormField
            label={t('login.password')}
            htmlFor={passwordId}
            error={errors.password?.message}
          >
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              className={inputClass}
              {...register('password')}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-primary size-4" {...register('remember')} />
            {t('login.remember')}
          </label>
          {submitError !== null && (
            <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2 text-sm">
              {translateError(submitError)}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={isSubmitting} className="py-2">
            {isSubmitting ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>

        <div className="flex justify-center gap-3">
          <LanguageSelector />
          <ThemeSelector />
        </div>
      </div>
    </main>
  )
}
