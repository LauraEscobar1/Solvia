import { ChartLine, Download } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/Card'
import { EmptyState, InlineAlert, QueryState, Skeleton } from '@/components/ui/States'
import { useDashboardSummary, useTrends } from '@/lib/api/dashboard'
import type { DashboardQuery, TrendSeries } from '@/lib/api/types'
import { toCsv } from '@/lib/csv'
import { exportTextFile } from '@/lib/exportFile'
import { useFormatters, useLongDuration } from '@/lib/format'
import { useDayLabel } from './dayLabel'

const TrendPlot = lazy(() => import('./TrendPlot').then((module) => ({ default: module.TrendPlot })))

const PLOT_SKELETON = <Skeleton className="h-60" />

type ExportNotice = { tone: 'success' | 'error'; message: string }

function SeriesLegend() {
  const { t } = useTranslation('dashboard')
  return (
    <ul aria-label={t('trends.legend')} className="text-caption text-muted-foreground flex flex-wrap items-center gap-4">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="bg-foreground h-0.5 w-3 rounded-full" />
        {t('trends.created')}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="bg-accent-line h-0.5 w-3 rounded-full" />
        {t('trends.completed')}
      </li>
    </ul>
  )
}

function TrendTable({ series }: { series: TrendSeries }) {
  const { t } = useTranslation('dashboard')
  const dayLabel = useDayLabel()
  return (
    <table className="sr-only">
      <caption>{t('trends.table')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('trends.day')}</th>
          <th scope="col">{t('trends.created')}</th>
          <th scope="col">{t('trends.completed')}</th>
        </tr>
      </thead>
      <tbody>
        {series.days.map((point) => (
          <tr key={point.day}>
            <th scope="row">{dayLabel(point.day)}</th>
            <td>{point.created}</td>
            <td>{point.completed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TrendCard({ query }: { query: DashboardQuery }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const { number } = useFormatters()
  const duration = useLongDuration()
  const trends = useTrends(query)
  const summary = useDashboardSummary(query)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<ExportNotice | null>(null)
  const series = trends.data
  const completed = series?.days.reduce((total, point) => total + point.completed, 0)
  const resolution = summary.data?.avg_resolution_hours
  const isEmpty = series?.days.every((point) => point.created === 0 && point.completed === 0) ?? false

  const download = async () => {
    if (!series) return
    const csv = toCsv([
      [t('trends.day'), t('trends.created'), t('trends.completed')],
      ...series.days.map((point) => [point.day, point.created, point.completed]),
    ])
    const fileName = `${t('trends.fileName')}-${series.range.date_from}-${series.range.date_to}.csv`
    setExporting(true)
    setNotice(null)
    try {
      const path = await exportTextFile(fileName, csv, 'text/csv;charset=utf-8')
      if (path) setNotice({ tone: 'success', message: t('trends.saved', { path }) })
    } catch {
      setNotice({ tone: 'error', message: t('trends.exportError') })
    } finally {
      setExporting(false)
    }
  }

  return (
    <SectionCard
      title={t('trends.title')}
      description={<SeriesLegend />}
      actions={
        <>
          <dl className="mr-2 flex items-center gap-6">
            <div className="flex flex-col">
              <dt className="text-caption text-muted-foreground">{t('trends.completedTotal')}</dt>
              <dd className="text-heading">{completed === undefined ? t('common:noValue') : number(completed)}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-caption text-muted-foreground">{t('trends.avgResolution')}</dt>
              <dd className="text-heading">{resolution == null ? t('common:noValue') : duration(resolution)}</dd>
            </div>
          </dl>
          <Button
            variant="solid"
            loading={exporting}
            disabled={!series || isEmpty}
            onClick={() => {
              void download()
            }}
          >
            {!exporting && <Download className="size-4" aria-hidden="true" />}
            {t('trends.download')}
          </Button>
        </>
      }
    >
      {notice && <InlineAlert tone={notice.tone}>{notice.message}</InlineAlert>}
      <QueryState
        query={trends}
        loading={PLOT_SKELETON}
        isEmpty={isEmpty}
        empty={<EmptyState compact icon={ChartLine} title={t('trends.empty')} />}
      >
        {series && (
          <div
            aria-busy={trends.isPlaceholderData}
            className={`transition-opacity ${trends.isPlaceholderData ? 'opacity-60' : ''}`}
          >
            <Suspense fallback={PLOT_SKELETON}>
              <TrendPlot days={series.days} />
            </Suspense>
            <TrendTable series={series} />
          </div>
        )}
      </QueryState>
    </SectionCard>
  )
}
