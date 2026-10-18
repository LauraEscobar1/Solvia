import {
  CircleAlert,
  CircleCheck,
  Info,
  LoaderCircle,
  type LucideIcon,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTranslateError } from '@/lib/api/errors'
import { Button } from './Button'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`bg-surface-sunken animate-pulse rounded-inner ${className}`} />
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-6" />
      ))}
    </div>
  )
}

export function LoadingState({ label, skeleton }: { label?: string; skeleton?: ReactNode }) {
  const { t } = useTranslation()
  const text = label ?? t('states.loading')
  return (
    <div role="status" aria-label={text} className="flex flex-col gap-3">
      {skeleton ?? (
        <span className="text-body text-muted-foreground inline-flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          {text}
        </span>
      )}
    </div>
  )
}

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ icon: Icon = Info, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-2 text-center ${compact ? 'py-6' : 'py-12'}`}
    >
      <span className="bg-surface-sunken text-muted-foreground mb-1 inline-flex size-10 items-center justify-center rounded-full">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="text-body font-semibold">{title}</p>
      {description && <p className="text-caption text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  error: unknown
  title?: string
  onRetry?: () => void
  compact?: boolean
}

export function ErrorState({ error, title, onRetry, compact = false }: ErrorStateProps) {
  const { t } = useTranslation()
  const translateError = useTranslateError()
  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-2 text-center ${compact ? 'py-6' : 'py-12'}`}
    >
      <span className="bg-danger-soft text-danger-soft-foreground mb-1 inline-flex size-10 items-center justify-center rounded-full">
        <TriangleAlert className="size-4" aria-hidden="true" />
      </span>
      <p className="text-body font-semibold">{title ?? t('states.error')}</p>
      <p className="text-caption text-muted-foreground max-w-sm">{translateError(error)}</p>
      {onRetry && (
        <Button size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {t('actions.retry')}
        </Button>
      )}
    </div>
  )
}

type AlertTone = 'error' | 'success' | 'info' | 'warning'

const ALERT_TONES: Record<AlertTone, { className: string; icon: LucideIcon }> = {
  error: { className: 'bg-danger-soft text-danger-soft-foreground', icon: CircleAlert },
  success: { className: 'bg-accent-soft text-accent-text', icon: CircleCheck },
  info: { className: 'bg-neutral-soft text-neutral-soft-foreground', icon: Info },
  warning: { className: 'bg-warning-soft text-warning-soft-foreground', icon: TriangleAlert },
}

export function InlineAlert({ tone, children }: { tone: AlertTone; children: ReactNode }) {
  const { className, icon: Icon } = ALERT_TONES[tone]
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`text-body rounded-inner flex items-start gap-2 px-4 py-3 font-medium ${className}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

export interface QueryLike {
  data?: unknown
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

interface QueryStateProps {
  query: QueryLike
  isEmpty?: boolean
  empty?: ReactNode
  loading?: ReactNode
  compact?: boolean
  children: ReactNode
}

export function QueryState({ query, isEmpty = false, empty, loading, compact, children }: QueryStateProps) {
  if (query.isPending) return <LoadingState skeleton={loading} />
  if (query.isError && query.data === undefined) {
    return (
      <ErrorState
        error={query.error}
        compact={compact}
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  }
  if (isEmpty && empty) return <>{empty}</>
  return <>{children}</>
}
