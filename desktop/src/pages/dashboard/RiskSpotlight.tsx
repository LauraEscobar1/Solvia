import { ArrowRight, ShieldCheck } from 'lucide-react'
import { type KeyboardEvent, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Avatar, EmptyAvatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useAILanguage } from '@/lib/ai/messages'
import { useRequestInsight } from '@/lib/api/ai'
import { useTranslateError } from '@/lib/api/errors'
import { useAssignmentSuggestion, useRequest, useRequestActions, useRequests } from '@/lib/api/requests'
import { type RequestSummary, type RiskFactorRead, SLA_STAGES } from '@/lib/api/types'
import { moveFocus } from '@/lib/focus'
import { useFormatters, useLongDuration } from '@/lib/format'
import { riskLevel, MEDIUM_RISK } from '@/lib/requests/tones'
import { useDueLabel } from '@/lib/requests/useDueLabel'

const SPOTLIGHT_SIZE = 5
const RISK_LIST_PATH = '/requests?sort=-risk_score'

const LEVEL_PILL = {
  high: 'border-risk-high-on-feature text-risk-high-on-feature',
  medium: 'border-risk-medium-on-feature text-risk-medium-on-feature',
  low: 'border-feature-muted text-feature-muted',
} as const

function RiskTab({
  request,
  selected,
  panelId,
  tabId,
  onSelect,
}: {
  request: RequestSummary
  selected: boolean
  panelId: string
  tabId: string
  onSelect: () => void
}) {
  const { t } = useTranslation('ai')
  const { label } = useDueLabel(request)
  const score = request.risk_score ?? 0
  const level = riskLevel(score)

  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={[
        'rounded-inner flex w-full items-center gap-3 px-3 py-3 text-left transition-colors',
        selected ? 'bg-slate text-slate-foreground on-slate' : 'bg-feature-row hover:bg-feature-row/70',
      ].join(' ')}
    >
      {request.assignee ? <Avatar name={request.assignee.full_name} id={request.assignee.id} size="md" /> : <EmptyAvatar size="md" />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-semibold">{request.code}</span>
        <span className={`text-caption truncate ${selected ? 'text-slate-foreground' : 'text-feature-muted'}`}>{label}</span>
      </span>
      <span
        className={[
          'text-caption inline-flex h-7 items-center rounded-full border px-3 font-semibold',
          selected ? 'bg-slate-pill text-ink border-transparent' : LEVEL_PILL[level],
        ].join(' ')}
      >
        {t(`risk.levels.${level}`)}
      </span>
      <span className="text-heading w-9 text-right tabular-nums">{score}</span>
    </button>
  )
}

function factor(factors: RiskFactorRead[] | undefined, key: RiskFactorRead['factor']) {
  return factors?.find((item) => item.factor === key)
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-slate-soft/70 rounded-inner flex min-h-24 flex-col gap-1 border border-card-edge px-4 py-3">
      <span className="text-heading">{value}</span>
      <span className="text-caption font-semibold">{label}</span>
    </div>
  )
}

function RiskDetail({ request }: { request: RequestSummary }) {
  const { t } = useTranslation(['dashboard', 'ai', 'requests', 'common'])
  const translateError = useTranslateError()
  const { number } = useFormatters()
  const duration = useLongDuration()
  const language = useAILanguage()
  const insight = useRequestInsight(request.id, language)
  const suggestion = useAssignmentSuggestion(request.id)
  const proposal = suggestion.data?.suggestion ?? null
  const detail = useRequest(request.id)
  const actions = useRequestActions(request.id)
  const [confirming, setConfirming] = useState(false)

  const factors = insight.data?.risk?.factors
  const stage = factor(factors, 'stage_delay')
  const load = factor(factors, 'assignee_load')
  const stageName = t(`requests:status.${request.status}`)

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-caption font-semibold">{t('risk.detail')}</span>
          <span className="text-title-detail">{request.code}</span>
          <span className="text-body font-semibold">{request.title}</span>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-caption font-semibold">{t('risk.assignee')}</span>
          {request.assignee ? (
            <span className="flex items-center gap-2">
              <Avatar name={request.assignee.full_name} id={request.assignee.id} />
              <span className="flex flex-col leading-tight">
                <span className="text-body font-semibold">{request.assignee.full_name}</span>
                <span className="text-caption">{request.area.name}</span>
              </span>
            </span>
          ) : (
            <span className="text-body font-semibold">{t('risk.unassigned')}</span>
          )}
        </div>
      </div>

      {insight.isPending ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : insight.isError ? (
        <ErrorState compact error={insight.error} onRetry={() => void insight.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile
            value={typeof stage?.value === 'number' ? duration(stage.value) : t('common:noValue')}
            label={t('risk.inStage', { stage: stageName })}
          />
          <Tile
            value={stage?.reference != null ? duration(stage.reference) : t('common:noValue')}
            label={t('risk.reference', {
              kind: stage?.reference_kind ? t(`ai:referenceKind.${stage.reference_kind}`) : t('common:noValue'),
            })}
          />
          <Tile
            value={typeof load?.value === 'number' ? number(load.value) : t('common:noValue')}
            label={request.assignee ? t('risk.assigneeLoad') : t('risk.noAssignee')}
          />
        </div>
      )}

      <div className="bg-slate-soft rounded-inner mt-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col">
          {proposal ? (
            <>
              <span className="text-caption font-semibold">{t('risk.suggestion')}</span>
              <span className="text-body font-semibold">
                {t('risk.suggestionText', { name: proposal.assignee.full_name, count: proposal.open_count })}
              </span>
            </>
          ) : (
            <span className="text-body font-semibold">{t('risk.noSuggestion')}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/requests/${request.id}`} className={buttonClasses('accent', 'md')}>
            {t('risk.open')}
          </Link>
          {proposal && detail.data?.permissions.can_assign && (
            <Button
              variant="accent"
              onClick={() => {
                actions.assign.reset()
                setConfirming(true)
              }}
            >
              {t('risk.reassignNow')}
            </Button>
          )}
        </div>
      </div>

      {confirming && proposal && detail.data && (
        <ConfirmDialog
          title={t('risk.confirmTitle', { code: request.code })}
          message={t('risk.confirmMessage', {
            code: request.code,
            name: proposal.assignee.full_name,
            count: proposal.open_count,
          })}
          confirmLabel={t('risk.confirm')}
          variant="solid"
          pending={actions.assign.isPending}
          error={actions.assign.error ? translateError(actions.assign.error) : null}
          onCancel={() => {
            setConfirming(false)
          }}
          onConfirm={() => {
            actions.assign.mutate(
              { assignee_id: proposal.assignee.id, version: detail.data.version },
              {
                onSuccess: () => {
                  setConfirming(false)
                },
              },
            )
          }}
        />
      )}
    </div>
  )
}

export function RiskSpotlight({ areaId }: { areaId?: string }) {
  const { t } = useTranslation('dashboard')
  const listId = useId()
  const tabs = useRef<HTMLDivElement>(null)
  const requests = useRequests({
    status: [...SLA_STAGES],
    priority: [],
    area_id: areaId,
    page: 1,
    size: SPOTLIGHT_SIZE,
    sort: '-risk_score',
  })
  const items = (requests.data?.items ?? []).filter((item) => (item.risk_score ?? 0) >= MEDIUM_RISK)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = items.find((item) => item.id === selectedId) ?? items[0]

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(tabs.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
    if (!moveFocus(buttons, document.activeElement, event.key)) return
    event.preventDefault()
    const focused = document.activeElement
    const match = items.find((item) => focused instanceof HTMLElement && focused.id === `${listId}-tab-${item.id}`)
    if (match) setSelectedId(match.id)
  }

  return (
    <Card variant="feature" as="section" aria-labelledby={`${listId}-title`} padding="none" className="p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 px-2">
            <h2 id={`${listId}-title`} className="text-heading">
              {t('risk.title')}
            </h2>
            <Link to={RISK_LIST_PATH} className="text-caption text-accent inline-flex items-center gap-1 rounded-full font-semibold hover:underline">
              {t('risk.viewAll')}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
          {requests.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="bg-feature-row h-16" />
              ))}
            </div>
          ) : requests.isError ? (
            <ErrorState compact error={requests.error} onRetry={() => void requests.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon={ShieldCheck} title={t('risk.empty')} />
          ) : (
            <div
              ref={tabs}
              role="tablist"
              aria-label={t('risk.listLabel')}
              aria-orientation="vertical"
              onKeyDown={onKeyDown}
              className="flex flex-col gap-2"
            >
              {items.map((item) => (
                <RiskTab
                  key={item.id}
                  request={item}
                  selected={item.id === selected?.id}
                  tabId={`${listId}-tab-${item.id}`}
                  panelId={`${listId}-panel`}
                  onSelect={() => {
                    setSelectedId(item.id)
                  }}
                />
              ))}
            </div>
          )}
        </div>
        {selected && (
          <div
            role="tabpanel"
            id={`${listId}-panel`}
            aria-labelledby={`${listId}-tab-${selected.id}`}
            className="bg-slate text-slate-foreground rounded-card on-slate p-6"
          >
            <RiskDetail key={selected.id} request={selected} />
          </div>
        )}
      </div>
    </Card>
  )
}
