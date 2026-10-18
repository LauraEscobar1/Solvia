import { KeyRound } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NotificationSettings } from '@/components/alerts/NotificationSettings'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'
import { SystemStatus } from '@/components/SystemStatus'
import { ThemeSelector } from '@/components/ThemeSelector'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, SectionCard } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { InlineAlert } from '@/components/ui/States'
import { inputClass } from '@/components/ui/styles'
import { saveLanguagePreference } from '@/lib/auth/preferences'
import { isSupportedLanguage, SUPPORTED_LANGUAGES } from '@/locales'
import { useSessionStore } from '@/stores/session'
import { DEFAULT_API_BASE_URL, normalizeApiBaseUrl, useSettingsStore } from '@/stores/settings'

type SaveStatus = 'idle' | 'invalid' | 'saved'

function ProfileCard() {
  const { t } = useTranslation(['settings', 'auth'])
  const user = useSessionStore((state) => state.user)
  const [changing, setChanging] = useState(false)
  const [changed, setChanged] = useState(false)
  if (!user) return null

  return (
    <Card as="section" aria-label={t('profile.title')} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar name={user.full_name} id={user.id} size="lg" self />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-heading">{user.full_name}</h2>
          <p className="text-body text-muted-foreground">
            {[user.email, t(`auth:roles.${user.role}`), user.area?.name ?? t('profile.allAreas')].join(' · ')}
          </p>
        </div>
        <Button
          onClick={() => {
            setChanged(false)
            setChanging(true)
          }}
        >
          <KeyRound className="size-4" aria-hidden="true" />
          {t('security.change')}
        </Button>
      </div>
      {changed && <InlineAlert tone="success">{t('security.changed')}</InlineAlert>}
      {changing && (
        <Dialog
          title={t('security.title')}
          description={t('security.description')}
          onClose={() => {
            setChanging(false)
          }}
        >
          <ChangePasswordForm
            onSuccess={() => {
              setChanging(false)
              setChanged(true)
            }}
          />
        </Dialog>
      )}
    </Card>
  )
}

function LanguageCard() {
  const { t, i18n } = useTranslation(['settings', 'common'])
  const current = i18n.resolvedLanguage ?? i18n.language

  return (
    <Card as="section" aria-label={t('common:language.label')} className="flex flex-wrap items-center justify-between gap-4">
      <h2 className="text-heading">{t('common:language.label')}</h2>
      <SegmentedControl
        label={t('common:language.label')}
        variant="raised"
        value={isSupportedLanguage(current) ? current : null}
        onChange={(language) => {
          void saveLanguagePreference(language)
        }}
        options={SUPPORTED_LANGUAGES.map((language) => ({ value: language, label: t(`common:language.${language}`) }))}
      />
    </Card>
  )
}

function ApiCard() {
  const { t } = useTranslation(['settings', 'common'])
  const inputId = useId()
  const helpId = useId()
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const setApiBaseUrl = useSettingsStore((state) => state.setApiBaseUrl)
  const resetApiBaseUrl = useSettingsStore((state) => state.resetApiBaseUrl)
  const [draft, setDraft] = useState(apiBaseUrl)
  const [status, setStatus] = useState<SaveStatus>('idle')

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

  return (
    <SectionCard title={t('api.title')} description={t('api.description')}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <label htmlFor={inputId} className="text-caption font-semibold">
          {t('api.baseUrl')}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={inputId}
            type="url"
            inputMode="url"
            spellCheck={false}
            value={draft}
            aria-describedby={helpId}
            onChange={(event) => {
              setDraft(event.target.value)
              setStatus('idle')
            }}
            aria-invalid={status === 'invalid'}
            className={`${inputClass} min-w-64 flex-1 font-mono`}
          />
          <Button type="submit" variant="solid">
            {t('common:actions.save')}
          </Button>
          <Button
            onClick={() => {
              resetApiBaseUrl()
              setDraft(DEFAULT_API_BASE_URL)
              setStatus('saved')
            }}
          >
            {t('common:actions.reset')}
          </Button>
        </div>
        <p id={helpId} className="text-caption text-muted-foreground">
          {t('api.default', { url: DEFAULT_API_BASE_URL })}
        </p>
        {status === 'invalid' && <InlineAlert tone="error">{t('api.invalidUrl')}</InlineAlert>}
        {status === 'saved' && <InlineAlert tone="success">{t('api.saved')}</InlineAlert>}
      </form>
    </SectionCard>
  )
}

export function SettingsPage() {
  const { t } = useTranslation(['settings', 'nav'])
  const authenticated = useSessionStore((state) => state.status === 'authenticated')

  return (
    <div className="max-w-settings flex w-full flex-col gap-6">
      <PageHeader title={t('nav:settings')} />
      {authenticated && <ProfileCard />}
      <SectionCard title={t('appearance.title')} description={authenticated ? t('appearance.syncNote') : undefined}>
        <ThemeSelector />
      </SectionCard>
      <LanguageCard />
      <SectionCard title={t('notifications.title')} description={t('notifications.description')}>
        <NotificationSettings />
      </SectionCard>
      <SectionCard title={t('health.title')} description={t('health.description')}>
        <SystemStatus />
      </SectionCard>
      <ApiCard />
    </div>
  )
}
