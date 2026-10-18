import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrendPoint } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { useThemeColors } from '@/lib/themeColors'
import { useDayLabel } from './dayLabel'
const PLOT_HEIGHT = 240
const TICK_STEPS = 4
const BAND_WIDTH = 36

function tickDays(days: readonly TrendPoint[]): string[] {
  if (days.length <= TICK_STEPS * 2) return days.map((point) => point.day)
  return Array.from({ length: TICK_STEPS + 1 }, (_, index) => {
    const point = days[Math.round((index * (days.length - 1)) / TICK_STEPS)]
    return point?.day ?? ''
  })
}

function isTrendPoint(value: unknown): value is TrendPoint {
  return typeof value === 'object' && value !== null && 'day' in value && 'created' in value && 'completed' in value
}

function TrendTooltip({ point }: { point: TrendPoint }) {
  const { t } = useTranslation('dashboard')
  const { number } = useFormatters()
  const dayLabel = useDayLabel()
  const net = point.created - point.completed
  const netLabel =
    net === 0
      ? t('trends.netEven')
      : t(net > 0 ? 'trends.netUp' : 'trends.netDown', { count: Math.abs(net) })

  return (
    <div className="bg-feature text-feature-foreground on-dark shadow-pop text-caption rounded-inner flex flex-col gap-1.5 px-3 py-2">
      <p className="font-semibold">
        {netLabel} · {dayLabel(point.day)}
      </p>
      <ul className="flex flex-col gap-1">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="bg-foreground h-0.5 w-3 rounded-full" />
          <span className="font-semibold tabular-nums">{number(point.created)}</span>
          <span className="text-muted-foreground">{t('trends.created')}</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="bg-accent-line h-0.5 w-3 rounded-full" />
          <span className="font-semibold tabular-nums">{number(point.completed)}</span>
          <span className="text-muted-foreground">{t('trends.completed')}</span>
        </li>
      </ul>
    </div>
  )
}

export function TrendPlot({ days }: { days: readonly TrendPoint[] }) {
  const { t } = useTranslation('dashboard')
  const colors = useThemeColors()
  const dayLabel = useDayLabel()
  const axis = {
    stroke: colors['chart-grid'],
    tick: { fill: colors['muted-foreground'], fontSize: 12, fontWeight: 500 },
    tickLine: false,
    axisLine: false,
  }
  const activeDot = (stroke: string) => ({ r: 5, fill: stroke, stroke: colors['surface-solid'], strokeWidth: 2 })

  return (
    <div className="rounded-inner">
      <LineChart
        responsive
        title={t('trends.title')}
        data={[...days]}
        style={{ width: '100%', height: PLOT_HEIGHT }}
        margin={{ top: 12, right: 20, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} stroke={colors['chart-grid']} />
        <XAxis
          dataKey="day"
          ticks={tickDays(days)}
          interval={0}
          tickFormatter={dayLabel}
          tickMargin={12}
          {...axis}
        />
        <YAxis allowDecimals={false} width={36} tickMargin={8} {...axis} />
        <Tooltip
          cursor={{ stroke: colors['accent-band'], strokeWidth: BAND_WIDTH, strokeOpacity: 0.7 }}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const point: unknown = payload[0]?.payload
            return active && isTrendPoint(point) ? <TrendTooltip point={point} /> : null
          }}
        />
        <Line
          type="monotone"
          dataKey="created"
          name={t('trends.created')}
          stroke={colors.foreground}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={activeDot(colors.foreground)}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="completed"
          name={t('trends.completed')}
          stroke={colors['accent-line']}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={activeDot(colors['accent-line'])}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  )
}
