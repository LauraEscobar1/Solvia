import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  DueDate,
  PriorityBadge,
  RequestStatusBadge,
  SlaFlags,
} from '@/components/requests/RequestBadges'
import { RiskBadge } from '@/components/ai/AIParts'
import { Table, TableMessage, Td, Th } from '@/components/ui/Table'
import type { RequestSummary } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import type { SortField } from '@/lib/requests/filters'

const COLUMNS: SortField[] = [
  'code',
  'title',
  'area',
  'assignee',
  'priority',
  'status',
  'due_at',
  'risk_score',
  'last_activity_at',
]

type ColumnKey =
  | 'code'
  | 'title'
  | 'area'
  | 'assignee'
  | 'priority'
  | 'status'
  | 'due_at'
  | 'risk_score'
  | 'last_activity_at'

interface RequestTableProps {
  items: RequestSummary[] | undefined
  loading: boolean
  error: string | null
  sort: string
  onSort: (sort: string) => void
}

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: ColumnKey
  sort: string
  onSort: (sort: string) => void
}) {
  const { t } = useTranslation('requests')
  const active = sort.replace(/^-/, '') === column
  const descending = sort.startsWith('-')
  const Icon = !active ? ArrowUpDown : descending ? ArrowDown : ArrowUp
  const label = t(`columns.${column}`)

  return (
    <Th>
      <button
        type="button"
        aria-label={t('sortBy', { column: label })}
        aria-sort={active ? (descending ? 'descending' : 'ascending') : undefined}
        onClick={() => {
          onSort(active && !descending ? `-${column}` : column)
        }}
        className="hover:text-foreground inline-flex items-center gap-1 uppercase"
      >
        {label}
        <Icon className="size-3" aria-hidden="true" />
      </button>
    </Th>
  )
}

export function RequestTable({ items, loading, error, sort, onSort }: RequestTableProps) {
  const { t } = useTranslation('requests')
  const { relative, dateTime } = useFormatters()

  return (
    <Table>
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <SortHeader key={column} column={column as ColumnKey} sort={sort} onSort={onSort} />
          ))}
        </tr>
      </thead>
      <tbody>
        {loading && !items && <TableMessage colSpan={COLUMNS.length}>{t('loading')}</TableMessage>}
        {error && <TableMessage colSpan={COLUMNS.length}>{error}</TableMessage>}
        {items?.length === 0 && <TableMessage colSpan={COLUMNS.length}>{t('empty')}</TableMessage>}
        {items?.map((request) => (
          <tr
            key={request.id}
            className={
              request.sla_status === 'overdue'
                ? 'bg-danger-soft/40'
                : request.sla_status === 'at_risk'
                  ? 'bg-warning-soft/40'
                  : undefined
            }
          >
            <Td className="font-mono text-xs whitespace-nowrap">
              <Link to={`/requests/${request.id}`} className="text-primary hover:underline">
                {request.code}
              </Link>
            </Td>
            <Td>
              <div className="flex items-center gap-2">
                <span className="line-clamp-1 font-medium">{request.title}</span>
                <SlaFlags request={request} />
              </div>
            </Td>
            <Td className="text-muted-foreground">{request.area.name}</Td>
            <Td className="text-muted-foreground">
              {request.assignee?.full_name ?? t('unassigned')}
            </Td>
            <Td>
              <PriorityBadge priority={request.priority} />
            </Td>
            <Td>
              <RequestStatusBadge status={request.status} />
            </Td>
            <Td>
              <DueDate request={request} />
            </Td>
            <Td>
              <RiskBadge score={request.risk_score} />
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
