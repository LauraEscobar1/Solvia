import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Pill, type PillTone } from '@/components/ui/Pill'
import { useAIText } from '@/lib/ai/messages'
import type { OverviewInsight, RecommendationTarget } from '@/lib/api/types'
import { requestsPath } from '@/lib/requests/filters'
import { AIGeneratedLabel, FeedbackButtons, InsightMetaLine } from './AIParts'

const PRIORITY_TONES: Record<'high' | 'medium' | 'low', PillTone> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

function TargetLink({ target, onNavigate }: { target: RecommendationTarget; onNavigate?: () => void }) {
  const { t } = useTranslation('ai')
  const className = 'text-caption text-accent-text inline-flex items-center gap-1 font-semibold hover:underline'
  if (target.request_id) {
    return (
      <Link to={`/requests/${target.request_id}`} className={className} onClick={onNavigate}>
        {t('overview.viewRequest', { code: target.request_code ?? '' })}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    )
  }
  if (target.area_id) {
    return (
      <Link
        to={requestsPath({ area_id: target.area_id, status: target.status ? [target.status] : [] })}
        className={className}
        onClick={onNavigate}
      >
        {t('overview.viewList')}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    )
  }
  return null
}

export function OverviewContent({ insight, onNavigate }: { insight: OverviewInsight; onNavigate?: () => void }) {
  const { t } = useTranslation('ai')
  const text = useAIText()
  const { content } = insight

  return (
    <div className="flex flex-col gap-5">
      <InsightMetaLine insight={insight} />
      <p className="text-body whitespace-pre-line" data-testid="overview-summary">
        {text(content.summary)}
      </p>
      {content.findings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-caption text-muted-foreground font-semibold">{t('overview.findings')}</h3>
          <ul className="flex flex-col gap-2">
            {content.findings.map((finding, index) => (
              <li key={index} className="text-body flex flex-wrap items-start gap-2">
                <Pill tone="neutral">{t(`overview.findingTypes.${finding.type}`)}</Pill>
                <span className="min-w-0 flex-1">{text(finding.evidence)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-caption text-muted-foreground font-semibold">{t('overview.recommendations')}</h3>
        {content.recommendations.length === 0 ? (
          <p className="text-body text-muted-foreground">{t('overview.noRecommendations')}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {content.recommendations.map((recommendation, index) => (
              <li key={index} className="bg-surface-raised rounded-inner flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="text-body flex flex-wrap items-center gap-2 font-semibold">
                    <Pill tone={PRIORITY_TONES[recommendation.priority]}>
                      {t(`overview.priority.${recommendation.priority}`)}
                    </Pill>
                    {text(recommendation.title)}
                  </span>
                  <FeedbackButtons insight={insight} item={index} />
                </div>
                <p className="text-body text-muted-foreground">{text(recommendation.detail)}</p>
                {recommendation.target && <TargetLink target={recommendation.target} onNavigate={onNavigate} />}
              </li>
            ))}
          </ol>
        )}
      </section>
      {insight.source === 'ai' && <AIGeneratedLabel />}
    </div>
  )
}
