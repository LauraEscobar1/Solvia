import { ArrowRight, Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DuePill, StageProgress } from '@/components/requests/RequestPills'
import { SectionCard } from '@/components/ui/Card'
import { EmptyState, QueryState, SkeletonRows } from '@/components/ui/States'
import { useRequests } from '@/lib/api/requests'
import { SLA_STAGES } from '@/lib/api/types'

const MINE_SIZE = 5

export function MyRequests() {
  const { t } = useTranslation('dashboard')
  const requests = useRequests({
    status: [...SLA_STAGES],
    priority: [],
    page: 1,
    size: MINE_SIZE,
    sort: '-last_activity_at',
  })
  const items = requests.data?.items ?? []

  return (
    <SectionCard
      title={t('mine.title')}
      description={t('mine.description')}
      actions={
        <Link to="/requests" className="text-caption text-accent-text inline-flex items-center gap-1 rounded-full font-semibold hover:underline">
          {t('mine.viewAll')}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      }
    >
      <QueryState
        query={requests}
        loading={<SkeletonRows rows={3} />}
        isEmpty={items.length === 0}
        empty={<EmptyState icon={Inbox} title={t('mine.empty')} compact />}
      >
        <ul className="flex flex-col">
          {items.map((request) => (
            <li key={request.id} className="border-divider border-b last:border-0">
              <Link
                to={`/requests/${request.id}`}
                className="hover:bg-surface-sunken/50 -mx-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-inner px-3 py-3"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-code text-muted-foreground font-mono">{request.code}</span>
                  <span className="text-body truncate font-semibold">{request.title}</span>
                </span>
                <span className="w-32">
                  <StageProgress status={request.status} />
                </span>
                <span className="flex w-52 justify-end">
                  <DuePill request={request} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </QueryState>
    </SectionCard>
  )
}
