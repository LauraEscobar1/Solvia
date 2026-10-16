import { RefreshCw } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { useTranslateError } from '@/lib/api/errors'

export interface BlockState {
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

interface DashboardBlockProps {
  title: string
  description?: string
  state: BlockState
  isEmpty?: boolean
  emptyLabel?: string
  skeleton?: ReactNode
  className?: string
  children?: ReactNode
}

export function BlockSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="bg-surface-muted h-6 animate-pulse rounded-md" />
      ))}
    </div>
  )
}

export function DashboardBlock({
  title,
  description,
  state,
  isEmpty = false,
  emptyLabel,
  skeleton,
  className = '',
  children,
}: DashboardBlockProps) {
  const { t } = useTranslation(['dashboard', 'common'])
  const translateError = useTranslateError()
  const titleId = useId()

  let content: ReactNode = children
  if (state.isPending) {
    content = (
      <div role="status" aria-label={t('block.loading')}>
        {skeleton ?? <BlockSkeleton />}
      </div>
    )
  } else if (state.isError) {
    content = (
      <div role="alert" className="flex flex-col items-start gap-3 text-sm">
        <p className="text-danger">
          {t('block.error')} {translateError(state.error)}
        </p>
        <Button onClick={() => void state.refetch()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {t('common:actions.retry')}
        </Button>
      </div>
    )
  } else if (isEmpty) {
    content = (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {emptyLabel ?? t('block.empty')}
      </p>
    )
  }

  return (
    <section
      aria-labelledby={titleId}
      className={`bg-surface flex flex-col gap-4 rounded-xl border p-5 shadow-xs ${className}`}
    >
      <header>
        <h3 id={titleId} className="text-sm font-semibold">
          {title}
        </h3>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </header>
      {content}
    </section>
  )
}
