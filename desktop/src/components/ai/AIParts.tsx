import { Database, Info, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiskPill } from '@/components/requests/RequestPills'
import { Pill } from '@/components/ui/Pill'
import { useInsightFeedback } from '@/lib/api/ai'
import type { InsightMeta } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'

export function RiskBadge({ score }: { score: number | null }) {
  return <RiskPill score={score} />
}

export function AIGeneratedLabel() {
  const { t } = useTranslation('ai')
  return (
    <p className="text-caption text-muted-foreground flex items-center gap-1.5 font-medium">
      <Sparkles className="size-3.5" aria-hidden="true" />
      {t('label')}
    </p>
  )
}

export function AINotice({ notice }: { notice: string | null }) {
  const { i18n } = useTranslation()
  if (!notice) return null
  return (
    <p role="status" className="text-caption text-muted-foreground flex items-start gap-1.5">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {i18n.t(notice, { ns: 'errors', defaultValue: i18n.t('unknown', { ns: 'errors' }) })}
    </p>
  )
}

export function InsightMetaLine({ insight }: { insight: InsightMeta }) {
  const { t } = useTranslation('ai')
  const { relative, dateTime } = useFormatters()
  return (
    <div className="text-caption text-muted-foreground flex flex-wrap items-center gap-2">
      <Pill tone={insight.source === 'ai' ? 'accent-soft' : 'neutral'}>{t(`source.${insight.source}`)}</Pill>
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

const FEEDBACK_BUTTON =
  'text-muted-foreground inline-flex size-7 items-center justify-center rounded-full transition-colors hover:bg-surface-sunken'

export function FeedbackButtons({ insight, item }: { insight: InsightMeta; item: number }) {
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
        className={`${FEEDBACK_BUTTON} aria-pressed:bg-accent-soft aria-pressed:text-accent-text`}
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
        className={`${FEEDBACK_BUTTON} aria-pressed:bg-danger-soft aria-pressed:text-danger-soft-foreground`}
      >
        <ThumbsDown className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
