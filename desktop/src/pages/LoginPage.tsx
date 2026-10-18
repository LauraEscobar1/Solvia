import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Inbox, LockKeyhole, Mail, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Trans, useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router'
import { z } from 'zod'
import { LogoMark } from '@/components/brand/LogoMark'
import { LanguageSelector } from '@/components/LanguageSelector'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { FormField } from '@/components/ui/FormField'
import { InlineAlert } from '@/components/ui/States'
import { TextField } from '@/components/ui/TextField'
import { useHealth } from '@/lib/api/health'
import { useTranslateError } from '@/lib/api/errors'
import { REQUEST_STATUSES } from '@/lib/api/types'
import { signIn } from '@/lib/auth/session'
import { useSessionStore } from '@/stores/session'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'required').pipe(z.email('email')),
  password: z.string().min(1, 'required'),
  remember: z.boolean(),
})

type LoginValues = z.infer<typeof loginSchema>

const HERO_STAGES = REQUEST_STATUSES.filter((status) => status !== 'cancelled')
const HERO_ACTIVE_STAGE = 'in_progress'

function redirectTarget(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const { from } = state
    if (typeof from === 'string' && from.startsWith('/') && from !== '/login') return from
  }
  return '/'
}

function Hero() {
  const { t } = useTranslation(['auth', 'common', 'requests'])

  const features = [
    { icon: Inbox, title: t('login.featureAllTitle'), body: t('login.featureAllBody') },
    { icon: Sparkles, title: t('login.featureAlertsTitle'), body: t('login.featureAlertsBody') },
  ]

  return (
    <Card variant="hero" padding="none" className="relative flex flex-col gap-8 overflow-hidden p-11">
      <span
        aria-hidden="true"
        className="border-accent-line/40 pointer-events-none absolute -top-14 -right-26 size-96 rounded-full border"
      />
      <span
        aria-hidden="true"
        className="border-accent-line/40 pointer-events-none absolute -top-14 -right-14 size-64 rounded-full border"
      />
      <div className="relative flex items-center gap-4">
        <LogoMark />
        <span className="text-brand">{t('common:appName')}</span>
      </div>
      <p className="text-display relative">
        <span className="block">{t('login.heroLine1')}</span>
        <span className="text-accent block">{t('login.heroLine2')}</span>
      </p>
      <p className="text-feature-muted text-lead relative max-w-md">
        <Trans i18nKey="login.heroBody" ns="auth" components={{ strong: <strong className="text-feature-foreground font-semibold" /> }} />
      </p>
      <ol aria-label={t('login.stages')} className="relative flex flex-wrap items-center gap-2">
        {HERO_STAGES.map((status, index) => (
          <li key={status} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true" className="bg-feature-muted/40 h-px w-3" />}
            <span
              className={[
                'text-caption inline-flex h-8 items-center rounded-full px-3 font-semibold',
                status === HERO_ACTIVE_STAGE ? 'bg-accent text-accent-foreground' : 'bg-hero-row text-feature-foreground',
              ].join(' ')}
            >
              {t(`requests:status.${status}`)}
            </span>
          </li>
        ))}
      </ol>
      <ul className="relative flex flex-col gap-4">
        {features.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3">
            <span className="bg-hero-row text-accent inline-flex size-9 shrink-0 items-center justify-center rounded-cell">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="flex flex-col">
              <span className="text-body font-semibold">{title}</span>
              <span className="text-caption text-feature-muted">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common'])
  const translateError = useTranslateError()
  const location = useLocation()
  const status = useSessionStore((state) => state.status)
  const organization = useHealth().data?.organization?.name ?? null
  const ids = { email: useId(), password: useId(), hint: useId() }
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [showHint, setShowHint] = useState(false)
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
    <main className="flex min-h-full items-center justify-center px-6 py-10">
      <div className="grid w-full max-w-auth gap-5 lg:grid-cols-2">
        <Hero />
        <Card variant="glass" padding="none" className="rounded-feature flex flex-col p-11">
          <div className="flex min-h-10 items-center justify-between gap-4">
            <span className="text-caption text-muted-foreground font-semibold">{organization}</span>
            <LanguageSelector />
          </div>
          <div className="mt-12 flex flex-col gap-1">
            <h1 className="text-greeting">{t('login.title')}</h1>
            <p className="text-body text-muted-foreground">{t('login.subtitle')}</p>
          </div>
          <form noValidate onSubmit={(event) => void onSubmit(event)} className="mt-8 flex flex-col gap-5">
            <FormField label={t('login.email')} htmlFor={ids.email} error={errors.email?.message}>
              <TextField
                id={ids.email}
                type="email"
                icon={Mail}
                autoComplete="username"
                placeholder={t('login.emailPlaceholder')}
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
            </FormField>
            <FormField
              label={t('login.password')}
              htmlFor={ids.password}
              error={errors.password?.message}
              aside={
                <button
                  type="button"
                  aria-expanded={showHint}
                  aria-controls={ids.hint}
                  onClick={() => {
                    setShowHint((value) => !value)
                  }}
                  className="text-caption rounded-full font-semibold underline underline-offset-4"
                >
                  {t('login.forgot')}
                </button>
              }
            >
              <TextField
                id={ids.password}
                type="password"
                icon={LockKeyhole}
                revealable
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                {...register('password')}
              />
            </FormField>
            <div id={ids.hint} hidden={!showHint}>
              <InlineAlert tone="info">{t('login.forgotHint')}</InlineAlert>
            </div>
            <Checkbox label={t('login.remember')} {...register('remember')} />
            {submitError !== null && <InlineAlert tone="error">{translateError(submitError)}</InlineAlert>}
            <Button type="submit" variant="accent" size="lg" loading={isSubmitting} className="w-full">
              {isSubmitting ? t('login.submitting') : t('login.submit')}
              {!isSubmitting && <ArrowRight className="size-4" aria-hidden="true" />}
            </Button>
          </form>
          <p className="text-caption text-muted-foreground mt-6">{t('login.noAccount')}</p>
        </Card>
      </div>
    </main>
  )
}
