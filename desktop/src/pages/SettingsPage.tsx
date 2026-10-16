import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NotificationSettings } from '@/components/alerts/NotificationSettings'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'
import { LanguageSelector } from '@/components/LanguageSelector'
import { SystemStatus } from '@/components/SystemStatus'
import { ThemeSelector } from '@/components/ThemeSelector'
import { useSessionStore } from '@/stores/session'
import { DEFAULT_API_BASE_URL, normalizeApiBaseUrl, useSettingsStore } from '@/stores/settings'

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="bg-surface rounded-xl border p-6 shadow-xs">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-1 mb-5 text-sm">{description}</p>
      {children}
    </section>
  )
}

type SaveStatus = 'idle' | 'invalid' | 'saved'

export function SettingsPage() {
  const { t } = useTranslation(['settings', 'common'])
  const inputId = useId()
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const setApiBaseUrl = useSettingsStore((state) => state.setApiBaseUrl)
  const resetApiBaseUrl = useSettingsStore((state) => state.resetApiBaseUrl)
  const [draft, setDraft] = useState(apiBaseUrl)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const authenticated = useSessionStore((state) => state.status === 'authenticated')

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = normalizeApiBaseUrl(draft)
    if (!normalized) {
      setStatus('invalid')
      return
    }
    setApiBaseUrl(normalized)
    setDraft(normalized)
    setStatus('saved')
  }

  const onReset = () => {
    resetApiBaseUrl()
    setDraft(DEFAULT_API_BASE_URL)
    setStatus('saved')
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <p className="text-muted-foreground text-sm">{t('subtitle')}</p>

      <Section title={t('api.title')} description={t('api.description')}>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <label htmlFor={inputId} className="text-sm font-medium">
            {t('api.baseUrl')}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={inputId}
              type="url"
              inputMode="url"
              spellCheck={false}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                setStatus('idle')
              }}
              aria-invalid={status === 'invalid'}
              className="bg-background min-w-64 flex-1 rounded-lg border px-3 py-2 font-mono text-sm aria-invalid:border-danger"
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              {t('common:actions.save')}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="hover:bg-surface-muted rounded-lg border px-4 py-2 text-sm font-medium"
            >
              {t('common:actions.reset')}
            </button>
          </div>
          <p className="text-muted-foreground text-xs">
            {t('api.default', { url: DEFAULT_API_BASE_URL })}
          </p>
          {status === 'invalid' && (
            <p role="alert" className="text-danger text-sm">
              {t('api.invalidUrl')}
            </p>
          )}
          {status === 'saved' && (
            <p role="status" className="text-success text-sm">
              {t('api.saved')}
            </p>
          )}
        </form>
      </Section>

      <Section title={t('health.title')} description={t('health.description')}>
        <SystemStatus />
      </Section>

      <Section title={t('appearance.title')} description={t('appearance.description')}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{t('common:theme.label')}</span>
            <ThemeSelector />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{t('common:language.label')}</span>
            <LanguageSelector />
          </div>
        </div>
        {authenticated && (
          <p className="text-muted-foreground mt-4 text-xs">{t('appearance.syncNote')}</p>
        )}
      </Section>

      <Section title={t('notifications.title')} description={t('notifications.description')}>
        <NotificationSettings />
      </Section>

      {authenticated && (
        <Section title={t('security.title')} description={t('security.description')}>
          <ChangePasswordForm />
        </Section>
      )}
    </div>
  )
}
