import { useTranslation } from 'react-i18next'
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { useTrends } from '@/lib/api/dashboard'
import type { DashboardQuery } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { useThemeColors } from '@/lib/themeColors'
import { axisProps, chartFrame, tooltipProps } from './chartStyles'
import { DashboardBlock } from './DashboardBlock'

const DAY_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' }

export function TrendChart({ query }: { query: DashboardQuery }) {
  const { t } = useTranslation('dashboard')
  const { dateTime } = useFormatters()
  const colors = useThemeColors()
  const trends = useTrends(query)
  const days = trends.data?.days ?? []
  const data = days.map((day) => ({ ...day, label: dateTime(`${day.day}T00:00:00Z`, DAY_FORMAT) }))

  return (
    <DashboardBlock
      title={t('trends.title')}
      description={t('trends.description')}
      state={trends}
      isEmpty={days.every((day) => day.created === 0 && day.completed === 0)}
    >
      <LineChart
        responsive
        data={data}
        style={chartFrame()}
        margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        accessibilityLayer
      >
        <CartesianGrid vertical={false} stroke={colors.border} strokeDasharray="3 3" />
        <XAxis dataKey="label" minTickGap={16} {...axisProps(colors)} />
        <YAxis allowDecimals={false} {...axisProps(colors)} />
        <Tooltip {...tooltipProps(colors)} />
        <Legend wrapperStyle={{ fontSize: 12, color: colors['muted-foreground'] }} />
        <Line
          type="monotone"
          dataKey="created"
          name={t('trends.created')}
          stroke={colors.primary}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="completed"
          name={t('trends.completed')}
          stroke={colors.success}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </DashboardBlock>
  )
}
