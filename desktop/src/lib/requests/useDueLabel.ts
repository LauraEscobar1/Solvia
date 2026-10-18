import { useTranslation } from 'react-i18next'
import { useNow } from '@/lib/clock'
import { useCompactDuration } from '@/lib/format'
import { type DueKind, dueKind, type DueRequest } from './due'

const HOUR_MS = 3_600_000

export function useDueLabel(request: DueRequest): { kind: DueKind; label: string } {
  const { t } = useTranslation(['requests', 'common'])
  const compact = useCompactDuration()
  const now = useNow()
  const kind = dueKind(request)
  const due = request.due_at ? new Date(request.due_at).getTime() : null
  const idle = (now - new Date(request.last_activity_at).getTime()) / HOUR_MS

  if (kind === 'closed') return { kind, label: t('common:noValue') }
  if (kind === 'overdue' && due !== null) return { kind, label: t('due.overdue', { time: compact((now - due) / HOUR_MS) }) }
  if (kind === 'stalled') return { kind, label: t('due.stalled', { time: compact(idle) }) }
  if (due !== null) return { kind, label: t('due.dueIn', { time: compact((due - now) / HOUR_MS) }) }
  return { kind, label: t('due.none') }
}
