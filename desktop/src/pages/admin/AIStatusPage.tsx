import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAIStatus } from '@/lib/api/ai'
import { useTranslateError } from '@/lib/api/errors'
import { useFormatters } from '@/lib/format'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

export function AIStatusPage() {
  const { t } = useTranslation('ai')
  const translateError = useTranslateError()
  const { number, dateTime } = useFormatters()
  const status = useAIStatus()

  if (status.isPending) {
    return <p className="text-muted-foreground text-sm">{t('analyzing')}</p>
  }
  if (status.isError) {
    return (
      <p role="alert" className="text-danger text-sm">
        {translateError(status.error)}
      </p>
    )
  }

  const data = status.data
  const share = data.daily_token_budget > 0 ? data.tokens_used_today / data.daily_token_budget : 1
  const last = data.last_daily_run

  return (
    <section className="bg-surface flex flex-col gap-4 rounded-xl border p-6 shadow-xs">
      <header>
        <h2 className="font-semibold">{t('admin.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('admin.description')}</p>
      </header>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t('admin.usage')}</span>
          <span data-testid="ai-usage">
            {t('admin.usageValue', {
              used: number(data.tokens_used_today),
              budget: number(data.daily_token_budget),
            })}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('admin.usage')}
          aria-valuemin={0}
          aria-valuemax={data.daily_token_budget}
          aria-valuenow={data.tokens_used_today}
          className="bg-surface-muted h-2 overflow-hidden rounded-full"
        >
          <div
            className={`h-full rounded-full ${data.budget_exceeded ? 'bg-danger' : 'bg-primary'}`}
            style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
          />
        </div>
        {data.budget_exceeded && (
          <p role="status" className="text-danger text-xs">
            {t('admin.budgetExceeded')}
          </p>
        )}
      </div>
      <dl>
        <Row label={t('admin.provider')}>{t(`admin.providers.${data.provider}`)}</Row>
        <Row label={t('admin.requestModel')}>{data.request_model ?? '—'}</Row>
        <Row label={t('admin.overviewModel')}>{data.overview_model ?? '—'}</Row>
        <Row label={t('admin.keyConfigured')}>
          {data.key_configured ? t('admin.yes') : t('admin.no')}
        </Row>
        <Row label={t('admin.automatic')}>
          {data.automatic_enabled ? t('admin.enabled') : t('admin.disabled')}
        </Row>
        <Row label={t('admin.sendText')}>
          {data.send_request_text ? t('admin.yes') : t('admin.no')}
        </Row>
        <Row label={t('admin.userLimit')}>
          {t('admin.userLimitValue', { count: data.user_hourly_limit })}
        </Row>
        <Row label={t('admin.lastDaily')}>
          {last
            ? t('admin.lastDailyValue', {
                time: dateTime(last.created_at),
                source: t(`source.${last.source}`),
                tokens: number(last.tokens_used),
              })
            : t('admin.never')}
        </Row>
      </dl>
    </section>
  )
}
