import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts'
import type { DashboardQuery } from '@/lib/api/types'
import { useStatusBreakdown } from '@/lib/api/dashboard'
import { useFormatters } from '@/lib/format'
import { STATUS_TONES, TONE_COLORS } from '@/lib/requests/tones'
import { useThemeColors } from '@/lib/themeColors'
import { axisProps, chartFrame, tooltipProps } from './chartStyles'
import { DashboardBlock } from './DashboardBlock'

export function StatusChart({ query }: { query: DashboardQuery }) {
  const { t } = useTranslation(['dashboard', 'requests'])
  const { number } = useFormatters()
  const colors = useThemeColors()
  const breakdown = useStatusBreakdown(query)
  const items = breakdown.data?.items ?? []
  const data = items.map((item) => ({
    status: item.status,
    label: t(`requests:status.${item.status}`),
    count: item.count,
    color: colors[TONE_COLORS[STATUS_TONES[item.status]]],
  }))

  return (
    <DashboardBlock
      title={t('byStatus.title')}
      description={t('byStatus.description')}
      state={breakdown}
      isEmpty={items.every((item) => item.count === 0)}
    >
      <BarChart
        responsive
        data={data}
        style={chartFrame()}
        margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        accessibilityLayer
      >
        <CartesianGrid vertical={false} stroke={colors.border} strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axisProps(colors)} />
        <YAxis allowDecimals={false} {...axisProps(colors)} />
        <Tooltip
          {...tooltipProps(colors)}
          formatter={(value) => [number(Number(value)), t('byStatus.count')]}
        />
        <Bar dataKey="count" name={t('byStatus.count')} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={entry.color} data-status={entry.status} />
          ))}
        </Bar>
      </BarChart>
    </DashboardBlock>
  )
}
