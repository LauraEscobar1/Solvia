import { Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { Table, TableMessage, Td, Th } from '@/components/ui/Table'
import { useAreas, useSetAreaActive } from '@/lib/api/admin'
import { useTranslateError } from '@/lib/api/errors'
import type { Area } from '@/lib/api/types'
import { AreaFormDialog } from './AreaFormDialog'

const PAGE_SIZE = 10
const COLUMN_COUNT = 4

export function AreasPage() {
  const { t } = useTranslation(['admin', 'common'])
  const translateError = useTranslateError()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const areas = useAreas({ page, size: PAGE_SIZE, q })
  const setActive = useSetAreaActive()
  const [editing, setEditing] = useState<Area | 'new' | null>(null)
  const [toggling, setToggling] = useState<Area | null>(null)

  const onSearch = useCallback((value: string) => {
    setQ(value)
    setPage(1)
  }, [])

  const closeToggle = () => {
    setToggling(null)
    setActive.reset()
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={q} label={t('areas.search')} onChange={onSearch} />
        <Button
          variant="solid"
          onClick={() => {
            setEditing('new')
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('areas.new')}
        </Button>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>{t('areas.name')}</Th>
            <Th>{t('areas.manager')}</Th>
            <Th>{t('status.label')}</Th>
            <Th className="text-right">{t('table.actions')}</Th>
          </tr>
        </thead>
        <tbody>
          {areas.isPending && <TableMessage colSpan={COLUMN_COUNT}>{t('table.loading')}</TableMessage>}
          {areas.isError && (
            <TableMessage colSpan={COLUMN_COUNT}>{translateError(areas.error)}</TableMessage>
          )}
          {areas.data?.items.length === 0 && (
            <TableMessage colSpan={COLUMN_COUNT}>{t('table.empty')}</TableMessage>
          )}
          {areas.data?.items.map((area) => (
            <tr key={area.id}>
              <Td>
                <p className="font-medium">{area.name}</p>
                {area.description && (
                  <p className="text-muted-foreground line-clamp-1 text-xs">{area.description}</p>
                )}
              </Td>
              <Td className="text-muted-foreground">
                {area.manager?.full_name ?? t('areas.noManager')}
              </Td>
              <Td>
                <StatusBadge tone={area.is_active ? 'success' : 'neutral'}>
                  {area.is_active ? t('status.active') : t('status.inactive')}
                </StatusBadge>
              </Td>
              <Td className="text-right whitespace-nowrap">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(area)
                  }}
                >
                  {t('common:actions.edit')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setToggling(area)
                  }}
                >
                  {area.is_active ? t('common:actions.deactivate') : t('common:actions.activate')}
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {areas.data && (
        <Pagination page={page} size={PAGE_SIZE} total={areas.data.total} onPageChange={setPage} />
      )}

      {editing && (
        <AreaFormDialog
          area={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}

      {toggling && (
        <ConfirmDialog
          title={toggling.is_active ? t('areas.deactivateTitle') : t('areas.activateTitle')}
          message={
            toggling.is_active
              ? t('areas.deactivateMessage', { name: toggling.name })
              : t('areas.activateMessage', { name: toggling.name })
          }
          confirmLabel={
            toggling.is_active ? t('common:actions.deactivate') : t('common:actions.activate')
          }
          variant={toggling.is_active ? 'danger' : 'solid'}
          pending={setActive.isPending}
          error={setActive.error ? translateError(setActive.error) : null}
          onCancel={closeToggle}
          onConfirm={() => {
            setActive.mutate(
              { id: toggling.id, active: !toggling.is_active },
              { onSuccess: closeToggle },
            )
          }}
        />
      )}
    </section>
  )
}
