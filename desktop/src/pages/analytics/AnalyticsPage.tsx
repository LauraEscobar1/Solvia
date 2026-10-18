import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/ui/PageHeader'
import { useSessionStore } from '@/stores/session'
import { BottleneckHeatmap } from '../dashboard/BottleneckHeatmap'
import { BlockSkeleton } from '../dashboard/DashboardBlock'
import { useDashboardQuery } from '../dashboard/dashboardQuery'

const TrendChart = lazy(() =>
  import('../dashboard/TrendChart').then((module) => ({ default: module.TrendChart })),
)

export function AnalyticsPage() {
  const { t } = useTranslation('nav')
  const role = useSessionStore((state) => state.user?.role)
  const [query] = useDashboardQuery()
  const showsBottlenecks = role !== undefined && role !== 'requester'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('analytics')} />
      <Suspense fallback={<BlockSkeleton rows={6} />}>
        <TrendChart query={query} />
      </Suspense>
      {showsBottlenecks && <BottleneckHeatmap query={query} />}
    </div>
  )
}
