import { FileQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { DuePill, PriorityPill } from '@/components/requests/RequestPills'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { SectionCard } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { ApiError } from '@/lib/api/client'
import { useRequest, useRequestActions } from '@/lib/api/requests'
import type { RequestDetail } from '@/lib/api/types'
import { RequestActions } from './RequestActions'
import { RequestInfo } from './RequestInfo'
import { RequestStepper } from './RequestStepper'
import { RequestTimeline } from './RequestTimeline'
import { RiskCard } from './RiskCard'

function DetailView({ detail }: { detail: RequestDetail }) {
  const { t } = useTranslation(['requests', 'nav'])
  const actions = useRequestActions(detail.id)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        size="title-detail"
        title={detail.title}
        back={{ to: '/requests', label: t('detail.back') }}
        breadcrumbs={[{ label: t('nav:requests'), to: '/requests' }, { label: detail.code }]}
        eyebrow={
          <>
            <PriorityPill priority={detail.priority} prefixed />
            <DuePill request={detail} />
          </>
        }
        actions={<RequestActions detail={detail} actions={actions} />}
      />
      <RequestStepper detail={detail} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard title={t('detail.description')}>
            <p className="text-body text-muted-foreground leading-relaxed whitespace-pre-line">{detail.description}</p>
          </SectionCard>
          <RequestTimeline requestId={detail.id} comment={actions.comment} canComment={detail.permissions.can_comment} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <RiskCard detail={detail} />
          <RequestInfo detail={detail} />
        </div>
      </div>
    </div>
  )
}

export function RequestDetailPage() {
  const { t } = useTranslation('requests')
  const { requestId = '' } = useParams()
  const request = useRequest(requestId)

  if (request.isPending) return <LoadingState label={t('detail.loading')} />
  if (request.isError && !request.data) {
    const notFound = request.error instanceof ApiError && request.error.status === 404
    return notFound ? (
      <EmptyState
        icon={FileQuestion}
        title={t('detail.notFound')}
        action={
          <Link to="/requests" className={buttonClasses('outline', 'md')}>
            {t('detail.back')}
          </Link>
        }
      />
    ) : (
      <ErrorState error={request.error} onRetry={() => void request.refetch()} />
    )
  }
  return <DetailView detail={request.data} />
}
