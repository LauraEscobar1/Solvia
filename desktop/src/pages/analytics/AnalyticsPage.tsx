import { useTranslation } from 'react-i18next'
import { Stagger, StaggerItem } from '@/components/motion/Motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { DashboardQuery } from '@/lib/api/types'
import { useNow } from '@/lib/clock'
import { useSessionStore } from '@/stores/session'
import { AreaFilter } from '../dashboard/AreaFilter'
import { useDashboardArea } from '../dashboard/dashboardQuery'
import { ANALYTICS_RANGES, type AnalyticsRange, rangeStart, useAnalyticsRange } from './analyticsRange'
import { BottleneckCard } from './BottleneckCard'
import { StageFlowCard } from './StageFlowCard'
import { TrendCard } from './TrendCard'

const RANGE_LABELS = { '7': 'days7', '30': 'days30', '90': 'quarter' } as const satisfies Record<AnalyticsRange, string>

export function AnalyticsPage() {
  const { t } = useTranslation(['nav', 'dashboard'])
  const role = useSessionStore((state) => state.user?.role)
  const now = useNow()
  const [range, setRange] = useAnalyticsRange()
  const [areaId, setAreaId] = useDashboardArea()
  const showsBottlenecks = role !== undefined && role !== 'requester'
  const scope: DashboardQuery = { area_id: areaId }
  const period: DashboardQuery = { ...scope, date_from: rangeStart(range, now) }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('analytics')}
        actions={
          <>
            {role === 'admin' && <AreaFilter value={areaId} onChange={setAreaId} />}
            <SegmentedControl
              label={t('dashboard:range.label')}
              value={range}
              onChange={setRange}
              options={ANALYTICS_RANGES.map((value) => ({
                value,
                label: t(`dashboard:range.${RANGE_LABELS[value]}`),
              }))}
            />
          </>
        }
      />
      <Stagger className="flex flex-col gap-6">
        <StaggerItem>
          <TrendCard query={period} />
        </StaggerItem>
        <div className={`grid gap-6 ${showsBottlenecks ? 'lg:grid-cols-2' : ''}`}>
          <StaggerItem>
            <StageFlowCard query={scope} />
          </StaggerItem>
          {showsBottlenecks && (
            <StaggerItem>
              <BottleneckCard query={scope} />
            </StaggerItem>
          )}
        </div>
      </Stagger>
    </div>
  )
}
