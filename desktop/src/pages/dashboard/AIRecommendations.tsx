import { RefreshCw, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  AIGeneratedLabel,
  AINotice,
  FeedbackButtons,
  InsightMetaLine,
} from '@/components/ai/AIParts'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useAILanguage, useAIText } from '@/lib/ai/messages'
import { useAnalyzeOverview, useOverview } from '@/lib/api/ai'
import { useTranslateError } from '@/lib/api/errors'
import type { OverviewInsight, RecommendationTarget } from '@/lib/api/types'
import { requestsPath } from '@/lib/requests/filters'
import { BlockSkeleton } from './DashboardBlock'

const PRIORITY_TONES = { high: 'danger', medium: 'warning', low: 'neutral' } as const

function TargetLink({ target }: { target: RecommendationTarget }) {
  const { t } = useTranslation('ai')
  if (target.request_id) {
    return (
      <Link to={`/requests/${target.request_id}`} className="text-primary text-xs hover:underline">
        {t('overview.viewRequest', { code: target.request_code ?? '' })}
      </Link>
    )
  }
  if (target.area_id) {
    return (
      <Link
        to={requestsPath({
          area_id: target.area_id,
          status: target.status ? [target.status] : [],
        })}
        className="text-primary text-xs hover:underline"
      >
        {t('overview.viewList')}
      </Link>
    )
  }
  return null
}

function OverviewBody({ insight }: { insight: OverviewInsight }) {
  const { t } = useTranslation('ai')
  const text = useAIText()
  const { content } = insight

  return (
    <div className="flex flex-col gap-4">
      <InsightMetaLine insight={insight} />
      <p className="text-sm whitespace-pre-line" data-testid="overview-summary">
        {text(content.summary)}
      </p>
      {content.findings.length > 0 && (
        <div>
          <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
            {t('overview.findings')}
          </h4>
          <ul className="flex flex-col gap-2">
            {content.findings.map((finding, index) => (
              <li key={index} className="flex flex-wrap items-start gap-2 text-sm">
                <StatusBadge tone="neutral">{t(`overview.findingTypes.${finding.type}`)}</StatusBadge>
                <span className="min-w-0 flex-1">{text(finding.evidence)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
          {t('overview.recommendations')}
        </h4>
        {content.recommendations.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('overview.noRecommendations')}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {content.recommendations.map((recommendation, index) => (
              <li key={index} className="flex flex-col gap-1 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <StatusBadge tone={PRIORITY_TONES[recommendation.priority]}>
                      {t(`overview.priority.${recommendation.priority}`)}
                    </StatusBadge>
                    {text(recommendation.title)}
                  </span>
                  <FeedbackButtons insight={insight} item={index} />
                </div>
                <p className="text-muted-foreground text-sm">{text(recommendation.detail)}</p>
                {recommendation.target && <TargetLink target={recommendation.target} />}
              </li>
            ))}
          </ol>
        )}
      </div>
      {insight.source === 'ai' && <AIGeneratedLabel />}
    </div>
  )
}

export function AIRecommendations({ areaId, canRegenerate }: { areaId?: string; canRegenerate: boolean }) {
  const { t } = useTranslation('ai')
  const translateError = useTranslateError()
  const language = useAILanguage()
  const overview = useOverview(areaId, language, true)
  const regenerate = useAnalyzeOverview(areaId, language)
  const insight = overview.data?.insight ?? null

  return (
    <section
      aria-label={t('overview.title')}
      className="bg-surface flex flex-col gap-4 rounded-xl border p-5 shadow-xs"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="text-primary size-4" aria-hidden="true" />
          {t('overview.title')}
        </h3>
        {canRegenerate && (
          <Button
            onClick={() => {
              regenerate.mutate()
            }}
            disabled={regenerate.isPending}
          >
            <RefreshCw
              className={`size-4 ${regenerate.isPending ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {regenerate.isPending ? t('analyzing') : t('overview.regenerate')}
          </Button>
        )}
      </header>
      {regenerate.isPending && (
        <p role="status" className="text-muted-foreground text-xs">
          {t('analyzing')}
        </p>
      )}
      {regenerate.isError && (
        <p role="alert" className="text-danger text-xs">
          {translateError(regenerate.error)}
        </p>
      )}
      {overview.isPending ? (
        <BlockSkeleton rows={4} />
      ) : overview.isError ? (
        <p role="alert" className="text-danger text-sm">
          {translateError(overview.error)}
        </p>
      ) : (
        <>
          <AINotice notice={regenerate.data?.notice ?? overview.data.notice} />
          {insight ? (
            <OverviewBody key={insight.id} insight={insight} />
          ) : (
            <p className="text-muted-foreground text-sm">{t('overview.empty')}</p>
          )}
        </>
      )}
    </section>
  )
}
