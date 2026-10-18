import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { z } from 'zod'
import {
  DueDate,
  PriorityBadge,
  RequestStatusBadge,
  SlaFlags,
} from '@/components/requests/RequestBadges'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { inputClass } from '@/components/ui/styles'
import { ApiError } from '@/lib/api/client'
import { useTranslateError } from '@/lib/api/errors'
import { useRequest, useRequestActions } from '@/lib/api/requests'
import type { RequestDetail } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { RequestActions } from './RequestActions'
import { RequestEditForm } from './RequestEditForm'
import { RequestTimeline } from './RequestTimeline'
import { RiskCard } from './RiskCard'

const commentSchema = z.object({
  comment: z.string().trim().min(1, 'required').max(5000, 'tooLong'),
})

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function CommentBox({
  comment,
}: {
  comment: ReturnType<typeof useRequestActions>['comment']
}) {
  const { t } = useTranslation('requests')
  const translateError = useTranslateError()
  const id = useId()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ comment: string }>({
    resolver: zodResolver(commentSchema),
    defaultValues: { comment: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    await comment.mutateAsync(values.comment.trim())
    reset()
  })

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event).catch(() => undefined)}
      className="bg-surface flex flex-col gap-3 rounded-xl border p-5 shadow-xs"
    >
      <FormField label={t('detail.comment.label')} htmlFor={id} error={errors.comment?.message}>
        <textarea
          id={id}
          rows={3}
          aria-invalid={Boolean(errors.comment)}
          className={inputClass}
          {...register('comment')}
        />
      </FormField>
      {comment.error && (
        <p role="alert" className="text-danger text-sm">
          {translateError(comment.error)}
        </p>
      )}
      <div>
        <Button type="submit" variant="solid" disabled={comment.isPending}>
          {t('detail.comment.submit')}
        </Button>
      </div>
    </form>
  )
}

function DetailView({ detail }: { detail: RequestDetail }) {
  const { t } = useTranslation('requests')
  const { dateTime, relative } = useFormatters()
  const actions = useRequestActions(detail.id)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link
        to="/requests"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('detail.back')}
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-mono text-sm">{detail.code}</span>
          <RequestStatusBadge status={detail.status} />
          <PriorityBadge priority={detail.priority} />
          <SlaFlags request={detail} />
        </div>
        <h1 className="text-title-detail">{detail.title}</h1>
        <RequestActions detail={detail} actions={actions} />
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <RiskCard requestId={detail.id} />
          <RequestEditForm detail={detail} update={actions.update} />
          {detail.permissions.can_comment && <CommentBox comment={actions.comment} />}
          <RequestTimeline requestId={detail.id} />
        </div>
        <aside className="bg-surface h-fit rounded-xl border p-5 shadow-xs">
          <dl className="flex flex-col gap-4">
            <InfoRow label={t('detail.fields.area')}>{detail.area.name}</InfoRow>
            <InfoRow label={t('detail.fields.requester')}>{detail.requester.full_name}</InfoRow>
            <InfoRow label={t('detail.fields.assignee')}>
              {detail.assignee?.full_name ?? t('unassigned')}
            </InfoRow>
            <InfoRow label={t('detail.fields.received_at')}>{dateTime(detail.received_at)}</InfoRow>
            <InfoRow label={t('detail.fields.due_at')}>
              <DueDate request={detail} />
            </InfoRow>
            <InfoRow label={t('detail.fields.last_activity_at')}>
              <time dateTime={detail.last_activity_at} title={dateTime(detail.last_activity_at)}>
                {relative(detail.last_activity_at)}
              </time>
            </InfoRow>
            {detail.completed_at && (
              <InfoRow label={t('detail.fields.completed_at')}>
                {dateTime(detail.completed_at)}
              </InfoRow>
            )}
          </dl>
        </aside>
      </div>
    </div>
  )
}

export function RequestDetailPage() {
  const { t } = useTranslation('requests')
  const translateError = useTranslateError()
  const { requestId = '' } = useParams()
  const request = useRequest(requestId)

  if (request.isPending) {
    return <p className="text-muted-foreground text-sm">{t('detail.loading')}</p>
  }
  if (request.isError && !request.data) {
    const notFound = request.error instanceof ApiError && request.error.status === 404
    return (
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3">
        <p role="alert" className="text-danger text-sm">
          {notFound ? t('detail.notFound') : translateError(request.error)}
        </p>
        <Link to="/requests" className="text-primary text-sm hover:underline">
          {t('detail.back')}
        </Link>
      </div>
    )
  }
  return <DetailView detail={request.data} />
}
