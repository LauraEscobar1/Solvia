import { CheckCheck } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { alertParamsFromSearch, searchFromAlertParams } from '@/lib/alerts/filters'
import { useAlerts, useMarkAllAlertsRead } from '@/lib/api/alerts'
import { useTranslateError } from '@/lib/api/errors'
import {
  ALERT_SEVERITIES,
  ALERT_TYPES,
  type AlertListParams,
  type AlertState,
} from '@/lib/api/types'
import { AlertList } from './AlertList'

interface Option<T> {
  value: T
  label: string
}

function Segmented<T>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <div className="bg-surface-muted flex items-center gap-0.5 rounded-lg border p-0.5">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            onClick={() => {
              onChange(option.value)
            }}
            className={[
              'rounded-md px-2.5 py-1 text-xs transition-colors',
              option.value === value
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Chips<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: Option<T>[]
  selected: T[]
  onChange: (values: T[]) => void
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="text-muted-foreground float-left mr-2 text-xs font-medium">{label}</legend>
      {options.map((option) => {
        const active = selected.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onChange(
                active
                  ? selected.filter((value) => value !== option.value)
                  : [...selected, option.value],
              )
            }}
            className={[
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-primary-soft text-primary border-primary'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </fieldset>
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

  const update = useCallback(
    (changes: Partial<AlertListParams>) => {
      setSearch(searchFromAlertParams({ ...params, page: 1, ...changes }), { replace: true })
    },
    [params, setSearch],
  )

  const stateOptions: Option<AlertState | undefined>[] = [
    { value: 'open', label: t('filters.open') },
    { value: 'resolved', label: t('filters.resolved') },
    { value: undefined, label: t('filters.anyState') },
  ]
  const readOptions: Option<boolean | undefined>[] = [
    { value: undefined, label: t('filters.anyRead') },
    { value: false, label: t('filters.unread') },
    { value: true, label: t('filters.readOnly') },
  ]

  return (
    <div className="mx-auto flex max-w-alerts flex-col gap-4">
      <PageHeader title={t('nav:alerts')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        <div className="flex items-center gap-3">
          {marked !== null && (
            <span role="status" className="text-success text-sm">
              {t('markedAll', { count: marked })}
            </span>
          )}
          <Button
            disabled={markAll.isPending}
            onClick={() => {
              markAll.mutate(undefined, {
                onSuccess: (result) => {
                  setMarked(result.count)
                },
              })
            }}
          >
            <CheckCheck className="size-4" aria-hidden="true" />
            {t('markAllRead')}
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label={t('filters.label')}
        className="bg-surface flex flex-col gap-3 rounded-xl border p-4 shadow-xs"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Segmented
            label={t('filters.state')}
            options={stateOptions}
            value={params.state}
            onChange={(state) => {
              update({ state })
            }}
          />
          <Segmented
            label={t('filters.read')}
            options={readOptions}
            value={params.is_read}
            onChange={(isRead) => {
              update({ is_read: isRead })
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Chips
            label={t('filters.type')}
            options={ALERT_TYPES.map((value) => ({ value, label: t(`types.${value}`) }))}
            selected={params.type}
            onChange={(type) => {
              update({ type })
            }}
          />
          <Chips
            label={t('filters.severity')}
            options={ALERT_SEVERITIES.map((value) => ({ value, label: t(`severity.${value}`) }))}
            selected={params.severity}
            onChange={(severity) => {
              update({ severity })
            }}
          />
        </div>
      </div>

      {alerts.isPending ? (
        <p role="status" className="text-muted-foreground py-8 text-center text-sm">
          {t('loading')}
        </p>
      ) : alerts.isError ? (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">
          {translateError(alerts.error)}
        </p>
      ) : alerts.data.items.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          {t('empty')}
        </p>
      ) : (
        <>
          <AlertList alerts={alerts.data.items} />
          <Pagination
            page={params.page}
            size={params.size}
            total={alerts.data.total}
            onPageChange={(page) => {
              update({ page })
            }}
          />
        </>
      )}
    </div>
  )
}
