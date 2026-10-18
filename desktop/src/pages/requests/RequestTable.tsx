import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DuePill, PriorityPill, RiskPill, StageProgress } from '@/components/requests/RequestPills'
import { Avatar, EmptyAvatar } from '@/components/ui/Avatar'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { SortableTh, Table, TableMessage, Td } from '@/components/ui/Table'
import type { RequestSummary } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import type { SortField } from '@/lib/requests/filters'

const COLUMNS: { key: 'request' | 'area' | 'assignee' | 'status' | 'priority' | 'due_at' | 'risk_score' | 'last_activity_at'; sort: SortField }[] = [
  { key: 'request', sort: 'code' },
  { key: 'area', sort: 'area' },
  { key: 'assignee', sort: 'assignee' },
  { key: 'status', sort: 'status' },
  { key: 'priority', sort: 'priority' },
  { key: 'due_at', sort: 'due_at' },
  { key: 'risk_score', sort: 'risk_score' },
  { key: 'last_activity_at', sort: 'last_activity_at' },
]

interface RequestTableProps {
  items: RequestSummary[] | undefined
  loading: boolean
  error: unknown
  onRetry?: () => void
  sort: string
  onSort: (sort: string) => void
  footer?: ReactNode
}

export function RequestTable({ items, loading, error, onRetry, sort, onSort, footer }: RequestTableProps) {
  const { t } = useTranslation('requests')
  const { relative, dateTime } = useFormatters()
  const descending = sort.startsWith('-')
  const active = sort.replace(/^-/, '')

  return (
    <Table caption={t('views.table')} footer={footer}>
      <thead>
        <tr>
          {COLUMNS.map(({ key, sort: field }) => {
            const label = t(`columns.${key}`)
            const isActive = active === field
            return (
              <SortableTh
                key={key}
                label={label}
                buttonLabel={t('sortBy', { column: label })}
                direction={isActive ? (descending ? 'descending' : 'ascending') : null}
                className={key === 'risk_score' ? 'text-right' : ''}
                onSort={() => {
                  onSort(isActive && !descending ? `-${field}` : field)
                }}
              />
            )
          })}
        </tr>
      </thead>
      <tbody>
        {loading && !items && (
          <TableMessage colSpan={COLUMNS.length}>
            <LoadingState label={t('loading')} />
          </TableMessage>
        )}
        {Boolean(error) && !items && (
          <TableMessage colSpan={COLUMNS.length}>
            <ErrorState error={error} onRetry={onRetry} compact />
          </TableMessage>
        )}
        {items?.length === 0 && (
          <TableMessage colSpan={COLUMNS.length}>
            <EmptyState icon={Inbox} title={t('empty')} compact />
          </TableMessage>
        )}
        {items?.map((request) => (
          <tr key={request.id} className="hover:bg-surface-raised/50 transition-colors">
            <Td className="max-w-md">
              <span className="text-code text-muted-foreground block font-mono">{request.code}</span>
              <Link to={`/requests/${request.id}`} className="line-clamp-1 rounded-sm font-semibold hover:underline">
                {request.title}
              </Link>
            </Td>
            <Td className="text-muted-foreground whitespace-nowrap">{request.area.name}</Td>
            <Td>
              <span className="flex items-center gap-2 whitespace-nowrap">
                {request.assignee ? (
                  <>
                    <Avatar name={request.assignee.full_name} id={request.assignee.id} />
                    {request.assignee.full_name}
                  </>
                ) : (
                  <>
                    <EmptyAvatar />
                    <span className="text-muted-foreground">{t('unassigned')}</span>
                  </>
                )}
              </span>
            </Td>
            <Td>
              <StageProgress status={request.status} />
            </Td>
            <Td>
              <PriorityPill priority={request.priority} />
            </Td>
            <Td>
              <DuePill request={request} />
            </Td>
            <Td className="text-right">
              <RiskPill score={request.risk_score} />
            </Td>
            <Td className="text-muted-foreground whitespace-nowrap">
              <time dateTime={request.last_activity_at} title={dateTime(request.last_activity_at)}>
                {relative(request.last_activity_at)}
              </time>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
