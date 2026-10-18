import { BrainCircuit, Database, type LucideIcon, RefreshCw, Server } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { StatusBadge, type StatusTone } from '@/components/StatusBadge'
import { Button } from '@/components/ui/Button'
import { InlineAlert } from '@/components/ui/States'
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
    <article className="bg-surface-raised rounded-inner flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <span className="bg-surface-sunken text-foreground rounded-cell inline-flex size-9 items-center justify-center">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h3 className="text-body font-semibold">{title}</h3>
      </div>
      <div>
        <StatusBadge tone={tone}>{status}</StatusBadge>
      </div>
      {children && <div className="text-caption text-muted-foreground flex flex-col gap-0.5">{children}</div>}
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
      {health.isError && <InlineAlert tone="error">{translateError(health.error)}</InlineAlert>}

      <div className="grid gap-3 sm:grid-cols-3">
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
            <code className="text-code font-mono">{data.ai.model}</code>
          )}
        </HealthCard>
      </div>

      <footer className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2">
        {data && (
          <StatusBadge tone={data.status === 'ok' ? 'success' : 'warning'}>
            {t(`health.overall.${data.status}`)}
          </StatusBadge>
        )}
        {lastChecked > 0 && <span>{t('health.lastChecked', { time: dateTime(lastChecked) })}</span>}
        <span>{t('health.apiUrl', { url: apiBaseUrl })}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          loading={health.isFetching}
          onClick={() => void health.refetch()}
        >
          {!health.isFetching && <RefreshCw className="size-3.5" aria-hidden="true" />}
          {t('common:actions.retry')}
        </Button>
      </footer>
    </div>
  )
}
