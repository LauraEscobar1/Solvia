import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { type Step, Stepper } from '@/components/ui/Progress'
import { useRequestStages } from '@/lib/api/requests'
import type { RequestDetail, RequestStatus } from '@/lib/api/types'
import { useFormatters, useLongDuration } from '@/lib/format'
import { STAGE_ORDER } from '@/lib/requests/tones'

export function RequestStepper({ detail }: { detail: RequestDetail }) {
  const { t } = useTranslation('requests')
  const duration = useLongDuration()
  const { dateTime } = useFormatters()
  const stages = useRequestStages(detail.id)
  const visits = stages.data?.stages ?? []
  const times = new Map(visits.map((stage) => [stage.status, stage]))
  const cancelledAt: RequestStatus | undefined =
    detail.status === 'cancelled'
      ? visits.filter((stage) => stage.status !== 'cancelled').at(-1)?.status
      : undefined

  const steps: Step[] = STAGE_ORDER.map((status, index) => {
    const time = times.get(status)
    const base = { key: status, eyebrow: t('detail.stepper.step', { number: index + 1 }), label: t(`status.${status}`) }
    if (status === 'completed' && detail.status === 'completed') {
      const finished = detail.completed_at ?? time?.entered_at
      return {
        ...base,
        state: 'done',
        detail: finished ? t('detail.stepper.finished', { date: dateTime(finished, { dateStyle: 'medium' }) }) : t('status.completed'),
      }
    }
    if (status === detail.status) {
      return {
        ...base,
        state: 'current',
        detail: time ? t('detail.stepper.current', { duration: duration(time.hours) }) : t('detail.stepper.currentShort'),
      }
    }
    if (status === cancelledAt) return { ...base, state: 'cancelled', detail: t('detail.stepper.cancelled') }
    if (time) return { ...base, state: 'done', detail: t('detail.stepper.done', { duration: duration(time.hours) }) }
    return { ...base, state: 'pending', detail: t('detail.stepper.pending') }
  })

  return (
    <Card padding="md">
      <Stepper label={t('detail.stepper.label')} steps={steps} />
    </Card>
  )
}
