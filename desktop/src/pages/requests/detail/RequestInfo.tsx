import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SectionCard } from '@/components/ui/Card'
import type { RequestDetail } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-divider flex items-baseline justify-between gap-4 border-t py-3">
      <dt className="text-caption text-muted-foreground font-semibold">{label}</dt>
      <dd className="text-body text-right font-semibold">{children}</dd>
    </div>
  )
}

export function RequestInfo({ detail }: { detail: RequestDetail }) {
  const { t } = useTranslation('requests')
  const { dateTime, relative } = useFormatters()

  return (
    <SectionCard title={t('detail.info')} className="gap-2">
      <dl>
        <Row label={t('detail.fields.assignee')}>{detail.assignee?.full_name ?? t('unassigned')}</Row>
        <Row label={t('detail.fields.area')}>{detail.area.name}</Row>
        <Row label={t('detail.fields.requester')}>{detail.requester.full_name}</Row>
        <Row label={t('detail.fields.received_at')}>{dateTime(detail.received_at)}</Row>
        <Row label={t('detail.fields.due_at')}>
          {detail.due_at ? dateTime(detail.due_at, { dateStyle: 'medium' }) : t('noDueDate')}
        </Row>
        <Row label={t('detail.fields.last_activity_at')}>
          <time dateTime={detail.last_activity_at} title={dateTime(detail.last_activity_at)}>
            {relative(detail.last_activity_at)}
          </time>
        </Row>
        {detail.completed_at && <Row label={t('detail.fields.completed_at')}>{dateTime(detail.completed_at)}</Row>}
      </dl>
    </SectionCard>
  )
}
