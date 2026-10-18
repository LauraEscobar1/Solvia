import { RefreshCw, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Grow, Stagger, StaggerItem } from '@/components/motion/Motion'
import { ReassignButton } from '@/components/requests/ReassignButton'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, InlineAlert, Skeleton } from '@/components/ui/States'
import { useAIText } from '@/lib/ai/messages'
import { useInsightFeedback } from '@/lib/api/ai'
import { useDashboardSummary } from '@/lib/api/dashboard'
import { useTranslateError } from '@/lib/api/errors'
import { useAssignmentSuggestion, useRequest } from '@/lib/api/requests'
import { type OverviewInsight, type OverviewAnalysis, SLA_STAGES } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { requestsPath } from '@/lib/requests/filters'
import { AINotice, AIGeneratedLabel } from './AIParts'
import type { useAnalyzeOverview } from '@/lib/api/ai'

const HIGH_DAY = 4
const HEADLINE_WORDS = 15
const LONG_SUMMARY_CHARS = 140
const MAX_BAR = 72
const MIN_BAR = 24
const FORECAST_DAYS = 5
const SUNDAY = 0
const SATURDAY = 6
const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'short', timeZone: 'UTC' }

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const escaped = terms.filter(Boolean).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (escaped.length === 0) return <>{text}</>
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'))
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="text-accent">
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  )
}

function firstSentence(text: string): string {
  const sentence = text.trim().split(/(?<=[.!?])\s+/)[0] ?? ''
  const words = sentence.split(/\s+/)
  return words.length > HEADLINE_WORDS ? `${words.slice(0, HEADLINE_WORDS).join(' ')}…` : sentence
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function emptyForecast(): { day: string; count: number }[] {
  const days: { day: string; count: number }[] = []
  const cursor = new Date()
  while (days.length < FORECAST_DAYS) {
    if (cursor.getDay() !== SUNDAY && cursor.getDay() !== SATURDAY) days.push({ day: isoDate(cursor), count: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function DueForecast({ areaId }: { areaId?: string }) {
  const { t } = useTranslation('ai')
  const { number, dateTime } = useFormatters()
  const summary = useDashboardSummary({ area_id: areaId })
  const fallback = useMemo(() => emptyForecast(), [])
  if (summary.isPending) return <Skeleton className="bg-feature-row h-40" />
  const reported = summary.data?.due_by_day
  const days = reported && reported.length > 0 ? reported : fallback
  const today = days === fallback ? fallback[0]?.day : summary.data?.range.date_to
  const total = days.reduce((sum, item) => sum + item.count, 0)
  const peak = Math.max(1, ...days.map((item) => item.count))

  return (
    <section className="bg-feature-row rounded-inner flex flex-col gap-4 p-5" aria-label={t('overview.panel.dueTitle')}>
      <div className="text-caption flex items-center justify-between gap-3 font-semibold">
        <h3 className="text-muted-foreground">{t('overview.panel.dueTitle')}</h3>
        <span>{t('overview.panel.dueTotal', { count: total })}</span>
      </div>
      <ul className="flex items-end justify-around gap-2">
        {days.map((item, position) => {
          const label = item.day === today ? t('overview.panel.today') : dateTime(`${item.day}T00:00:00Z`, WEEKDAY)
          const tone = item.day === today ? 'bg-accent' : item.count >= HIGH_DAY ? 'bg-danger-strong' : 'bg-control-border'
          const height = MIN_BAR + ((MAX_BAR - MIN_BAR) * item.count) / peak
          return (
            <li
              key={item.day}
              className="text-caption flex flex-col items-center gap-2 font-semibold"
              aria-label={t('overview.panel.dueDay', { day: label, count: item.count })}
            >
              <span aria-hidden="true" className="text-body">
                {number(item.count)}
              </span>
              <span aria-hidden="true" className="block w-12" style={{ height }}>
                <Grow axis="y" delay={position * 0.04} className={`h-full w-full rounded-cell ${tone}`} />
              </span>
              <span aria-hidden="true" className="text-muted-foreground capitalize">
                {label}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ReassignAction({ requestId, code }: { requestId: string; code: string }) {
  const { t } = useTranslation('ai')
  const request = useRequest(requestId)
  const suggestion = useAssignmentSuggestion(requestId)
  const proposal = suggestion.data?.suggestion
  if (!request.data?.permissions.can_assign || !proposal) return null
  return (
    <ReassignButton
      requestId={requestId}
      code={code}
      version={request.data.version}
      suggestion={proposal}
      variant="outline"
      size="sm"
      label={t('overview.panel.reassign')}
    />
  )
}

function RecommendationCard({ insight, index, onNavigate }: { insight: OverviewInsight; index: number; onNavigate: () => void }) {
  const { t } = useTranslation('ai')
  const text = useAIText()
  const recommendation = insight.content.recommendations[index]
  const target = recommendation?.target
  if (!recommendation) return null
  const code = target?.request_code ?? null
  const link = target?.request_id
    ? `/requests/${target.request_id}`
    : target?.area_id
      ? requestsPath({ area_id: target.area_id, status: target.status ? [target.status] : [] })
      : null

  return (
    <li className="bg-feature-row rounded-inner grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-4 p-4">
      <span className="text-code text-muted-foreground font-mono">{code}</span>
      <div className="min-w-0">
        <p className="text-body truncate font-semibold">{text(recommendation.title)}</p>
        {recommendation.detail && <p className="text-caption text-muted-foreground line-clamp-2">{text(recommendation.detail)}</p>}
      </div>
      <div className="flex items-center gap-2">
        {target?.request_id && <ReassignAction requestId={target.request_id} code={code ?? ''} />}
        {link && (
          <Link
            to={link}
            onClick={onNavigate}
            aria-label={code ? `${t('overview.panel.view')} ${code}` : t('overview.panel.view')}
            className="border-control-border text-body inline-flex h-8 items-center rounded-full border px-4 font-semibold hover:bg-feature"
          >
            {t('overview.panel.view')}
          </Link>
        )}
      </div>
    </li>
  )
}

interface OverviewPanelProps {
  insight: OverviewInsight | null
  notice: OverviewAnalysis['notice']
  areaId?: string
  regenerate: ReturnType<typeof useAnalyzeOverview>
  onClose: () => void
}

export function OverviewPanel({ insight, notice, areaId, regenerate, onClose }: OverviewPanelProps) {
  const { t } = useTranslation(['ai', 'requests'])
  const text = useAIText()
  const translateError = useTranslateError()
  const { relative, number } = useFormatters()
  const feedback = useInsightFeedback()
  const summary = useDashboardSummary({ area_id: areaId })
  const [choice, setChoice] = useState<boolean | null>(null)
  const [expanded, setExpanded] = useState(false)
  const attempted = useRef(false)
  const stages = SLA_STAGES.map((stage) => t(`requests:status.${stage}`))
  const recommendations = insight?.content.recommendations ?? []
  const summaryText = insight ? text(insight.content.summary) : ''
  const headline = insight?.content.headline ? text(insight.content.headline) || firstSentence(summaryText) : firstSentence(summaryText)
  const { mutate: generate, isPending: generating, isError: generateFailed } = regenerate

  useEffect(() => {
    if (insight || generating || generateFailed || attempted.current) return
    attempted.current = true
    generate()
  }, [insight, generating, generateFailed, generate])

  const rate = (useful: boolean) => {
    if (!insight) return
    setChoice(useful)
    recommendations.forEach((_, item) => {
      feedback.mutate({ insightId: insight.id, item, useful })
    })
  }

  const buttonClass =
    'border-control-border inline-flex size-9 items-center justify-center rounded-full border transition-colors hover:bg-feature-row aria-pressed:bg-accent aria-pressed:text-accent-foreground'

  return (
    <Dialog
      title={t('ai:overview.title')}
      variant="sheet"
      tone="feature"
      onClose={onClose}
      header={(titleId, close) => (
        <header className="flex items-center justify-between gap-3 px-6 pt-6 pb-2">
          <h2 id={titleId} className="text-body text-accent flex items-center gap-2 font-semibold">
            <span aria-hidden="true" className="bg-accent size-2 rounded-full" />
            {t('ai:overview.panel.badge')}
          </h2>
          <div className="flex items-center gap-3">
            {insight && <span className="text-caption text-muted-foreground">{relative(insight.created_at)}</span>}
            <IconButton
              label={regenerate.isPending ? t('ai:analyzing') : t('ai:overview.regenerate')}
              icon={RefreshCw}
              size="sm"
              tooltip={false}
              disabled={regenerate.isPending}
              onClick={() => {
                regenerate.mutate()
              }}
            />
            <button
              type="button"
              aria-label={t('ai:overview.panel.close')}
              data-dialog-close=""
              onClick={close}
              className="border-control-border inline-flex size-10 items-center justify-center rounded-full border hover:bg-feature-row"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </header>
      )}
      footer={
        insight ? (
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-caption text-muted-foreground">
                {t('ai:overview.panel.basedOn', { count: number(summary.data?.baseline_requests ?? 0) })}
              </p>
              {recommendations.length > 0 && (
                <div role="group" aria-label={t('ai:overview.panel.feedback')} className="flex items-center gap-2">
                  <button type="button" aria-pressed={choice === true} aria-label={t('ai:feedback.useful')} onClick={() => { rate(true) }} className={buttonClass}>
                    <ThumbsUp className="size-4" aria-hidden="true" />
                  </button>
                  <button type="button" aria-pressed={choice === false} aria-label={t('ai:feedback.notUseful')} onClick={() => { rate(false) }} className={buttonClass}>
                    <ThumbsDown className="size-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
            {insight.source === 'ai' && <AIGeneratedLabel />}
          </div>
        ) : undefined
      }
    >
      <Stagger className="flex min-h-0 flex-1 flex-col gap-4">
        {regenerate.isError && <InlineAlert tone="error">{translateError(regenerate.error)}</InlineAlert>}
        <AINotice notice={notice} />
        {insight ? (
          <>
            <StaggerItem className="flex flex-col gap-2">
              <p className="text-greeting line-clamp-3 font-medium" data-testid="overview-headline">
                <Highlighted text={headline} terms={stages} />
              </p>
              <p
                className={`text-caption text-muted-foreground ${expanded ? '' : 'line-clamp-2'}`}
                data-testid="overview-summary"
              >
                {summaryText}
              </p>
              {summaryText.length > LONG_SUMMARY_CHARS && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpanded((value) => !value)
                  }}
                  className="text-caption text-accent self-start rounded-full font-semibold"
                >
                  {expanded ? t('ai:overview.panel.less') : t('ai:overview.panel.more')}
                </button>
              )}
            </StaggerItem>
            <StaggerItem>
              <DueForecast areaId={areaId} />
            </StaggerItem>
            {recommendations.length > 0 && (
              <StaggerItem className="relative min-h-0 flex-1">
                <ol aria-label={t('ai:overview.recommendations')} className="flex h-full flex-col gap-3 overflow-y-auto pb-8">
                  {recommendations.map((_, index) => (
                    <RecommendationCard key={index} insight={insight} index={index} onNavigate={onClose} />
                  ))}
                </ol>
                <div aria-hidden="true" className="from-feature pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t to-transparent" />
              </StaggerItem>
            )}
          </>
        ) : (
          <EmptyState title={t('ai:overview.empty')} />
        )}
      </Stagger>
    </Dialog>
  )
}
