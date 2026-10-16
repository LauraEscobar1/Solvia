import { Database, Info, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/components/StatusBadge'
import { riskTone } from '@/lib/ai/messages'
import { useInsightFeedback } from '@/lib/api/ai'
import type { InsightMeta } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'

const RISK_CLASSES = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
} as const

export function RiskBadge({ score }: { score: number | null }) {
  const { t } = useTranslation('ai')
  if (score === null) return <span className="text-muted-foreground">—</span>
  const tone = riskTone(score)
  const level = tone === 'danger' ? 'high' : tone === 'warning' ? 'medium' : 'low'
  return (
    <span
      title={t(`risk.levels.${level}`)}
      data-risk-tone={tone}
      className={`inline-flex min-w-9 justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${RISK_CLASSES[tone]}`}
    >
      {score}
    </span>
  )
}

export function AIGeneratedLabel() {
  const { t } = useTranslation('ai')
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Sparkles className="size-3.5" aria-hidden="true" />
      {t('label')}
    </p>
  )
}

export function AINotice({ notice }: { notice: string | null }) {
  const { i18n } = useTranslation()
  if (!notice) return null
  return (
    <p role="status" className="text-muted-foreground flex items-start gap-1.5 text-xs">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {i18n.t(notice, { ns: 'errors', defaultValue: i18n.t('unknown', { ns: 'errors' }) })}
    </p>
  )
}

export function InsightMetaLine({ insight }: { insight: InsightMeta }) {
  const { t } = useTranslation('ai')
  const { relative, dateTime } = useFormatters()
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
      <StatusBadge tone={insight.source === 'ai' ? 'success' : 'neutral'}>
        {t(`source.${insight.source}`)}
      </StatusBadge>
      <time dateTime={insight.created_at} title={dateTime(insight.created_at)}>
        {t('analyzedAt', { time: relative(insight.created_at) })}
      </time>
      {insight.cached && (
        <span className="inline-flex items-center gap-1">
          <Database className="size-3" aria-hidden="true" />
          {t('cached')}
        </span>
      )}
    </div>
  )
}

export function FeedbackButtons({
  insight,
  item,
}: {
  insight: InsightMeta
  item: number
}) {
  const { t } = useTranslation('ai')
  const feedback = useInsightFeedback()
  const [choice, setChoice] = useState<boolean | undefined>(insight.feedback[String(item)])

  const send = (useful: boolean) => {
    setChoice(useful)
    feedback.mutate({ insightId: insight.id, item, useful })
  }

  return (
    <div role="group" aria-label={t('feedback.label')} className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={choice === true}
        aria-label={t('feedback.useful')}
        title={t('feedback.useful')}
        onClick={() => {
          send(true)
        }}
        className="text-muted-foreground hover:text-success aria-pressed:text-success rounded p-1"
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-pressed={choice === false}
        aria-label={t('feedback.notUseful')}
        title={t('feedback.notUseful')}
        onClick={() => {
          send(false)
        }}
        className="text-muted-foreground hover:text-danger aria-pressed:text-danger rounded p-1"
      >
        <ThumbsDown className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
