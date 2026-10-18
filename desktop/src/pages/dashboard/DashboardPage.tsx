import { useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { SelectPill } from '@/components/ui/SelectPill'
import { useAreaOptions } from '@/lib/api/admin'
import { dashboardKeys, useDashboardSummary } from '@/lib/api/dashboard'
import { requestKeys } from '@/lib/api/requests'
import { useFormatters } from '@/lib/format'
import { useSessionStore } from '@/stores/session'
import { CreateRequestDialog } from '../requests/CreateRequestDialog'
import { AIBanner } from './AIBanner'
import { useDashboardQuery } from './dashboardQuery'
import { MyRequests } from './MyRequests'
import { RiskSpotlight } from './RiskSpotlight'
import { StatusOverview } from './StatusOverview'

function AreaFilter({ value, onChange }: { value?: string; onChange: (areaId?: string) => void }) {
  const { t } = useTranslation('dashboard')
  const areas = useAreaOptions()
  return (
    <SelectPill
      label={t('filters.area')}
      value={value ?? ''}
      onChange={(event) => {
        onChange(event.target.value || undefined)
      }}
      className="min-w-56"
    >
      <option value="">{t('filters.allAreas')}</option>
      {areas.data?.map((area) => (
        <option key={area.id} value={area.id}>
          {area.name}
        </option>
      ))}
    </SelectPill>
  )
}

export function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'requests'])
  const { dateTime } = useFormatters()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useSessionStore((state) => state.user)
  const [query, setQuery] = useDashboardQuery()
  const [creating, setCreating] = useState(false)
  const isAdmin = user?.role === 'admin'
  const oversees = isAdmin || user?.role === 'supervisor'
  const areaId = isAdmin ? query.area_id : undefined
  const summaryQuery = { area_id: areaId }
  const summary = useDashboardSummary(summaryQuery)
  const firstName = user?.full_name.trim().split(/\s+/)[0] ?? ''
  const attention = summary.data?.high_risk ?? 0

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
    void queryClient.invalidateQueries({ queryKey: requestKeys.all })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-greeting">
            {t('greeting', { name: firstName })} <span aria-hidden="true">{t('greetingEmoji')}</span>
          </h1>
          <p className="text-body text-muted-foreground flex items-center gap-2">
            <span aria-hidden="true" className="bg-accent-line size-2 shrink-0 rounded-full" />
            <span>
              <Trans
                i18nKey="attention"
                ns="dashboard"
                count={attention}
                components={{ brand: <strong className="text-foreground font-semibold" />, emphasis: <strong className="text-foreground font-semibold" /> }}
              />
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="accent"
            onClick={() => {
              setCreating(true)
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('requests:new')}
          </Button>
          {isAdmin && (
            <AreaFilter
              value={query.area_id}
              onChange={(area_id) => {
                setQuery({ area_id })
              }}
            />
          )}
          <IconButton
            variant="glass"
            icon={RefreshCw}
            label={
              summary.dataUpdatedAt > 0
                ? t('refreshedAt', { time: dateTime(summary.dataUpdatedAt, { timeStyle: 'short' }) })
                : t('refresh')
            }
            tooltipAlign="end"
            disabled={summary.isFetching}
            onClick={refresh}
          />
        </div>
      </header>

      {oversees && <AIBanner areaId={areaId} />}
      <StatusOverview summary={summary} query={summaryQuery} scoped={!oversees} />
      <RiskSpotlight areaId={areaId} />
      {!oversees && <MyRequests />}

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
