import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { ArrowRightLeft, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { type KeyboardEvent, type PointerEvent, type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { TransitionDialog, type TransitionValues } from '@/components/requests/TransitionDialog'
import { DuePill, PriorityPill } from '@/components/requests/RequestPills'
import { Avatar, EmptyAvatar } from '@/components/ui/Avatar'
import { Menu } from '@/components/ui/Menu'
import { ErrorState, InlineAlert, LoadingState } from '@/components/ui/States'
import { useTranslateError } from '@/lib/api/errors'
import { useBoardMove, type useRequestBoard } from '@/lib/api/requests'
import { type AllowedTransition, type BoardCard, REQUEST_STATUSES, type RequestStatus } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import type { RequestFilters } from '@/lib/requests/filters'
import { STAGE_COLORS } from '@/lib/requests/tones'
import { needsDialog, transitionAction } from '@/lib/requests/transitions'

const POINTER_ACTIVATION_DISTANCE = 6
const COLLAPSIBLE: readonly RequestStatus[] = ['completed', 'cancelled']

interface PendingMove {
  card: BoardCard
  transition: AllowedTransition
}

function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && (REQUEST_STATUSES as readonly string[]).includes(value)
}

function CardBody({ card, handle }: { card: BoardCard; handle?: ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          {handle}
          <span className="text-code text-muted-foreground font-mono">{card.code}</span>
        </span>
        <PriorityPill priority={card.priority} />
      </div>
      <Link to={`/requests/${card.id}`} className="text-body line-clamp-2 rounded-check font-semibold hover:underline">
        {card.title}
      </Link>
    </>
  )
}

function DraggableCard({ card, onMove }: { card: BoardCard; onMove: (card: BoardCard, to: RequestStatus) => void }) {
  const { t } = useTranslation('requests')
  const movable = card.allowed_transitions.length > 0
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { card },
    disabled: !movable,
  })
  const onPointerDown = listeners?.onPointerDown as ((event: PointerEvent<HTMLElement>) => void) | undefined
  const onKeyDown = listeners?.onKeyDown as ((event: KeyboardEvent<HTMLElement>) => void) | undefined

  return (
    <article
      ref={setNodeRef}
      aria-label={card.code}
      onPointerDown={onPointerDown}
      className={[
        'bg-surface-raised rounded-inner shadow-card flex flex-col gap-3 p-4',
        movable ? 'cursor-grab active:cursor-grabbing' : '',
        isDragging ? 'opacity-40' : '',
      ].join(' ')}
    >
      <CardBody
        card={card}
        handle={
          movable && (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              onKeyDown={onKeyDown}
              aria-label={t('board.drag', { code: card.code })}
              className="text-subtle-foreground hover:text-foreground -ml-1.5 inline-flex size-6 items-center justify-center rounded-full"
            >
              <GripVertical className="size-3.5" aria-hidden="true" />
            </button>
          )
        }
      />
      <div className="flex items-center justify-between gap-2">
        <DuePill request={card} />
        <span className="flex items-center gap-1">
          {movable && (
            <Menu
              label={t('board.moveMenu', { code: card.code })}
              icon={ArrowRightLeft}
              triggerVariant="ghost"
              entries={card.allowed_transitions.map((transition) => ({
                kind: 'item',
                id: transition.to,
                label: t(`actions.${transitionAction(card.status, transition.to)}`),
                onSelect: () => {
                  onMove(card, transition.to)
                },
              }))}
            />
          )}
          {card.assignee ? <Avatar name={card.assignee.full_name} id={card.assignee.id} /> : <EmptyAvatar />}
        </span>
      </div>
    </article>
  )
}

interface ColumnProps {
  status: RequestStatus
  total: number
  cards: BoardCard[]
  highlight: 'allowed' | 'blocked' | null
  collapsed: boolean
  onToggle?: () => void
  onMove: (card: BoardCard, to: RequestStatus) => void
}

function Column({ status, total, cards, highlight, collapsed, onToggle, onMove }: ColumnProps) {
  const { t } = useTranslation('requests')
  const { number } = useFormatters()
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const name = t(`status.${status}`)
  const ring =
    highlight === 'allowed' ? (isOver ? 'outline-2 outline-focus' : 'outline-1 outline-accent-line') : highlight === 'blocked' ? 'opacity-50' : ''

  return (
    <section
      ref={setNodeRef}
      aria-label={t('board.column', { status: name })}
      className={`glass border-card-edge rounded-column flex h-fit min-w-72 flex-1 flex-col gap-3 border p-3 shadow-card transition ${ring}`}
    >
      <header className="flex items-center justify-between gap-2 px-2 pt-1">
        <h2 className="text-body flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className={`size-2.5 rounded-check ${STAGE_COLORS[status]}`} />
          {name}
        </h2>
        <span className="flex items-center gap-1">
          <span className="text-caption text-muted-foreground font-semibold tabular-nums">{number(total)}</span>
          {onToggle && (
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-label={collapsed ? t('board.expand', { status: name }) : t('board.collapse', { status: name })}
              onClick={onToggle}
              className="text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-full"
            >
              {collapsed ? <ChevronRight className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
            </button>
          )}
        </span>
      </header>
      {collapsed ? (
        highlight === 'allowed' && (
          <p className="text-caption text-muted-foreground px-2 pb-2">{t('board.collapsedHint', { status: name })}</p>
        )
      ) : (
        <div className="flex min-h-24 flex-col gap-3">
          {cards.length === 0 && <p className="text-caption text-muted-foreground py-6 text-center">{t('board.empty')}</p>}
          {cards.map((card) => (
            <DraggableCard key={card.id} card={card} onMove={onMove} />
          ))}
          {total > cards.length && (
            <p className="text-caption text-muted-foreground text-center">
              {t('board.showing', { count: cards.length, total })}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

interface RequestBoardViewProps {
  board: ReturnType<typeof useRequestBoard>
  filters: RequestFilters
}

export function RequestBoardView({ board, filters }: RequestBoardViewProps) {
  const { t } = useTranslation('requests')
  const translateError = useTranslateError()
  const move = useBoardMove(filters)
  const [active, setActive] = useState<BoardCard | null>(null)
  const [pending, setPending] = useState<PendingMove | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<RequestStatus[]>([])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: POINTER_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor),
  )

  const cards = useMemo(
    () => new Map(board.data?.columns.flatMap((column) => column.items).map((card) => [card.id, card])),
    [board.data],
  )
  const codeOf = (id: string | number) => cards.get(String(id))?.code ?? String(id)
  const statusName = (id: string | number) => (isRequestStatus(id) ? t(`status.${id}`) : String(id))

  const announcements: Announcements = {
    onDragStart: ({ active: item }) => t('dnd.start', { code: codeOf(item.id) }),
    onDragOver: ({ active: item, over }) =>
      over
        ? t('dnd.over', { code: codeOf(item.id), status: statusName(over.id) })
        : t('dnd.outside', { code: codeOf(item.id) }),
    onDragEnd: ({ active: item, over }) =>
      over
        ? t('dnd.end', { code: codeOf(item.id), status: statusName(over.id) })
        : t('dnd.cancel', { code: codeOf(item.id) }),
    onDragCancel: ({ active: item }) => t('dnd.cancel', { code: codeOf(item.id) }),
  }

  const send = (card: BoardCard, to: RequestStatus, values: TransitionValues = {}) => {
    move.mutate({ card, input: { to, version: card.version, ...values } })
  }

  const requestMove = (card: BoardCard, to: RequestStatus) => {
    setRejection(null)
    move.reset()
    if (card.status === to) return
    const transition = card.allowed_transitions.find((item) => item.to === to)
    if (!transition) {
      setRejection(t('board.notAllowed', { code: card.code, status: t(`status.${to}`) }))
      return
    }
    if (needsDialog(transition)) {
      setPending({ card, transition })
      return
    }
    send(card, to)
  }

  const onDragStart = ({ active: item }: DragStartEvent) => {
    setActive(cards.get(String(item.id)) ?? null)
  }

  const onDragEnd = ({ active: item, over }: DragEndEvent) => {
    setActive(null)
    const card = cards.get(String(item.id))
    if (card && over && isRequestStatus(over.id)) requestMove(card, over.id)
  }

  const highlightFor = (status: RequestStatus): 'allowed' | 'blocked' | null => {
    if (!active || active.status === status) return null
    return active.allowed_transitions.some((item) => item.to === status) ? 'allowed' : 'blocked'
  }

  const errorMessage = rejection ?? (move.error ? translateError(move.error) : null)

  if (board.isPending) return <LoadingState label={t('loading')} />
  if (board.isError && !board.data) {
    return <ErrorState error={board.error} onRetry={() => void board.refetch()} />
  }

  return (
    <div className="flex flex-col gap-4">
      {errorMessage && <InlineAlert tone="error">{errorMessage}</InlineAlert>}
      <DndContext
        sensors={sensors}
        accessibility={{ announcements, screenReaderInstructions: { draggable: t('dnd.instructions') } }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null)
        }}
      >
        <div className="flex items-start gap-4 overflow-x-auto pb-2">
          {board.data?.columns.map((column) => {
            const collapsible = COLLAPSIBLE.includes(column.status)
            const collapsed = collapsible && !expanded.includes(column.status)
            return (
              <Column
                key={column.status}
                status={column.status}
                total={column.total}
                cards={column.items}
                highlight={highlightFor(column.status)}
                collapsed={collapsed}
                onToggle={
                  collapsible
                    ? () => {
                        setExpanded((current) =>
                          current.includes(column.status)
                            ? current.filter((item) => item !== column.status)
                            : [...current, column.status],
                        )
                      }
                    : undefined
                }
                onMove={requestMove}
              />
            )
          })}
        </div>
        <DragOverlay>
          {active && (
            <div className="bg-surface-raised rounded-inner shadow-pop flex w-72 flex-col gap-3 p-4">
              <CardBody card={active} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {pending && (
        <TransitionDialog
          code={pending.card.code}
          area={pending.card.area}
          from={pending.card.status}
          transition={pending.transition}
          onCancel={() => {
            setPending(null)
          }}
          onConfirm={(values) => {
            send(pending.card, pending.transition.to, values)
            setPending(null)
          }}
        />
      )}
    </div>
  )
}
