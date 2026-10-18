import { Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { Pill } from '@/components/ui/Pill'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useRequestBoard, useRequests } from '@/lib/api/requests'
import { useFormatters } from '@/lib/format'
import {
  boardFilters,
  DEFAULT_SORT,
  defaultFilters,
  filtersFromSearch,
  isOpenSelection,
  type RequestListParams,
  searchFromFilters,
} from '@/lib/requests/filters'
import { REQUEST_VIEWS, useRequestsViewStore } from '@/stores/requestsView'
import { CreateRequestDialog } from './CreateRequestDialog'
import { RequestBoardView } from './RequestBoardView'
import { RequestFiltersBar } from './RequestFiltersBar'
import { RequestTable } from './RequestTable'

export function RequestsPage() {
  const { t } = useTranslation(['requests', 'nav'])
  const { number } = useFormatters()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const view = useRequestsViewStore((state) => state.view)
  const setView = useRequestsViewStore((state) => state.setView)
  const [creating, setCreating] = useState(false)
  const params = useMemo(() => filtersFromSearch(search), [search])
  const board = useMemo(() => boardFilters(params), [params])
  const list = useRequests(params, view === 'table')
  const boardQuery = useRequestBoard(board, view === 'board')

  const update = useCallback(
    (changes: Partial<RequestListParams>) => {
      setSearch(searchFromFilters({ ...params, page: 1, ...changes }), { replace: true })
    },
    [params, setSearch],
  )

  const clear = useCallback(() => {
    setSearch(searchFromFilters({ ...defaultFilters(), page: 1, size: params.size, sort: DEFAULT_SORT }), {
      replace: true,
    })
  }, [params.size, setSearch])

  const total =
    view === 'table'
      ? list.data?.total
      : boardQuery.data?.columns
          .filter((column) => params.status.length === 0 || params.status.includes(column.status))
          .reduce((sum, column) => sum + column.total, 0)
  const countKey = isOpenSelection(params.status) ? 'count.open' : 'count.any'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav:requests')}
        count={
          total !== undefined && (
            <Pill tone="solid" size="lg">
              <span data-testid="requests-count">{t(countKey, { count: total, value: number(total) })}</span>
            </Pill>
          )
        }
        actions={
          <>
            <SegmentedControl
              label={t('views.label')}
              value={view}
              onChange={setView}
              options={REQUEST_VIEWS.map((option) => ({ value: option, label: t(`views.${option}`) }))}
            />
            <Button
              variant="accent"
              onClick={() => {
                setCreating(true)
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('new')}
            </Button>
          </>
        }
      />

      <RequestFiltersBar params={params} onChange={update} onClear={clear} />

      {view === 'table' ? (
        <RequestTable
          items={list.data?.items}
          loading={list.isPending}
          error={list.isError ? list.error : null}
          onRetry={() => void list.refetch()}
          sort={params.sort}
          onSort={(sort) => {
            update({ sort })
          }}
          footer={
            list.data &&
            list.data.total > 0 && (
              <Pagination
                page={params.page}
                size={params.size}
                total={list.data.total}
                onPageChange={(page) => {
                  update({ page })
                }}
              />
            )
          }
        />
      ) : (
        <RequestBoardView board={boardQuery} filters={board} />
      )}

      {creating && (
        <CreateRequestDialog
          onClose={() => {
            setCreating(false)
          }}
          onCreated={(request) => {
            setCreating(false)
            void navigate(`/requests/${request.id}`)
          }}
        />
      )}
    </div>
  )
}
