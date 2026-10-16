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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DueDate, PriorityBadge, StalledIcon } from '@/components/requests/RequestBadges'
import { TransitionDialog, type TransitionValues } from '@/components/requests/TransitionDialog'
import { selectClass } from '@/components/ui/styles'
import { useTranslateError } from '@/lib/api/errors'
import { useBoardMove, useRequestBoard } from '@/lib/api/requests'
import {
  type AllowedTransition,
  BOARD_STATUSES,
  type BoardCard,
  REQUEST_STATUSES,
  type RequestStatus,
} from '@/lib/api/types'
import type { RequestFilters } from '@/lib/requests/filters'
import { needsDialog, transitionAction } from '@/lib/requests/transitions'

const POINTER_ACTIVATION_DISTANCE = 6

interface PendingMove {
  card: BoardCard
  transition: AllowedTransition
}

function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && (REQUEST_STATUSES as readonly string[]).includes(value)
}

function CardContent({ card }: { card: BoardCard }) {
  const { t } = useTranslation('requests')
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground font-mono text-xs">{card.code}</span>
        <PriorityBadge priority={card.priority} />
      </div>
      <Link
        to={`/requests/${card.id}`}
        className="line-clamp-2 text-sm font-medium hover:underline"
      >
        {card.title}
      </Link>
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="truncate">{card.assignee?.full_name ?? t('unassigned')}</span>
        {card.is_stalled && <StalledIcon />}
      </div>
      <div className="text-xs">
        <DueDate request={card} />
      </div>
    </>
  )
}

function DraggableCard({
  card,
  onMove,
}: {
  card: BoardCard
  onMove: (card: BoardCard, to: RequestStatus) => void
}) {
  const { t } = useTranslation('requests')
  const movable = card.allowed_transitions.length > 0
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { card },
    disabled: !movable,
  })
  const tone =
    card.sla_status === 'overdue'
      ? 'border-l-danger'
      : card.sla_status === 'at_risk'
        ? 'border-l-warning'
        : 'border-l-transparent'

  return (
    <article
      ref={setNodeRef}
      aria-label={card.code}
      className={`bg-surface flex flex-col gap-2 rounded-lg border border-l-4 p-3 shadow-xs ${tone} ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div
        {...listeners}
        {...attributes}
        className={`flex flex-col gap-2 ${movable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        <CardContent card={card} />
      </div>
      {movable && (
        <label>
          <span className="sr-only">{t('board.moveTo', { code: card.code })}</span>
          <select
            value=""
            onChange={(event) => {
              const target = card.allowed_transitions.find((item) => item.to === event.target.value)
              if (target) onMove(card, target.to)
            }}
            className={`${selectClass} py-1 text-xs`}
          >
            <option value="">{t('board.move')}</option>
            {card.allowed_transitions.map((transition) => (
              <option key={transition.to} value={transition.to}>
                {t(`actions.${transitionAction(card.status, transition.to)}`)}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  )
}

function Column({
  status,
  total,
  cards,
  highlight,
  onMove,
}: {
  status: RequestStatus
  total: number
  cards: BoardCard[]
  highlight: 'allowed' | 'blocked' | null
  onMove: (card: BoardCard, to: RequestStatus) => void
}) {
  const { t } = useTranslation('requests')
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const ring =
    highlight === 'allowed'
      ? isOver
        ? 'ring-2 ring-primary'
        : 'ring-1 ring-primary/40'
      : highlight === 'blocked'
        ? 'opacity-50'
        : ''

  return (
    <section
      ref={setNodeRef}
      aria-label={t('board.column', { status: t(`status.${status}`) })}
      className={`bg-surface-muted flex w-72 shrink-0 flex-col gap-3 rounded-xl p-3 transition ${ring}`}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t(`status.${status}`)}</h2>
        <span className="text-muted-foreground bg-surface rounded-full px-2 text-xs font-medium">
          {total}
        </span>
      </header>
      <div className="flex min-h-24 flex-col gap-2">
        {cards.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-xs">{t('board.empty')}</p>
        )}
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} onMove={onMove} />
        ))}
      </div>
      {total > cards.length && (
        <p className="text-muted-foreground text-center text-xs">
          {t('board.showing', { count: cards.length, total })}
        </p>
      )}
    </section>
  )
}

export function RequestBoardView({ filters }: { filters: RequestFilters }) {
  const { t } = useTranslation('requests')
  const translateError = useTranslateError()
  const [showCancelled, setShowCancelled] = useState(false)
  const boardFilters = useMemo<RequestFilters>(
    () =>
      filters.status.length === 0 && showCancelled
        ? { ...filters, status: [...BOARD_STATUSES, 'cancelled'] }
        : filters,
    [filters, showCancelled],
  )
  const board = useRequestBoard(boardFilters)
  const move = useBoardMove(boardFilters)
  const [active, setActive] = useState<BoardCard | null>(null)
  const [pending, setPending] = useState<PendingMove | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: POINTER_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor),
  )

  const cards = useMemo(
    () => new Map(board.data?.columns.flatMap((column) => column.items).map((c) => [c.id, c])),
    [board.data],
  )
  const codeOf = (id: string | number) => cards.get(String(id))?.code ?? String(id)
  const statusName = (id: string | number) =>
    isRequestStatus(id) ? t(`status.${id}`) : String(id)

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {filters.status.length === 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={showCancelled}
              onChange={(event) => {
                setShowCancelled(event.target.checked)
              }}
            />
            {t('board.showCancelled')}
          </label>
        ) : (
          <span />
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2 text-sm">
          {errorMessage}
        </p>
      )}
      {board.isPending && <p className="text-muted-foreground text-sm">{t('loading')}</p>}
      {board.isError && (
        <p role="alert" className="text-danger text-sm">
          {translateError(board.error)}
        </p>
      )}

      {board.data && (
        <DndContext
          sensors={sensors}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: t('dnd.instructions') },
          }}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActive(null)
          }}
        >
          <div className="flex gap-4 overflow-x-auto pb-2">
            {board.data.columns.map((column) => (
              <Column
                key={column.status}
                status={column.status}
                total={column.total}
                cards={column.items}
                highlight={highlightFor(column.status)}
                onMove={requestMove}
              />
            ))}
          </div>
          <DragOverlay>
            {active && (
              <div className="bg-surface flex w-72 flex-col gap-2 rounded-lg border p-3 shadow-lg">
                <CardContent card={active} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

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
