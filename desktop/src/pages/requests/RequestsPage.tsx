import { LayoutGrid, Plus, Rows3 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { useTranslateError } from '@/lib/api/errors'
import { useRequests } from '@/lib/api/requests'
import {
  boardFilters,
  DEFAULT_SORT,
  filtersFromSearch,
  type RequestListParams,
  searchFromFilters,
} from '@/lib/requests/filters'
import { REQUEST_VIEWS, type RequestView, useRequestsViewStore } from '@/stores/requestsView'
import { CreateRequestDialog } from './CreateRequestDialog'
import { RequestBoardView } from './RequestBoardView'
import { RequestFiltersBar } from './RequestFiltersBar'
import { RequestTable } from './RequestTable'

const VIEW_ICONS = { table: Rows3, board: LayoutGrid } satisfies Record<RequestView, unknown>

function ViewToggle() {
  const { t } = useTranslation('requests')
  const view = useRequestsViewStore((state) => state.view)
  const setView = useRequestsViewStore((state) => state.setView)

  return (
    <div
      role="radiogroup"
      aria-label={t('views.label')}
      className="bg-surface-muted flex items-center gap-0.5 rounded-lg border p-0.5"
    >
      {REQUEST_VIEWS.map((option) => {
        const Icon = VIEW_ICONS[option]
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={view === option}
            onClick={() => {
              setView(option)
            }}
            className={[
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
              view === option
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Icon className="size-4" aria-hidden="true" />
            {t(`views.${option}`)}
          </button>
        )
      })}
    </div>
  )
}

function TableView({
  params,
  onChange,
}: {
  params: RequestListParams
  onChange: (changes: Partial<RequestListParams>) => void
}) {
  const translateError = useTranslateError()
  const requests = useRequests(params)

  return (
    <>
      <RequestTable
        items={requests.data?.items}
        loading={requests.isPending}
        error={requests.isError ? translateError(requests.error) : null}
        sort={params.sort}
        onSort={(sort) => {
          onChange({ sort })
        }}
      />
      {requests.data && (
        <Pagination
          page={params.page}
          size={params.size}
          total={requests.data.total}
          onPageChange={(page) => {
            onChange({ page })
          }}
        />
      )}
    </>
  )
}

export function RequestsPage() {
  const { t } = useTranslation('requests')
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const view = useRequestsViewStore((state) => state.view)
  const [creating, setCreating] = useState(false)
  const params = useMemo(() => filtersFromSearch(search), [search])

  const update = useCallback(
    (changes: Partial<RequestListParams>) => {
      const next = { ...params, page: 1, ...changes }
      setSearch(searchFromFilters(next), { replace: true })
    },
    [params, setSearch],
  )

  const clear = useCallback(() => {
    setSearch(searchFromFilters({ status: [], priority: [], page: 1, size: params.size, sort: DEFAULT_SORT }), {
      replace: true,
    })
  }, [params.size, setSearch])

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle />
        <Button
          variant="primary"
          onClick={() => {
            setCreating(true)
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('new')}
        </Button>
      </div>

      <RequestFiltersBar params={params} onChange={update} onClear={clear} />

      {view === 'table' ? (
        <TableView params={params} onChange={update} />
      ) : (
        <RequestBoardView filters={boardFilters(params)} />
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
