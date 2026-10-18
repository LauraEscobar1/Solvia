import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronUp } from 'lucide-react'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/Card'
import { ErrorState, InlineAlert, SkeletonRows } from '@/components/ui/States'
import { TextArea } from '@/components/ui/TextArea'
import { useTranslateError } from '@/lib/api/errors'
import { useRequestEvents, type useRequestActions } from '@/lib/api/requests'
import {
  REQUEST_PRIORITIES,
  type RequestEvent,
  type RequestEventType,
  type RequestPriority,
} from '@/lib/api/types'
import { useFormatters } from '@/lib/format'

const DOTS: Record<RequestEventType, string> = {
  created: 'bg-control-border',
  status_changed: 'bg-stage-assigned',
  assigned: 'bg-stage-in-progress',
  comment: 'bg-foreground',
  updated: 'bg-subtle-foreground',
}

const CHANGE_FIELDS = ['title', 'description', 'priority', 'due_at'] as const
type ChangeField = (typeof CHANGE_FIELDS)[number]

const EVENT_TIME: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }

const commentSchema = z.object({
  comment: z.string().trim().min(1, 'required').max(5000, 'tooLong'),
})

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function isPriority(value: unknown): value is RequestPriority {
  return typeof value === 'string' && (REQUEST_PRIORITIES as readonly string[]).includes(value)
}

function changesOf(event: RequestEvent): [ChangeField, { from: unknown; to: unknown }][] {
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
  const { dateTime } = useFormatters()
  const actor = event.actor?.full_name ?? t('events.someone')
  const isReturn = event.type === 'status_changed' && Boolean(event.details.returned_by)

  const formatValue = (field: ChangeField, value: unknown): string => {
    if (value === null || value === undefined || value === '') return t('events.empty')
    if (field === 'priority' && isPriority(value)) return t(`priority.${value}`)
    if (field === 'due_at' && typeof value === 'string') return dateTime(value)
    return typeof value === 'string' ? value : JSON.stringify(value)
  }

  const action = (() => {
    switch (event.type) {
      case 'created':
        return t('events.created')
      case 'comment':
        return t('events.comment')
      case 'updated':
        return t('events.updated')
      case 'assigned': {
        const assignee = textOf(event.details.assignee_name) ?? t('events.someone')
        const previous = textOf(event.details.previous_assignee_name)
        return previous && event.from_status === event.to_status
          ? t('events.reassigned', { previous, assignee })
          : t('events.assigned', { assignee })
      }
      case 'status_changed':
        if (isReturn) return t('events.returned')
        return t('events.status_changed', {
          from: event.from_status ? t(`status.${event.from_status}`) : '',
          to: event.to_status ? t(`status.${event.to_status}`) : '',
        })
    }
  })()

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span aria-hidden="true" className="bg-divider absolute top-4 bottom-0 left-1 w-px [li:last-child>&]:hidden" />
      <span aria-hidden="true" className={`ring-surface-solid relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ${DOTS[event.type]}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-body" data-testid="event-headline">
          <strong className="font-semibold">{actor}</strong> {action}
        </p>
        <time dateTime={event.created_at} title={dateTime(event.created_at)} className="text-caption text-subtle-foreground">
          {dateTime(event.created_at, EVENT_TIME)}
        </time>
        {event.details.area_override === true && (
          <p className="text-caption text-warning-text font-medium">{t('events.areaOverride')}</p>
        )}
        {event.type === 'updated' && (
          <ul className="text-caption text-muted-foreground flex flex-col gap-0.5">
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
          <p className="bg-surface-raised rounded-inner text-body mt-1 px-4 py-3 whitespace-pre-wrap">
            {event.comment}
          </p>
        )}
      </div>
    </li>
  )
}

function CommentComposer({ comment }: { comment: ReturnType<typeof useRequestActions>['comment'] }) {
  const { t } = useTranslation(['requests', 'validation'])
  const translateError = useTranslateError()
  const id = useId()
  const errorId = useId()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ comment: string }>({ resolver: zodResolver(commentSchema), defaultValues: { comment: '' } })

  const onSubmit = handleSubmit(async (values) => {
    await comment.mutateAsync(values.comment.trim())
    reset()
  })

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event).catch(() => undefined)} className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        {t('detail.comment.label')}
      </label>
      <div className="border-control-border bg-control rounded-card has-[textarea:focus-visible]:outline-focus flex items-end gap-2 border py-1.5 pr-1.5 pl-5 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2">
        <TextArea
          id={id}
          rows={1}
          autoGrow
          bare
          placeholder={t('detail.comment.placeholder')}
          aria-invalid={Boolean(errors.comment)}
          aria-describedby={errors.comment ? errorId : undefined}
          className="max-h-48 py-2"
          {...register('comment')}
        />
        <Button type="submit" variant="solid" size="md" loading={comment.isPending}>
          {t('detail.comment.submit')}
        </Button>
      </div>
      {errors.comment?.message && (
        <p id={errorId} role="alert" className="text-caption text-danger-text px-5 font-medium">
          {t(`validation:${errors.comment.message}`, { defaultValue: t('validation:invalid') })}
        </p>
      )}
      {comment.error && <InlineAlert tone="error">{translateError(comment.error)}</InlineAlert>}
    </form>
  )
}

interface RequestTimelineProps {
  requestId: string
  comment: ReturnType<typeof useRequestActions>['comment']
  canComment: boolean
}

export function RequestTimeline({ requestId, comment, canComment }: RequestTimelineProps) {
  const { t } = useTranslation('requests')
  const events = useRequestEvents(requestId)
  const items = [...(events.data?.pages.flatMap((page) => page.items) ?? [])].reverse()

  return (
    <SectionCard title={t('detail.history')}>
      {events.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          loading={events.isFetchingNextPage}
          onClick={() => {
            void events.fetchNextPage()
          }}
        >
          <ChevronUp className="size-4" aria-hidden="true" />
          {t('detail.loadMore')}
        </Button>
      )}
      {events.isPending ? (
        <SkeletonRows rows={3} />
      ) : events.isError ? (
        <ErrorState compact error={events.error} onRetry={() => void events.refetch()} />
      ) : (
        <ol aria-label={t('detail.history')} className="flex flex-col">
          {items.map((event) => (
            <EventItem key={event.id} event={event} />
          ))}
        </ol>
      )}
      {canComment && <CommentComposer comment={comment} />}
    </SectionCard>
  )
}
