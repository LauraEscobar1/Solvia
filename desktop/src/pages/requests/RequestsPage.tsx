import { Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { useTranslateError } from '@/lib/api/errors'
import { useRequests } from '@/lib/api/requests'
import {
  DEFAULT_SORT,
  filtersFromSearch,
  type RequestListParams,
  searchFromFilters,
} from '@/lib/requests/filters'
import { CreateRequestDialog } from './CreateRequestDialog'
import { RequestFiltersBar } from './RequestFiltersBar'
import { RequestTable } from './RequestTable'

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
  const [search, setSearch] = useSearchParams()
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
      <div className="flex flex-wrap items-center justify-end gap-3">
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

      <TableView params={params} onChange={update} />

      {creating && (
        <CreateRequestDialog
          onClose={() => {
            setCreating(false)
          }}
          onCreated={() => {
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}
