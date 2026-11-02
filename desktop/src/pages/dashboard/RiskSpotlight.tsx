import { ArrowRight, ChartColumn, Clock, type LucideIcon, ShieldCheck, User } from 'lucide-react'
import { motion, type Transition } from 'motion/react'
import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { CountUp, Grow } from '@/components/motion/Motion'
import { SPRING } from '@/components/motion/transitions'
import { ReassignButton } from '@/components/requests/ReassignButton'
import { Avatar, EmptyAvatar } from '@/components/ui/Avatar'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useAILanguage } from '@/lib/ai/messages'
import { useRequestInsight } from '@/lib/api/ai'
import { useAssignmentSuggestion, useRequest, useRequestStages, useRequests } from '@/lib/api/requests'
import { type RequestSummary, type RiskFactorRead, SLA_STAGES } from '@/lib/api/types'
import { moveFocus } from '@/lib/focus'
import { useDurationParts, useFormatters } from '@/lib/format'
import { riskLevel, MEDIUM_RISK, STAGE_ORDER } from '@/lib/requests/tones'
import { useDueLabel } from '@/lib/requests/useDueLabel'
import { useReducedMotion } from '@/lib/useReducedMotion'

const SPOTLIGHT_SIZE = 10
const RISK_LIST_PATH = '/requests?sort=-risk_score'

const EASE = [0.22, 1, 0.36, 1] as const
const ROW_STAGGER_SECONDS = 0.07
const ROW_STAGGER_LIMIT = 6
const ROW_SETTLE_MS = 900
const ROW_ENTER: Transition = { duration: 0.45, ease: EASE }
const TILE_STAGGER_SECONDS = 0.1
const BAR_DELAY_SECONDS = 0.28
const TICK_DELAY_SECONDS = 0.95
const PILL_DELAY_SECONDS = 0.38
const POP: Transition = { type: 'spring', stiffness: 520, damping: 14 }
const SWAP: Transition = { duration: 0.4, ease: EASE }
const SEGMENT_SECONDS = 0.3
const TIME_FADE_SECONDS = 0.3

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
  index,
  settled,
  root,
  onSelect,
}: {
  request: RequestSummary
  selected: boolean
  panelId: string
  tabId: string
  index: number
  settled: boolean
  root: RefObject<HTMLDivElement | null>
  onSelect: () => void
}) {
  const { t } = useTranslation('ai')
  const reduced = useReducedMotion()
  const { label } = useDueLabel(request)
  const score = request.risk_score ?? 0
  const level = riskLevel(score)
  const delay = !settled && index < ROW_STAGGER_LIMIT ? index * ROW_STAGGER_SECONDS : 0
  const reveal = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 18, scale: 0.97 },
        whileInView: { opacity: 1, y: 0, scale: 1 },
        viewport: { root, amount: 0.08 },
        transition: { ...ROW_ENTER, delay },
      }

  return (
    <motion.button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      {...reveal}
      className={[
        'rounded-inner flex w-full shrink-0 items-center gap-3 px-3 py-3 text-left transition-[background-color,border-color,box-shadow,translate] duration-250 motion-safe:hover:-translate-y-0.5',
        selected
          ? 'bg-risk-panel-row-selected border-accent border-[1.5px] shadow-[0_0_0_4px_rgb(215_245_59/0.12)]'
          : 'bg-risk-panel-row border-risk-panel-row-edge hover:bg-risk-panel-row-hover border',
      ].join(' ')}
    >
      {request.assignee ? <Avatar name={request.assignee.full_name} id={request.assignee.id} size="md" /> : <EmptyAvatar size="md" />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-semibold">{request.code}</span>
        <span className="text-caption text-feature-muted truncate">{label}</span>
      </span>
      <span
        className={[
          'text-caption inline-flex h-7 items-center rounded-full border px-3 font-semibold transition-colors',
          selected ? 'bg-accent text-ink border-accent' : LEVEL_PILL[level],
        ].join(' ')}
      >
        {t(`risk.levels.${level}`)}
      </span>
      <span className="text-heading w-9 text-right tabular-nums">{score}</span>
    </motion.button>
  )
}

function factor(factors: RiskFactorRead[] | undefined, key: RiskFactorRead['factor']) {
  return factors?.find((item) => item.factor === key)
}

const LOAD_REFERENCE = 10
const CRITICAL_MULTIPLE = 2
const MULTIPLE_FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 1 }

interface TileProps {
  icon: LucideIcon
  index: number
  amount: number | null
  unit?: string
  label: string
  note: string
  measured: number | null
  reference: number | null
}

function Tile({ icon: Icon, index, amount, unit, label, note, measured, reference }: TileProps) {
  const { t } = useTranslation(['dashboard', 'common'])
  const { number } = useFormatters()
  const reduced = useReducedMotion()
  const ratio = measured !== null && reference !== null && reference > 0 ? measured / reference : null
  const exceeded = ratio !== null && ratio > 1
  const critical = ratio !== null && ratio >= CRITICAL_MULTIPLE
  const multiple = ratio === null ? '' : number(ratio, MULTIPLE_FORMAT)
  const tick = ratio === null ? null : ratio > 1 ? 100 / ratio : 100
  const lag = index * TILE_STAGGER_SECONDS

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={reduced ? undefined : { y: -4 }}
      transition={{ ...SPRING, delay: lag }}
      className="risk-tile rounded-tile text-slate-foreground flex min-h-32 flex-col px-3.5 pt-3 pb-3.5"
    >
      <div className="flex h-6 items-center justify-between gap-2">
        <span className="bg-risk-tile-icon text-risk-tile-ink grid size-6.5 place-items-center rounded-lg">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {exceeded && (
          <motion.span
            initial={reduced ? false : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...POP, delay: PILL_DELAY_SECONDS + lag }}
            className={`text-micro inline-flex h-5 items-center rounded-full px-2 tabular-nums ${
              critical ? 'bg-danger-soft text-danger-soft-foreground' : 'bg-warning-soft text-warning-soft-foreground'
            }`}
          >
            <span aria-hidden="true">{`${multiple}×`}</span>
            <span className="sr-only">{t('risk.tileMultiple', { value: multiple })}</span>
          </motion.span>
        )}
      </div>
      <p className="mt-1.5 text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
        {amount === null ? t('common:noValue') : <CountUp value={amount} format={(value) => number(value)} />}
        {unit && <span className="text-caption ml-1 font-medium">{unit}</span>}
      </p>
      <p className="mt-0.5 truncate text-[0.78rem] font-semibold">{label}</p>
      <p className="text-risk-tile-reference mb-2.5 truncate text-[0.72rem]">{note}</p>
      {ratio !== null && tick !== null && (
        <div aria-hidden="true" className="bg-risk-tile-track relative mt-auto h-1.25 rounded-full">
          <div className="h-full overflow-hidden rounded-full" style={{ width: `${Math.min(1, ratio) * 100}%` }}>
            <Grow
              delay={BAR_DELAY_SECONDS + lag}
              className={`h-full rounded-full ${critical ? 'bg-danger' : exceeded ? 'bg-warning' : 'bg-slate-foreground'}`}
            />
          </div>
          <motion.span
            className="bg-risk-tile-ink absolute -top-0.75 h-2.75 w-0.5 -translate-x-1/2 rounded-full"
            style={{ left: `${tick}%` }}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 0.85 }}
            transition={{ duration: 0.3, delay: TICK_DELAY_SECONDS + lag }}
          />
        </div>
      )}
    </motion.div>
  )
}

function Swap({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.div className={className} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SWAP}>
      {children}
    </motion.div>
  )
}

function RiskFlow({ request }: { request: RequestSummary }) {
  const { t } = useTranslation(['dashboard', 'requests', 'common'])
  const reduced = useReducedMotion()
  const durationParts = useDurationParts()
  const stages = useRequestStages(request.id)

  if (stages.isPending) return <Skeleton className="h-16" />
  if (stages.isError) return <ErrorState compact error={stages.error} onRetry={() => void stages.refetch()} />

  const times = new Map(stages.data.stages.map((stage) => [stage.status, stage.hours]))
  const current = STAGE_ORDER.indexOf(stages.data.current)
  const format = (hours: number | undefined) => {
    if (hours === undefined) return t('common:noValue')
    const parts = durationParts(hours)
    return `${parts.value} ${parts.unit}`
  }

  return (
    <ol aria-label={t('risk.flowLabel')} className="risk-glass-soft rounded-tile text-slate-foreground flex px-2.5 pt-3 pb-2.5">
      {STAGE_ORDER.map((status, index) => {
        const reached = index <= current
        const isCurrent = index === current
        const arrive = reduced ? 0 : index * SEGMENT_SECONDS
        return (
          <li
            key={status}
            aria-current={isCurrent ? 'step' : undefined}
            className={`relative flex flex-1 flex-col items-center text-center ${reached ? '' : 'opacity-60'}`}
          >
            {index > 0 && (
              <span aria-hidden="true" className="bg-risk-flow-track absolute top-1.5 right-1/2 -left-1/2 h-0.5">
                {reached && (
                  <motion.span
                    className="bg-risk-flow block h-full origin-left"
                    initial={reduced ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: SEGMENT_SECONDS, ease: 'easeInOut', delay: (index - 1) * SEGMENT_SECONDS }}
                  />
                )}
              </span>
            )}
            <motion.span
              aria-hidden="true"
              className={[
                'relative z-10 mb-1.5 block size-3.5 rounded-full',
                isCurrent ? 'motion-safe:animate-risk-pulse bg-[#fff] shadow-[inset_0_0_0_3px_var(--risk-flow),0_0_0_5px_rgb(106_91_208/0.2)]' : reached ? 'bg-risk-flow' : 'bg-risk-flow-track',
              ].join(' ')}
              style={isCurrent ? { animationDelay: `${arrive + SEGMENT_SECONDS}s` } : undefined}
              initial={reached && !reduced ? { scale: 0.4, opacity: 0 } : false}
              animate={{ scale: isCurrent ? 1.15 : 1, opacity: 1 }}
              transition={{ ...POP, delay: arrive }}
            />
            <span className="text-caption font-semibold">{t(`requests:status.${status}`)}</span>
            <motion.span
              className="text-micro mt-px font-normal opacity-70"
              initial={reached && !reduced ? { opacity: 0 } : false}
              animate={{ opacity: 0.7 }}
              transition={{ duration: TIME_FADE_SECONDS, delay: arrive + 0.15 }}
            >
              {reached ? format(times.get(status)) : t('common:noValue')}
            </motion.span>
          </li>
        )
      })}
    </ol>
  )
}

function RiskDetail({ request }: { request: RequestSummary }) {
  const { t } = useTranslation(['dashboard', 'ai', 'requests', 'common'])
  const { number } = useFormatters()
  const durationParts = useDurationParts()
  const language = useAILanguage()
  const insight = useRequestInsight(request.id, language)
  const suggestion = useAssignmentSuggestion(request.id)
  const proposal = suggestion.data?.suggestion ?? null
  const detail = useRequest(request.id)

  const factors = insight.data?.risk?.factors
  const stage = factor(factors, 'stage_delay')
  const idle = factor(factors, 'inactivity')
  const load = factor(factors, 'assignee_load')
  const hours = (value: number | string | null | undefined) => (typeof value === 'number' ? value : null)
  const parts = (value: number | null) => (value === null ? { amount: null, unit: undefined } : durationParts(value))
  const span = (value: number | null) => {
    if (value === null) return t('common:noValue')
    const shown = durationParts(value)
    return `${shown.value} ${shown.unit}`
  }
  const idleHours = hours(idle?.value)
  const idleReference = idle?.reference ?? null
  const stageReference = stage?.reference ?? null
  const loadValue = hours(load?.value)
  const loadReference = load?.reference ?? LOAD_REFERENCE
  const kind = stage?.reference_kind ? t(`ai:referenceKind.${stage.reference_kind}`) : t('common:noValue')

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Swap className="flex min-w-0 flex-col gap-1">
          <span className="text-caption font-semibold">{t('risk.detail')}</span>
          <span className="text-title-detail">{request.code}</span>
          <span className="text-body font-semibold">{request.title}</span>
        </Swap>
        <Swap className="flex flex-col items-end gap-1 text-right">
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
        </Swap>
      </div>

      <div className="mt-5 mb-3">
        {insight.isPending ? (
          <div className="grid gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-32" />
            ))}
          </div>
        ) : insight.isError ? (
          <ErrorState compact error={insight.error} onRetry={() => void insight.refetch()} />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Tile
              icon={Clock}
              index={0}
              {...parts(idleHours)}
              label={t('risk.idle')}
              note={t('risk.idleReference', { value: span(idleReference) })}
              measured={idleHours}
              reference={idleReference}
            />
            <Tile
              icon={ChartColumn}
              index={1}
              {...parts(stageReference)}
              label={t('risk.reference', { kind })}
              note={
                stage?.reference_kind === 'sla_max'
                  ? t('risk.stageSla', { value: span(stageReference) })
                  : t('risk.stageReference', { kind, value: span(stageReference) })
              }
              measured={hours(stage?.value)}
              reference={stageReference}
            />
            <Tile
              icon={User}
              index={2}
              amount={loadValue}
              label={request.assignee ? t('risk.assigneeLoad') : t('risk.noAssignee')}
              note={t('risk.loadReference', { value: number(loadReference) })}
              measured={loadValue}
              reference={loadReference}
            />
          </div>
        )}
      </div>

      <div className="risk-glass-soft rounded-inner mt-auto flex flex-wrap items-center justify-between gap-3 py-2.5 pr-2.5 pl-4.5">
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
            <ReassignButton
              requestId={request.id}
              code={request.code}
              version={detail.data.version}
              suggestion={proposal}
            />
          )}
        </div>
      </div>

      <div className="mt-3">
        <RiskFlow request={request} />
      </div>
    </div>
  )
}

export function RiskSpotlight({ areaId }: { areaId?: string }) {
  const { t } = useTranslation('dashboard')
  const listId = useId()
  const tabs = useRef<HTMLDivElement>(null)
  const [settled, setSettled] = useState(false)
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
  const loaded = items.length > 0

  useEffect(() => {
    if (!loaded) return
    const timer = window.setTimeout(() => {
      setSettled(true)
    }, ROW_SETTLE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [loaded])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(tabs.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
    if (!moveFocus(buttons, document.activeElement, event.key)) return
    event.preventDefault()
    const focused = document.activeElement
    const match = items.find((item) => focused instanceof HTMLElement && focused.id === `${listId}-tab-${item.id}`)
    if (match) setSelectedId(match.id)
  }

  return (
    <section
      aria-labelledby={`${listId}-title`}
      className="bg-risk-panel text-feature-foreground rounded-feature shadow-card on-dark lift p-6"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
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
                <Skeleton key={index} className="bg-risk-panel-row h-16" />
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
              className="risk-scroller flex flex-col gap-2.5"
            >
              {items.map((item, index) => (
                <RiskTab
                  key={item.id}
                  request={item}
                  index={index}
                  settled={settled}
                  root={tabs}
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
            className="risk-glass text-slate-foreground rounded-card on-slate px-7.5 pt-7.5 pb-6.5"
          >
            <RiskDetail key={selected.id} request={selected} />
          </div>
        )}
      </div>
    </section>
  )
}
