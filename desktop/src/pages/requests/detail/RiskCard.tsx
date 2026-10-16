import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  AIGeneratedLabel,
  AINotice,
  FeedbackButtons,
  InsightMetaLine,
  RiskBadge,
} from '@/components/ai/AIParts'
import { Button } from '@/components/ui/Button'
import { isOneOf, riskTone, useAILanguage, useAIText } from '@/lib/ai/messages'
import { useAnalyzeRequest, useRequestInsight } from '@/lib/api/ai'
import { useTranslateError } from '@/lib/api/errors'
import { REQUEST_PRIORITIES, type RequestInsight, type RiskFactorRead } from '@/lib/api/types'
import { useDurationFormatter, useFormatters } from '@/lib/format'

const BAR_CLASSES = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
} as const

function FactorRow({ factor }: { factor: RiskFactorRead }) {
  const { t } = useTranslation(['ai', 'requests'])
  const { number } = useFormatters()
  const duration = useDurationFormatter()
  const hours = (value: number | string | null) =>
    typeof value === 'number' ? duration(value) : '—'

  let detail: string
  switch (factor.factor) {
    case 'stage_delay':
      detail = t('factorDetail.stage_delay', {
        value: hours(factor.value),
        reference: hours(factor.reference),
        kind: factor.reference_kind ? t(`referenceKind.${factor.reference_kind}`) : '—',
      })
      break
    case 'sla_consumed':
      detail =
        typeof factor.value === 'number'
          ? t('factorDetail.sla_consumed', {
              value: number(factor.value, { style: 'percent', maximumFractionDigits: 0 }),
            })
          : t('factorDetail.noDueDate')
      break
    case 'inactivity':
      detail = t('factorDetail.inactivity', {
        value: hours(factor.value),
        reference: hours(factor.reference),
      })
      break
    case 'priority':
      detail = isOneOf(REQUEST_PRIORITIES, factor.value)
          ? t('factorDetail.priority', {
              priority: t(`requests:priority.${factor.value}`).toLowerCase(),
            })
          : '—'
      break
    case 'assignee_load':
      detail =
        typeof factor.value === 'number'
          ? t('factorDetail.assignee_load', { value: number(factor.value) })
          : t('factorDetail.unassigned')
      break
  }

  return (
    <li className="flex flex-col gap-1" data-factor={factor.factor}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{t(`factors.${factor.factor}`)}</span>
        <span className="text-muted-foreground tabular-nums">
          {t('risk.points', { points: number(factor.points, { maximumFractionDigits: 1 }) })}
        </span>
      </div>
      <div className="bg-surface-muted h-1.5 overflow-hidden rounded-full" aria-hidden="true">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${Math.round(factor.normalized * 100)}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs">{detail}</span>
    </li>
  )
}

function InsightBody({ insight }: { insight: RequestInsight }) {
  const { t } = useTranslation('ai')
  const text = useAIText()
  const { content } = insight

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <InsightMetaLine insight={insight} />
      {insight.source === 'ai' && (
        <p className="text-xs font-medium">{t('risk.aiScore', { score: content.risk_score })}</p>
      )}
      <p className="text-sm whitespace-pre-line" data-testid="insight-summary">
        {text(content.summary)}
      </p>
      {content.causes.length > 0 && (
        <div>
          <h4 className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
            {t('risk.causes')}
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {content.causes.map((cause, index) => (
              <li key={index}>{text(cause)}</li>
            ))}
          </ul>
        </div>
      )}
      {content.actions.length > 0 && (
        <div>
          <h4 className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
            {t('risk.actions')}
          </h4>
          <ul className="flex flex-col gap-2">
            {content.actions.map((action, index) => (
              <li key={index} className="flex items-start justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium">{text(action.title)}</p>
                  <p className="text-muted-foreground">{text(action.detail)}</p>
                </div>
                <FeedbackButtons insight={insight} item={index} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {insight.source === 'ai' && <AIGeneratedLabel />}
    </div>
  )
}

export function RiskCard({ requestId }: { requestId: string }) {
  const { t } = useTranslation('ai')
  const translateError = useTranslateError()
  const language = useAILanguage()
  const insight = useRequestInsight(requestId, language)
  const analyze = useAnalyzeRequest(requestId, language)

  if (insight.isPending) {
    return (
      <section className="bg-surface rounded-xl border p-5 shadow-xs">
        <div className="bg-surface-muted h-16 animate-pulse rounded-md" aria-hidden="true" />
      </section>
    )
  }
  if (insight.isError) {
    return (
      <section className="bg-surface rounded-xl border p-5 text-sm shadow-xs" role="alert">
        {translateError(insight.error)}
      </section>
    )
  }

  const { risk, insight: latest, notice } = insight.data
  const tone = risk ? riskTone(risk.score) : null

  return (
    <section
      aria-label={t('risk.title')}
      className="bg-surface flex flex-col gap-4 rounded-xl border p-5 shadow-xs"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">{t('risk.title')}</h3>
          {risk && (
            <span className="flex items-baseline gap-1.5">
              <RiskBadge score={risk.score} />
              <span className="text-muted-foreground text-xs">{t('risk.outOf')}</span>
            </span>
          )}
        </div>
        {risk && (
          <Button
            onClick={() => {
              analyze.mutate()
            }}
            disabled={analyze.isPending}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {analyze.isPending
              ? t('analyzing')
              : latest
                ? t('risk.reanalyze')
                : t('risk.analyze')}
          </Button>
        )}
      </header>

      {!risk && <p className="text-muted-foreground text-sm">{t('risk.closed')}</p>}

      {risk && tone && (
        <>
          <div className="bg-surface-muted h-2 overflow-hidden rounded-full" aria-hidden="true">
            <div
              className={`h-full rounded-full ${BAR_CLASSES[tone]}`}
              style={{ width: `${risk.score}%` }}
            />
          </div>
          <div>
            <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
              {t('risk.factorsTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              {risk.factors.map((factor) => (
                <FactorRow key={factor.factor} factor={factor} />
              ))}
            </ul>
          </div>
        </>
      )}

      {analyze.isError && (
        <p role="alert" className="text-danger text-xs">
          {translateError(analyze.error)}
        </p>
      )}
      <AINotice notice={analyze.data?.notice ?? notice} />
      {latest ? (
        <InsightBody key={latest.id} insight={latest} />
      ) : (
        risk && <p className="text-muted-foreground text-xs">{t('risk.noInsight')}</p>
      )}
    </section>
  )
}
