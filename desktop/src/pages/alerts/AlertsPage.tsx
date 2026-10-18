import { BellOff, CheckCheck, ChevronsUpDown, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { CountBadge } from '@/components/ui/Chip'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { Popover } from '@/components/ui/Popover'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { PILL_FIELD } from '@/components/ui/SelectPill'
import { EmptyState, InlineAlert, QueryState, SkeletonRows } from '@/components/ui/States'
import {
  ALERT_QUICK_FILTERS,
  alertParamsFromSearch,
  DEFAULT_ALERT_STATE,
  moreFilterCount,
  QUICK_FILTER_PARAMS,
  quickFilterOf,
  searchFromAlertParams,
} from '@/lib/alerts/filters'
import { useAlerts, useMarkAllAlertsRead } from '@/lib/api/alerts'
import { useTranslateError } from '@/lib/api/errors'
import { ALERT_SEVERITIES, ALERT_TYPES, type AlertListParams, type AlertState } from '@/lib/api/types'
import { AlertList } from './AlertList'

type StateChoice = AlertState | 'any'
type ReadChoice = 'any' | 'unread' | 'read'

const READ_VALUES: Record<ReadChoice, boolean | undefined> = { any: undefined, unread: false, read: true }

function readChoice(value: boolean | undefined): ReadChoice {
  if (value === undefined) return 'any'
  return value ? 'read' : 'unread'
}

function toggle<T>(values: readonly T[], value: T, checked: boolean): T[] {
  return checked ? [...values, value] : values.filter((item) => item !== value)
}

interface FiltersProps {
  params: AlertListParams
  onChange: (changes: Partial<AlertListParams>) => void
}

function MoreFilters({ params, onChange }: FiltersProps) {
  const { t } = useTranslation('alerts')
  const active = moreFilterCount(params)
  const legend = 'text-caption text-muted-foreground mb-2 font-semibold'

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
        <div className="flex flex-col gap-2">
          <span className={legend}>{t('filters.state')}</span>
          <SegmentedControl<StateChoice>
            label={t('filters.state')}
            variant="raised"
            value={params.state ?? 'any'}
            onChange={(value) => {
              onChange({ state: value === 'any' ? undefined : value })
            }}
            options={[
              { value: 'open', label: t('filters.open') },
              { value: 'resolved', label: t('filters.resolved') },
              { value: 'any', label: t('filters.anyState') },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className={legend}>{t('filters.read')}</span>
          <SegmentedControl<ReadChoice>
            label={t('filters.read')}
            variant="raised"
            value={readChoice(params.is_read)}
            onChange={(value) => {
              onChange({ is_read: READ_VALUES[value] })
            }}
            options={[
              { value: 'any', label: t('filters.anyRead') },
              { value: 'unread', label: t('filters.unread') },
              { value: 'read', label: t('filters.readOnly') },
            ]}
          />
        </div>
        <fieldset className="flex flex-col gap-2.5">
          <legend className={legend}>{t('filters.severity')}</legend>
          {ALERT_SEVERITIES.map((severity) => (
            <Checkbox
              key={severity}
              label={t(`severity.${severity}`)}
              checked={params.severity.includes(severity)}
              onChange={(event) => {
                onChange({ severity: toggle(params.severity, severity, event.target.checked) })
              }}
            />
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-2.5">
          <legend className={legend}>{t('filters.type')}</legend>
          {ALERT_TYPES.map((type) => (
            <Checkbox
              key={type}
              label={t(`types.${type}`)}
              checked={params.type.includes(type)}
              onChange={(event) => {
                onChange({ type: toggle(params.type, type, event.target.checked) })
              }}
            />
          ))}
        </fieldset>
      </div>
    </Popover>
  )
}

export function AlertsPage() {
  const { t } = useTranslation(['alerts', 'nav'])
  const translateError = useTranslateError()
  const [search, setSearch] = useSearchParams()
  const params = useMemo(() => alertParamsFromSearch(search), [search])
  const alerts = useAlerts(params)
  const markAll = useMarkAllAlertsRead()
  const [marked, setMarked] = useState<number | null>(null)
  const quick = quickFilterOf(params)
  const filtered = quick !== 'all' || moreFilterCount(params) > 0

  const update = useCallback(
    (changes: Partial<AlertListParams>) => {
      setSearch(searchFromAlertParams({ ...params, page: 1, ...changes }), { replace: true })
    },
    [params, setSearch],
  )

  return (
    <div className="max-w-alerts mx-auto flex w-full flex-col gap-6">
      <PageHeader
        title={t('nav:alerts')}
        actions={
          <>
            <SegmentedControl
              label={t('quick.label')}
              value={quick}
              onChange={(value) => {
                update(QUICK_FILTER_PARAMS[value])
              }}
              options={ALERT_QUICK_FILTERS.map((value) => ({ value, label: t(`quick.${value}`) }))}
            />
            <MoreFilters params={params} onChange={update} />
            <Button
              loading={markAll.isPending}
              onClick={() => {
                markAll.mutate(undefined, {
                  onSuccess: (result) => {
                    setMarked(result.count)
                  },
                })
              }}
            >
              {!markAll.isPending && <CheckCheck className="size-4" aria-hidden="true" />}
              {t('markAllRead')}
            </Button>
          </>
        }
      />

      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          className="-mt-2 self-start"
          onClick={() => {
            update({ ...QUICK_FILTER_PARAMS.all, state: DEFAULT_ALERT_STATE, type: [] })
          }}
        >
          <X className="size-4" aria-hidden="true" />
          {t('filters.clear')}
        </Button>
      )}
      {marked !== null && <InlineAlert tone="success">{t('markedAll', { count: marked })}</InlineAlert>}
      {markAll.isError && <InlineAlert tone="error">{translateError(markAll.error)}</InlineAlert>}

      <QueryState
        query={alerts}
        loading={<SkeletonRows rows={5} />}
        isEmpty={alerts.data?.items.length === 0}
        empty={<EmptyState icon={BellOff} title={t('empty')} />}
      >
        {alerts.data && (
          <div className="flex flex-col gap-4">
            <AlertList alerts={alerts.data.items} />
            <Pagination
              page={params.page}
              size={params.size}
              total={alerts.data.total}
              onPageChange={(page) => {
                update({ page })
              }}
            />
          </div>
        )}
      </QueryState>
    </div>
  )
}
