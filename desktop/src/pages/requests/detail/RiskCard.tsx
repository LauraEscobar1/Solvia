import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AIGeneratedLabel, AINotice, FeedbackButtons, InsightMetaLine } from '@/components/ai/AIParts'
import { ReassignButton } from '@/components/requests/ReassignButton'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { RiskMeter } from '@/components/ui/Progress'
import { ErrorState, InlineAlert, SkeletonRows } from '@/components/ui/States'
import { isOneOf, useAILanguage, useAIText } from '@/lib/ai/messages'
import { useAnalyzeRequest, useRequestInsight } from '@/lib/api/ai'
import { useTranslateError } from '@/lib/api/errors'
import { useAssignmentSuggestion } from '@/lib/api/requests'
import { REQUEST_PRIORITIES, type RequestDetail, type RequestInsight, type RiskFactorRead } from '@/lib/api/types'
import { useDurationFormatter, useFormatters, useLongDuration } from '@/lib/format'
import { riskLevel, type RiskLevel } from '@/lib/requests/tones'

const LEVEL_PILLS: Record<RiskLevel, string> = {
  high: 'bg-danger-strong text-ink',
  medium: 'bg-warning-soft text-warning-soft-foreground',
  low: 'bg-slate-pill text-ink',
}

function FactorRow({ factor }: { factor: RiskFactorRead }) {
  const { t } = useTranslation(['ai', 'requests'])
  const { number } = useFormatters()
  const duration = useDurationFormatter()
  const hours = (value: number | string | null) => (typeof value === 'number' ? duration(value) : '—')

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
          ? t('factorDetail.sla_consumed', { value: number(factor.value, { style: 'percent', maximumFractionDigits: 0 }) })
          : t('factorDetail.noDueDate')
      break
    case 'inactivity':
      detail = t('factorDetail.inactivity', { value: hours(factor.value), reference: hours(factor.reference) })
      break
    case 'priority':
      detail = isOneOf(REQUEST_PRIORITIES, factor.value)
        ? t('factorDetail.priority', { priority: t(`requests:priority.${factor.value}`).toLowerCase() })
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
    <li className="flex flex-col gap-1.5" data-factor={factor.factor}>
      <div className="text-caption flex items-center justify-between gap-2">
        <span className="font-semibold">{t(`factors.${factor.factor}`)}</span>
        <span className="text-muted-foreground tabular-nums">
          {t('risk.points', { points: number(factor.points, { maximumFractionDigits: 1 }) })}
        </span>
      </div>
      <div className="bg-risk-track h-1.5 overflow-hidden rounded-full" aria-hidden="true">
        <div className="bg-accent h-full rounded-full" style={{ width: `${Math.round(factor.normalized * 100)}%` }} />
      </div>
      <span className="text-caption text-muted-foreground">{detail}</span>
    </li>
  )
}

function InsightBody({ insight }: { insight: RequestInsight }) {
  const { t } = useTranslation('ai')
  const text = useAIText()
  const { content } = insight

  return (
    <div className="flex flex-col gap-3">
      <InsightMetaLine insight={insight} />
      {insight.source === 'ai' && (
        <p className="text-caption font-semibold">{t('risk.aiScore', { score: content.risk_score })}</p>
      )}
      <p className="text-body whitespace-pre-line" data-testid="insight-summary">
        {text(content.summary)}
      </p>
      {content.causes.length > 0 && (
        <div>
          <h4 className="text-caption text-muted-foreground mb-1 font-semibold">{t('risk.causes')}</h4>
          <ul className="text-body list-disc space-y-1 pl-4">
            {content.causes.map((cause, index) => (
              <li key={index}>{text(cause)}</li>
            ))}
          </ul>
        </div>
      )}
      {content.actions.length > 0 && (
        <div>
          <h4 className="text-caption text-muted-foreground mb-1 font-semibold">{t('risk.actions')}</h4>
          <ul className="flex flex-col gap-2">
            {content.actions.map((action, index) => (
              <li key={index} className="text-body flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{text(action.title)}</p>
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

function factorOf(factors: RiskFactorRead[], key: RiskFactorRead['factor']) {
  return factors.find((item) => item.factor === key)
}

export function RiskCard({ detail }: { detail: RequestDetail }) {
  const { t } = useTranslation(['ai', 'dashboard', 'requests', 'common'])
  const translateError = useTranslateError()
  const { number } = useFormatters()
  const duration = useLongDuration()
  const language = useAILanguage()
  const titleId = useId()
  const breakdownId = useId()
  const insight = useRequestInsight(detail.id, language)
  const analyze = useAnalyzeRequest(detail.id, language)
  const suggestion = useAssignmentSuggestion(detail.id)
  const proposal = suggestion.data?.suggestion ?? null
  const [showBreakdown, setShowBreakdown] = useState(false)

  const risk = insight.data?.risk ?? null
  const latest = analyze.data?.insight ?? insight.data?.insight ?? null
  const notice = analyze.data?.notice ?? insight.data?.notice ?? null
  const level = risk ? riskLevel(risk.score) : null
  const stage = risk ? factorOf(risk.factors, 'stage_delay') : undefined
  const load = risk ? factorOf(risk.factors, 'assignee_load') : undefined

  const facts = [
    {
      value: typeof stage?.value === 'number' ? duration(stage.value) : t('common:noValue'),
      label: t('dashboard:risk.inStage', { stage: t(`requests:status.${detail.status}`) }),
    },
    {
      value: stage?.reference != null ? duration(stage.reference) : t('common:noValue'),
      label: t('dashboard:risk.reference', {
        kind: stage?.reference_kind ? t(`referenceKind.${stage.reference_kind}`) : t('common:noValue'),
      }),
    },
    {
      value: typeof load?.value === 'number' ? number(load.value) : t('common:noValue'),
      label: detail.assignee ? t('dashboard:risk.assigneeLoad') : t('dashboard:risk.noAssignee'),
    },
  ]

  return (
    <Card variant="feature" as="section" aria-labelledby={titleId} className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-heading flex items-center gap-2">
          <span aria-hidden="true" className="bg-accent size-2 rounded-full" />
          {t('risk.cardTitle')}
        </h2>
        {risk && level && (
          <span className={`text-caption inline-flex h-7 items-center rounded-full px-3 font-semibold ${LEVEL_PILLS[level]}`}>
            {t('risk.levelScore', { level: t(`risk.levels.${level}`), score: risk.score })}
          </span>
        )}
      </header>

      {insight.isPending ? (
        <SkeletonRows rows={3} />
      ) : insight.isError ? (
        <ErrorState compact error={insight.error} onRetry={() => void insight.refetch()} />
      ) : !risk ? (
        <p className="text-body text-muted-foreground">{t('risk.closed')}</p>
      ) : (
        <>
          <RiskMeter value={risk.score} label={t('risk.scoreTitle', { score: risk.score })} />
          <ul className="flex flex-col gap-2.5">
            {facts.map((fact) => (
              <li key={fact.label} className="text-body flex items-baseline gap-4">
                <span className="text-accent w-20 shrink-0 font-semibold tabular-nums">{fact.value}</span>
                <span className="text-muted-foreground">{fact.label}</span>
              </li>
            ))}
          </ul>
          {proposal && (
            <div className="border-accent-line/50 rounded-inner flex flex-wrap items-center justify-between gap-3 border px-4 py-3">
              <p className="text-body">
                <strong className="text-accent font-semibold">{t('dashboard:risk.suggestion')}:</strong>{' '}
                {t('dashboard:risk.suggestionText', { name: proposal.assignee.full_name, count: proposal.open_count })}
              </p>
              {detail.permissions.can_assign && (
                <ReassignButton requestId={detail.id} code={detail.code} version={detail.version} suggestion={proposal} size="sm" />
              )}
            </div>
          )}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              aria-expanded={showBreakdown}
              aria-controls={breakdownId}
              onClick={() => {
                setShowBreakdown((value) => !value)
              }}
              className="text-body inline-flex items-center gap-1.5 self-start rounded-full font-semibold"
            >
              {showBreakdown ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
              {t('risk.breakdown')}
            </button>
            <ul id={breakdownId} hidden={!showBreakdown} className="flex flex-col gap-3">
              {risk.factors.map((factor) => (
                <FactorRow key={factor.factor} factor={factor} />
              ))}
            </ul>
          </div>
        </>
      )}

      {risk && (
        <div className="border-divider flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-body font-semibold">{t('risk.aiTitle')}</h3>
            <Button
              variant="accent"
              size="sm"
              loading={analyze.isPending}
              onClick={() => {
                analyze.mutate()
              }}
            >
              {!analyze.isPending && <Sparkles className="size-4" aria-hidden="true" />}
              {analyze.isPending ? t('analyzing') : latest ? t('risk.reanalyze') : t('risk.analyze')}
            </Button>
          </div>
          {analyze.isError && <InlineAlert tone="error">{translateError(analyze.error)}</InlineAlert>}
          <AINotice notice={notice} />
          {latest ? (
            <InsightBody key={latest.id} insight={latest} />
          ) : (
            <p className="text-caption text-muted-foreground">{t('risk.noInsight')}</p>
          )}
        </div>
      )}
    </Card>
  )
}
