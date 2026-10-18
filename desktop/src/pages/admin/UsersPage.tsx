import { Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { selectClass } from '@/components/ui/styles'
import { Table, TableMessage, Td, Th } from '@/components/ui/Table'
import { useSetUserActive, useUsers } from '@/lib/api/admin'
import { useTranslateError } from '@/lib/api/errors'
import { type User, USER_ROLES, type UserRole } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { useSessionStore } from '@/stores/session'
import { UserFormDialog } from './UserFormDialog'

const PAGE_SIZE = 10
const COLUMN_COUNT = 6

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value)
}

export function UsersPage() {
  const { t } = useTranslation(['admin', 'auth', 'common'])
  const translateError = useTranslateError()
  const { dateTime } = useFormatters()
  const currentUserId = useSessionStore((state) => state.user?.id)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [role, setRole] = useState<UserRole | undefined>(undefined)
  const users = useUsers({ page, size: PAGE_SIZE, q, role })
  const setActive = useSetUserActive()
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [toggling, setToggling] = useState<User | null>(null)

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
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchInput value={q} label={t('users.search')} onChange={onSearch} />
          <label className="w-48">
            <span className="sr-only">{t('users.roleFilter')}</span>
            <select
              value={role ?? ''}
              onChange={(event) => {
                const { value } = event.target
                setRole(isUserRole(value) ? value : undefined)
                setPage(1)
              }}
              className={selectClass}
            >
              <option value="">{t('users.allRoles')}</option>
              {USER_ROLES.map((option) => (
                <option key={option} value={option}>
                  {t(`auth:roles.${option}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button
          variant="solid"
          onClick={() => {
            setEditing('new')
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('users.new')}
        </Button>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>{t('users.fullName')}</Th>
            <Th>{t('users.role')}</Th>
            <Th>{t('users.area')}</Th>
            <Th>{t('users.lastLogin')}</Th>
            <Th>{t('status.label')}</Th>
            <Th className="text-right">{t('table.actions')}</Th>
          </tr>
        </thead>
        <tbody>
          {users.isPending && <TableMessage colSpan={COLUMN_COUNT}>{t('table.loading')}</TableMessage>}
          {users.isError && (
            <TableMessage colSpan={COLUMN_COUNT}>{translateError(users.error)}</TableMessage>
          )}
          {users.data?.items.length === 0 && (
            <TableMessage colSpan={COLUMN_COUNT}>{t('table.empty')}</TableMessage>
          )}
          {users.data?.items.map((user) => (
            <tr key={user.id}>
              <Td>
                <p className="font-medium">
                  {user.full_name}
                  {user.id === currentUserId && (
                    <span className="text-muted-foreground ml-2 text-xs">{t('users.you')}</span>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">{user.email}</p>
              </Td>
              <Td>{t(`auth:roles.${user.role}`)}</Td>
              <Td className="text-muted-foreground">{user.area?.name ?? t('users.noArea')}</Td>
              <Td className="text-muted-foreground whitespace-nowrap">
                {user.last_login_at ? dateTime(user.last_login_at) : t('users.never')}
              </Td>
              <Td>
                <StatusBadge tone={user.is_active ? 'success' : 'neutral'}>
                  {user.is_active ? t('status.active') : t('status.inactive')}
                </StatusBadge>
              </Td>
              <Td className="text-right whitespace-nowrap">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(user)
                  }}
                >
                  {t('common:actions.edit')}
                </Button>
                {user.id !== currentUserId && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setToggling(user)
                    }}
                  >
                    {user.is_active
                      ? t('common:actions.deactivate')
                      : t('common:actions.activate')}
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {users.data && (
        <Pagination page={page} size={PAGE_SIZE} total={users.data.total} onPageChange={setPage} />
      )}

      {editing && (
        <UserFormDialog
          user={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}

      {toggling && (
        <ConfirmDialog
          title={toggling.is_active ? t('users.deactivateTitle') : t('users.activateTitle')}
          message={
            toggling.is_active
              ? t('users.deactivateMessage', { name: toggling.full_name })
              : t('users.activateMessage', { name: toggling.full_name })
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
