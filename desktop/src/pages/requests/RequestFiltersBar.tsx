import { X } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { inputClass, selectClass } from '@/components/ui/styles'
import { useAreaOptions } from '@/lib/api/admin'
import { useAssignableUsers } from '@/lib/api/requests'
import {
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  type RequestPriority,
  type RequestStatus,
} from '@/lib/api/types'
import { hasActiveFilters, type RequestListParams } from '@/lib/requests/filters'
import { useSessionStore } from '@/stores/session'

interface RequestFiltersBarProps {
  params: RequestListParams
  onChange: (changes: Partial<RequestListParams>) => void
  onClear: () => void
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function Chip({
  selected,
  label,
  onClick,
}: {
  selected: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={[
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        selected
          ? 'bg-primary-soft text-primary border-primary'
          : 'text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

export function RequestFiltersBar({ params, onChange, onClear }: RequestFiltersBarProps) {
  const { t } = useTranslation('requests')
  const role = useSessionStore((state) => state.user?.role)
  const canFilterAssignee = role === 'admin' || role === 'supervisor'
  const areas = useAreaOptions()
  const assignees = useAssignableUsers(undefined, canFilterAssignee)

  const onSearch = useCallback(
    (q: string) => {
      onChange({ q: q || undefined })
    },
    [onChange],
  )

  return (
    <div className="bg-surface flex flex-col gap-3 rounded-xl border p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={params.q ?? ''} label={t('filters.search')} onChange={onSearch} />
        <label className="w-48">
          <span className="sr-only">{t('filters.area')}</span>
          <select
            value={params.area_id ?? ''}
            onChange={(event) => {
              onChange({ area_id: event.target.value || undefined })
            }}
            className={selectClass}
          >
            <option value="">{t('filters.allAreas')}</option>
            {areas.data?.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>
        {canFilterAssignee && (
          <label className="w-52">
            <span className="sr-only">{t('filters.assignee')}</span>
            <select
              value={params.assignee_id ?? ''}
              onChange={(event) => {
                onChange({ assignee_id: event.target.value || undefined })
              }}
              className={selectClass}
            >
              <option value="">{t('filters.anyAssignee')}</option>
              {assignees.data?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={Boolean(params.overdue)}
            onChange={(event) => {
              onChange({ overdue: event.target.checked || undefined })
            }}
          />
          {t('filters.overdue')}
        </label>
        {hasActiveFilters(params) && (
          <Button variant="ghost" onClick={onClear}>
            <X className="size-4" aria-hidden="true" />
            {t('filters.clear')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="text-muted-foreground mr-2 float-left text-xs font-medium">
            {t('filters.status')}
          </legend>
          {REQUEST_STATUSES.map((status: RequestStatus) => (
            <Chip
              key={status}
              label={t(`status.${status}`)}
              selected={params.status.includes(status)}
              onClick={() => {
                onChange({ status: toggle(params.status, status) })
              }}
            />
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="text-muted-foreground mr-2 float-left text-xs font-medium">
            {t('filters.priority')}
          </legend>
          {REQUEST_PRIORITIES.map((priority: RequestPriority) => (
            <Chip
              key={priority}
              label={t(`priority.${priority}`)}
              selected={params.priority.includes(priority)}
              onClick={() => {
                onChange({ priority: toggle(params.priority, priority) })
              }}
            />
          ))}
        </fieldset>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-medium">{t('filters.receivedFrom')}</span>
            <input
              type="date"
              value={params.received_from ?? ''}
              onChange={(event) => {
                onChange({ received_from: event.target.value || undefined })
              }}
              className={`${inputClass} w-auto py-1`}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-medium">{t('filters.receivedTo')}</span>
            <input
              type="date"
              value={params.received_to ?? ''}
              onChange={(event) => {
                onChange({ received_to: event.target.value || undefined })
              }}
              className={`${inputClass} w-auto py-1`}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
