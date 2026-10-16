import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PriorityBadge } from '@/components/requests/RequestBadges'
import { StatusBadge } from '@/components/StatusBadge'
import { useAtRiskRequests, useStalledRequests } from '@/lib/api/dashboard'
import type { DashboardQuery, DashboardRequestItem } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { DashboardBlock } from './DashboardBlock'

type HighlightKind = 'atRisk' | 'stalled'

function HighlightDetail({ kind, item }: { kind: HighlightKind; item: DashboardRequestItem }) {
  const { t } = useTranslation(['dashboard', 'requests'])
  const { number, relative } = useFormatters()

  if (kind === 'stalled') {
    return (
      <span className="text-warning text-xs font-medium">
        {t('stalled.idle', { time: relative(item.last_activity_at) })}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-2">
      {item.sla_status === 'overdue' ? (
        <StatusBadge tone="danger">{t('requests:sla.overdue')}</StatusBadge>
      ) : (
        <StatusBadge tone="warning">{t('requests:sla.at_risk')}</StatusBadge>
      )}
      {item.consumed_pct !== null && (
        <span className="text-muted-foreground text-xs">
          {t('atRisk.consumed', { value: number(item.consumed_pct) })}
        </span>
      )}
    </span>
  )
}

function HighlightBlock({
  kind,
  query,
}: {
  kind: HighlightKind
  query: ReturnType<typeof useAtRiskRequests>
}) {
  const { t } = useTranslation('dashboard')
  const items = query.data?.items ?? []

  return (
    <DashboardBlock
      title={t(`${kind}.title`)}
      description={t(`${kind}.description`)}
      state={query}
      isEmpty={items.length === 0}
      emptyLabel={t(`${kind}.empty`)}
    >
      <ul className="-mx-2 flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={`/requests/${item.id}`}
              className="hover:bg-surface-muted flex flex-col gap-1 rounded-lg px-2 py-2"
            >
              <span className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-mono text-xs">{item.code}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                <PriorityBadge priority={item.priority} />
              </span>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">{item.area.name}</span>
                <HighlightDetail kind={kind} item={item} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardBlock>
  )
}

export function AtRiskList({ query }: { query: DashboardQuery }) {
  return <HighlightBlock kind="atRisk" query={useAtRiskRequests(query)} />
}

export function StalledList({ query }: { query: DashboardQuery }) {
  return <HighlightBlock kind="stalled" query={useStalledRequests(query)} />
}
