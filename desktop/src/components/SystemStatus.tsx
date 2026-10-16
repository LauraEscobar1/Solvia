import { BrainCircuit, Database, type LucideIcon, RefreshCw, Server } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { StatusBadge, type StatusTone } from '@/components/StatusBadge'
import { useTranslateError } from '@/lib/api/errors'
import { useHealth } from '@/lib/api/health'
import { useFormatters } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

interface HealthCardProps {
  icon: LucideIcon
  title: string
  tone: StatusTone
  status: string
  children?: ReactNode
}

function HealthCard({ icon: Icon, title, tone, status, children }: HealthCardProps) {
  return (
    <article className="bg-surface flex flex-col gap-4 rounded-xl border p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-primary-soft text-primary rounded-lg p-2">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        <StatusBadge tone={tone}>{status}</StatusBadge>
      </div>
      {children && <div className="text-muted-foreground text-sm">{children}</div>}
    </article>
  )
}

export function SystemStatus() {
  const { t } = useTranslation(['settings', 'common'])
  const translateError = useTranslateError()
  const { dateTime } = useFormatters()
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const health = useHealth()

  const data = health.isError ? undefined : health.data
  const pending = health.isPending
  const lastChecked = Math.max(health.dataUpdatedAt, health.errorUpdatedAt)
  const loadingLabel = t('common:loading')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void health.refetch()}
          disabled={health.isFetching}
          className="bg-surface hover:bg-surface-muted flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60"
        >
          <RefreshCw
            className={`size-4 ${health.isFetching ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {t('common:actions.retry')}
        </button>
      </div>

      {health.isError && (
        <div role="alert" className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">
          {translateError(health.error)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <HealthCard
          icon={Server}
          title={t('health.api')}
          tone={pending ? 'neutral' : data ? 'success' : 'danger'}
          status={pending ? loadingLabel : data ? t('health.online') : t('health.offline')}
        >
          {data && (
            <>
              <p>{t('health.version', { version: data.version })}</p>
              <p>{t(`health.environment.${data.environment}`)}</p>
            </>
          )}
        </HealthCard>

        <HealthCard
          icon={Database}
          title={t('health.database')}
          tone={!data ? 'neutral' : data.database.status === 'ok' ? 'success' : 'danger'}
          status={!data ? '—' : t(`health.${data.database.status}`)}
        />

        <HealthCard
          icon={BrainCircuit}
          title={t('health.ai')}
          tone={!data ? 'neutral' : data.ai.configured ? 'success' : 'warning'}
          status={!data ? '—' : t(`health.providers.${data.ai.provider}`)}
        >
          {data?.ai.model && (
            <code className="bg-surface-muted rounded px-1.5 py-0.5 text-xs">{data.ai.model}</code>
          )}
        </HealthCard>
      </div>

      <footer className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {data && (
          <StatusBadge tone={data.status === 'ok' ? 'success' : 'warning'}>
            {t(`health.overall.${data.status}`)}
          </StatusBadge>
        )}
        {lastChecked > 0 && <span>{t('health.lastChecked', { time: dateTime(lastChecked) })}</span>}
        <span>{t('health.apiUrl', { url: apiBaseUrl })}</span>
      </footer>
    </div>
  )
}
