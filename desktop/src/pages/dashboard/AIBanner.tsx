import { ArrowRight, Pause, Play, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AINotice } from '@/components/ai/AIParts'
import { OverviewContent } from '@/components/ai/OverviewContent'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, InlineAlert, Skeleton } from '@/components/ui/States'
import { useAILanguage, useAIText } from '@/lib/ai/messages'
import { useAnalyzeOverview, useOverview } from '@/lib/api/ai'
import { useTranslateError } from '@/lib/api/errors'
import { useFormatters } from '@/lib/format'
import { useReducedMotion } from '@/lib/useReducedMotion'

const ROTATION_MS = 7000

export function AIBanner({ areaId }: { areaId?: string }) {
  const { t } = useTranslation('ai')
  const text = useAIText()
  const translateError = useTranslateError()
  const { relative } = useFormatters()
  const language = useAILanguage()
  const reducedMotion = useReducedMotion()
  const overview = useOverview(areaId, language, true)
  const regenerate = useAnalyzeOverview(areaId, language)
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)

  const insight = regenerate.data?.insight ?? overview.data?.insight ?? null
  const notice = regenerate.data?.notice ?? overview.data?.notice ?? null
  const slides = insight
    ? [text(insight.content.summary), ...insight.content.findings.map((finding) => text(finding.evidence))]
    : []
  const current = slides.length > 0 ? index % slides.length : 0
  const rotating = slides.length > 1 && !paused && !hovered && !reducedMotion
  const recommendations = insight?.content.recommendations.length ?? 0

  useEffect(() => {
    if (!rotating) return
    const timer = setInterval(() => {
      setIndex((value) => value + 1)
    }, ROTATION_MS)
    return () => {
      clearInterval(timer)
    }
  }, [rotating])

  const status = regenerate.isPending
    ? t('banner.analyzing')
    : insight
      ? t('banner.updated', { time: relative(insight.created_at) })
      : t('banner.none')

  return (
    <section
      aria-label={t('overview.title')}
      onMouseEnter={() => {
        setHovered(true)
      }}
      onMouseLeave={() => {
        setHovered(false)
      }}
      className="glass border-accent shadow-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-feature border-2 py-2 pr-2 pl-2 lg:flex-nowrap lg:rounded-full"
    >
      <div className="flex shrink-0 items-center gap-3">
        <span className="bg-accent text-accent-foreground inline-flex size-10 items-center justify-center rounded-full">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-body font-semibold">{t('banner.title')}</span>
          <span className="text-caption text-muted-foreground inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-accent-line size-1.5 rounded-full" />
            {status}
          </span>
        </span>
      </div>
      <span aria-hidden="true" className="bg-divider hidden h-8 w-px lg:block" />
      <div className="min-w-0 flex-1">
        {overview.isPending ? (
          <Skeleton className="h-5 max-w-xl" />
        ) : slides.length > 0 ? (
          <p className="text-body line-clamp-2" data-testid="ai-banner-text">
            {slides[current]}
          </p>
        ) : notice ? (
          <AINotice notice={notice} />
        ) : (
          <p className="text-body text-muted-foreground">{t('overview.empty')}</p>
        )}
      </div>
      {slides.length > 1 && (
        <div className="flex shrink-0 items-center">
          <IconButton
            label={paused ? t('banner.play') : t('banner.pause')}
            icon={paused ? Play : Pause}
            size="sm"
            tooltip={false}
            onClick={() => {
              setPaused((value) => !value)
            }}
          />
          <div role="group" aria-label={t('banner.slides')} className="flex items-center">
            {slides.map((_, slide) => (
              <button
                key={slide}
                type="button"
                aria-label={t('banner.slide', { index: slide + 1, total: slides.length })}
                aria-current={slide === current}
                onClick={() => {
                  setIndex(slide)
                  setPaused(true)
                }}
                className="inline-flex size-6 items-center justify-center rounded-full"
              >
                <span
                  aria-hidden="true"
                  className={`h-2 rounded-full transition-all ${slide === current ? 'bg-accent w-5' : 'bg-control-border w-2'}`}
                />
              </button>
            ))}
          </div>
        </div>
      )}
      <Button
        variant="solid"
        className="shrink-0"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('banner.view', { count: recommendations })}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>

      {open && (
        <Dialog
          title={t('overview.title')}
          variant="sheet"
          onClose={() => {
            setOpen(false)
          }}
          footer={
            <Button
              loading={regenerate.isPending}
              onClick={() => {
                regenerate.mutate()
              }}
            >
              {!regenerate.isPending && <RefreshCw className="size-4" aria-hidden="true" />}
              {regenerate.isPending ? t('analyzing') : t('overview.regenerate')}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            {regenerate.isError && <InlineAlert tone="error">{translateError(regenerate.error)}</InlineAlert>}
            <AINotice notice={notice} />
            {insight ? (
              <OverviewContent
                key={insight.id}
                insight={insight}
                onNavigate={() => {
                  setOpen(false)
                }}
              />
            ) : (
              <EmptyState icon={Sparkles} title={t('overview.empty')} />
            )}
          </div>
        </Dialog>
      )}
    </section>
  )
}
