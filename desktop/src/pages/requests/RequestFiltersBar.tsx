import { ChevronsUpDown, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Chip, CountBadge } from '@/components/ui/Chip'
import { Popover } from '@/components/ui/Popover'
import { SearchInput } from '@/components/ui/SearchInput'
import { MultiSelectPill, PILL_FIELD, SelectPill } from '@/components/ui/SelectPill'
import { compactInputClass } from '@/components/ui/styles'
import { useAreaOptions } from '@/lib/api/admin'
import { useAssignableUsers } from '@/lib/api/requests'
import { REQUEST_PRIORITIES, REQUEST_STATUSES } from '@/lib/api/types'
import {
  activeFilterCount,
  HIGH_RISK_FILTER,
  isOpenSelection,
  OPEN_STATUSES,
  type RequestListParams,
} from '@/lib/requests/filters'
import { useSessionStore } from '@/stores/session'

const DATE_FILTERS = [
  { key: 'received_from', label: 'filters.receivedFrom' },
  { key: 'received_to', label: 'filters.receivedTo' },
  { key: 'completed_from', label: 'filters.completedFrom' },
  { key: 'completed_to', label: 'filters.completedTo' },
] as const

interface RequestFiltersBarProps {
  params: RequestListParams
  onChange: (changes: Partial<RequestListParams>) => void
  onClear: () => void
}

function MoreFilters({ params, onChange }: Omit<RequestFiltersBarProps, 'onClear'>) {
  const { t } = useTranslation('requests')
  const ids = useId()
  const active = [params.overdue, params.sla_status === 'at_risk', params.stalled, ...DATE_FILTERS.map(({ key }) => params[key])].filter(Boolean).length

  return (
    <Popover
      label={t('filters.more')}
      align="end"
      className="w-80"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={`${PILL_FIELD} cursor-pointer font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {t('filters.more')}
          {active > 0 && <CountBadge>{active}</CountBadge>}
          <ChevronsUpDown className="text-muted-foreground absolute top-1/2 right-3.5 size-3.5 -translate-y-1/2" aria-hidden="true" />
        </button>
      )}
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2.5">
          <legend className="text-caption text-muted-foreground mb-2 font-semibold">{t('filters.sla')}</legend>
          <Checkbox
            label={t('filters.overdue')}
            checked={Boolean(params.overdue)}
            onChange={(event) => {
              onChange({ overdue: event.target.checked || undefined })
            }}
          />
          <Checkbox
            label={t('filters.dueSoon')}
            checked={params.sla_status === 'at_risk'}
            onChange={(event) => {
              onChange({ sla_status: event.target.checked ? 'at_risk' : undefined })
            }}
          />
          <Checkbox
            label={t('filters.stalled')}
            checked={Boolean(params.stalled)}
            onChange={(event) => {
              onChange({ stalled: event.target.checked || undefined })
            }}
          />
        </fieldset>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="text-caption text-muted-foreground mb-2 font-semibold">{t('filters.dates')}</legend>
          {DATE_FILTERS.map(({ key, label }) => (
            <label key={key} htmlFor={`${ids}-${key}`} className="text-caption flex flex-col gap-1.5 font-semibold">
              {t(label)}
              <input
                id={`${ids}-${key}`}
                type="date"
                value={params[key] ?? ''}
                onChange={(event) => {
                  onChange({ [key]: event.target.value || undefined })
                }}
                className={compactInputClass}
              />
            </label>
          ))}
        </fieldset>
      </div>
    </Popover>
  )
}

export function RequestFiltersBar({ params, onChange, onClear }: RequestFiltersBarProps) {
  const { t } = useTranslation('requests')
  const role = useSessionStore((state) => state.user?.role)
  const canFilterAssignee = role === 'admin' || role === 'supervisor'
  const areas = useAreaOptions()
  const assignees = useAssignableUsers(undefined, canFilterAssignee)
  const active = activeFilterCount(params)

  const onSearch = useCallback(
    (q: string) => {
      onChange({ q: q || undefined })
    },
    [onChange],
  )

  const prioritySummary =
    params.priority.length === 0
      ? t('filters.all')
      : params.priority.length === 1 && params.priority[0]
        ? t(`priority.${params.priority[0]}`)
        : t('filters.selected', { count: params.priority.length })
  const stageSummary = isOpenSelection(params.status)
    ? t('filters.open')
    : params.status.length === 0
      ? t('filters.all')
      : params.status.length === 1 && params.status[0]
        ? t(`status.${params.status[0]}`)
        : t('filters.selected', { count: params.status.length })

  return (
    <div
      role="group"
      aria-label={t('filters.label')}
      className="glass border-card-edge rounded-card flex flex-wrap items-center gap-2 border p-2 pl-5 shadow-card"
    >
      <span className="text-body mr-1 flex items-center gap-2 font-semibold">
        {t('filters.title')}
        <CountBadge>
          <span aria-hidden="true">{active}</span>
          <span className="sr-only">{t('filters.active', { count: active })}</span>
        </CountBadge>
      </span>
      <SearchInput value={params.q ?? ''} label={t('filters.search')} onChange={onSearch} className="w-44" />
      <SelectPill
        label={t('filters.area')}
        value={params.area_id ?? ''}
        onChange={(event) => {
          onChange({ area_id: event.target.value || undefined })
        }}
        className="w-44"
      >
        <option value="">{t('filters.allAreas')}</option>
        {areas.data?.map((area) => (
          <option key={area.id} value={area.id}>
            {area.name}
          </option>
        ))}
      </SelectPill>
      {canFilterAssignee && (
        <SelectPill
          label={t('filters.assignee')}
          value={params.assignee_id ?? ''}
          onChange={(event) => {
            onChange({ assignee_id: event.target.value || undefined })
          }}
          className="w-52"
        >
          <option value="">{t('filters.anyAssignee')}</option>
          {assignees.data?.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name}
            </option>
          ))}
        </SelectPill>
      )}
      <MultiSelectPill
        label={t('filters.priority')}
        summary={prioritySummary}
        value={params.priority}
        onChange={(priority) => {
          onChange({ priority })
        }}
        options={REQUEST_PRIORITIES.map((value) => ({ value, label: t(`priority.${value}`) }))}
      />
      <MultiSelectPill
        label={t('filters.stage')}
        summary={stageSummary}
        value={params.status}
        onChange={(status) => {
          onChange({ status })
        }}
        presets={[
          { label: t('filters.open'), values: OPEN_STATUSES },
          { label: t('filters.all'), values: [] },
        ]}
        options={REQUEST_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
      />
      <Chip
        selected={params.min_risk === HIGH_RISK_FILTER}
        onClick={() => {
          onChange({ min_risk: params.min_risk === HIGH_RISK_FILTER ? undefined : HIGH_RISK_FILTER })
        }}
      >
        {t('filters.onlyRisky')}
      </Chip>
      <MoreFilters params={params} onChange={onChange} />
      {active > 0 && (
        <Button variant="ghost" className="ml-auto" onClick={onClear}>
          <X className="size-4" aria-hidden="true" />
          {t('filters.clear')}
        </Button>
      )}
    </div>
  )
}
