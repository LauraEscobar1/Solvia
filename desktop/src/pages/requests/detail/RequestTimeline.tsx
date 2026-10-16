import {
  ArrowRightLeft,
  type LucideIcon,
  MessageSquare,
  Pencil,
  PlusCircle,
  Undo2,
  UserCheck,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { useTranslateError } from '@/lib/api/errors'
import { useRequestEvents } from '@/lib/api/requests'
import {
  REQUEST_PRIORITIES,
  type RequestEvent,
  type RequestEventType,
  type RequestPriority,
} from '@/lib/api/types'
import { useFormatters } from '@/lib/format'

const ICONS: Record<RequestEventType, LucideIcon> = {
  created: PlusCircle,
  status_changed: ArrowRightLeft,
  assigned: UserCheck,
  comment: MessageSquare,
  updated: Pencil,
}

const CHANGE_FIELDS = ['title', 'description', 'priority', 'due_at'] as const
type ChangeField = (typeof CHANGE_FIELDS)[number]

interface FieldChange {
  from: unknown
  to: unknown
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function isPriority(value: unknown): value is RequestPriority {
  return typeof value === 'string' && (REQUEST_PRIORITIES as readonly string[]).includes(value)
}

function changesOf(event: RequestEvent): [ChangeField, FieldChange][] {
  const changes = event.details.changes
  if (typeof changes !== 'object' || changes === null) return []
  return CHANGE_FIELDS.flatMap((field) => {
    const change: unknown = (changes as Record<string, unknown>)[field]
    if (typeof change !== 'object' || change === null) return []
    const { from, to } = change as Record<string, unknown>
    return [[field, { from, to }]]
  })
}

function EventItem({ event }: { event: RequestEvent }) {
  const { t } = useTranslation('requests')
  const { relative, dateTime } = useFormatters()
  const actor = event.actor?.full_name ?? t('events.someone')
  const isReturn = event.type === 'status_changed' && Boolean(event.details.returned_by)
  const Icon = isReturn ? Undo2 : ICONS[event.type]

  const formatValue = (field: ChangeField, value: unknown): string => {
    if (value === null || value === undefined || value === '') return t('events.empty')
    if (field === 'priority' && isPriority(value)) return t(`priority.${value}`)
    if (field === 'due_at' && typeof value === 'string') return dateTime(value)
    return typeof value === 'string' ? value : JSON.stringify(value)
  }

  const headline = (() => {
    switch (event.type) {
      case 'created':
        return t('events.created', { actor })
      case 'comment':
        return t('events.comment', { actor })
      case 'updated':
        return t('events.updated', { actor })
      case 'assigned': {
        const assignee = textOf(event.details.assignee_name) ?? t('events.someone')
        const previous = textOf(event.details.previous_assignee_name)
        return previous && event.from_status === event.to_status
          ? t('events.reassigned', { actor, previous, assignee })
          : t('events.assigned', { actor, assignee })
      }
      case 'status_changed':
        if (isReturn) return t('events.returned', { actor })
        return t('events.status_changed', {
          actor,
          from: event.from_status ? t(`status.${event.from_status}`) : '',
          to: event.to_status ? t(`status.${event.to_status}`) : '',
        })
    }
  })()

  return (
    <li className="flex gap-3">
      <span className="bg-primary-soft text-primary mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-sm">{headline}</p>
          <time
            dateTime={event.created_at}
            title={dateTime(event.created_at)}
            className="text-muted-foreground text-xs whitespace-nowrap"
          >
            {relative(event.created_at)}
          </time>
        </div>
        {event.details.area_override === true && (
          <p className="text-warning text-xs">{t('events.areaOverride')}</p>
        )}
        {event.type === 'updated' && (
          <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
            {changesOf(event).map(([field, change]) => (
              <li key={field}>
                {t('events.change', {
                  field: t(`detail.fields.${field}`),
                  from: formatValue(field, change.from),
                  to: formatValue(field, change.to),
                })}
              </li>
            ))}
          </ul>
        )}
        {event.comment && (
          <p className="bg-surface-muted rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">
            {event.comment}
          </p>
        )}
      </div>
    </li>
  )
}

export function RequestTimeline({ requestId }: { requestId: string }) {
  const { t } = useTranslation(['requests', 'common'])
  const translateError = useTranslateError()
  const events = useRequestEvents(requestId)
  const items = events.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section className="bg-surface flex flex-col gap-4 rounded-xl border p-5 shadow-xs">
      <h2 className="font-semibold">{t('detail.history')}</h2>
      {events.isPending && <p className="text-muted-foreground text-sm">{t('common:loading')}</p>}
      {events.isError && (
        <p role="alert" className="text-danger text-sm">
          {translateError(events.error)}
        </p>
      )}
      <ol aria-label={t('detail.history')} className="flex flex-col gap-4">
        {items.map((event) => (
          <EventItem key={event.id} event={event} />
        ))}
      </ol>
      {events.hasNextPage && (
        <div>
          <Button
            disabled={events.isFetchingNextPage}
            onClick={() => {
              void events.fetchNextPage()
            }}
          >
            {t('detail.loadMore')}
          </Button>
        </div>
      )}
    </section>
  )
}
