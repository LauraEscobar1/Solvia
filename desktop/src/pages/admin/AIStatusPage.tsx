import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SectionCard } from '@/components/ui/Card'
import { ErrorState, LoadingState, SkeletonRows } from '@/components/ui/States'
import { useAIStatus } from '@/lib/api/ai'
import { useFormatters } from '@/lib/format'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-divider flex flex-col gap-0.5 border-t py-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-caption text-muted-foreground font-semibold">{label}</dt>
      <dd className="text-body font-semibold">{children}</dd>
    </div>
  )
}

export function AIStatusPage() {
  const { t } = useTranslation('ai')
  const { number, dateTime } = useFormatters()
  const status = useAIStatus()

  if (status.isPending) return <LoadingState label={t('analyzing')} skeleton={<SkeletonRows rows={6} />} />
  if (status.isError) {
    return (
      <ErrorState
        error={status.error}
        onRetry={() => {
          void status.refetch()
        }}
      />
    )
  }

  const data = status.data
  const share = data.daily_token_budget > 0 ? data.tokens_used_today / data.daily_token_budget : 1
  const last = data.last_daily_run

  return (
    <SectionCard title={t('admin.title')} description={t('admin.description')}>
      <div className="flex flex-col gap-2">
        <div className="text-body flex items-center justify-between gap-3">
          <span className="font-semibold">{t('admin.usage')}</span>
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
          className="bg-surface-sunken h-2 overflow-hidden rounded-full"
        >
          <div
            className={`h-full rounded-full ${data.budget_exceeded ? 'bg-danger' : 'bg-accent-line'}`}
            style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
          />
        </div>
        {data.budget_exceeded && (
          <p role="status" className="text-caption text-danger-text font-medium">
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
    </SectionCard>
  )
}
