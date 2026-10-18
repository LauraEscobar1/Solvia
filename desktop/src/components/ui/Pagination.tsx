import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useFormatters } from '@/lib/format'
import { IconButton } from './IconButton'

interface PaginationProps {
  page: number
  size: number
  total: number
  onPageChange: (page: number) => void
}

const ELLIPSIS = 'ellipsis'

function pageItems(page: number, last: number): (number | typeof ELLIPSIS)[] {
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1)
  const middle = [page - 1, page, page + 1].filter((item) => item > 1 && item < last)
  const items: (number | typeof ELLIPSIS)[] = [1]
  if ((middle[0] ?? last) > 2) items.push(ELLIPSIS)
  items.push(...middle)
  if ((middle.at(-1) ?? 1) < last - 1) items.push(ELLIPSIS)
  items.push(last)
  return items
}

export function Pagination({ page, size, total, onPageChange }: PaginationProps) {
  const { t } = useTranslation()
  const { number } = useFormatters()
  const lastPage = Math.max(1, Math.ceil(total / size))
  const shown = total === 0 ? 0 : Math.min(page * size, total) - (page - 1) * size

  return (
    <nav
      aria-label={t('pagination.label')}
      className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
    >
      <span className="text-caption text-muted-foreground font-semibold">
        {t('pagination.showing', { count: number(shown), total: number(total) })}
      </span>
      <div className="flex items-center gap-1.5">
        <IconButton
          label={t('pagination.previous')}
          icon={ArrowLeft}
          variant="outline"
          size="sm"
          tooltip={false}
          disabled={page <= 1}
          onClick={() => {
            onPageChange(page - 1)
          }}
        />
        {pageItems(page, lastPage).map((item, index) =>
          item === ELLIPSIS ? (
            <span key={`gap-${index}`} aria-hidden="true" className="text-subtle-foreground px-1">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={t('pagination.page', { page: item })}
              aria-current={item === page ? 'page' : undefined}
              onClick={() => {
                onPageChange(item)
              }}
              className={[
                'text-caption inline-flex size-8 items-center justify-center rounded-full font-semibold tabular-nums',
                item === page
                  ? 'bg-solid text-solid-foreground'
                  : 'border-divider bg-control text-foreground hover:bg-surface-sunken border',
              ].join(' ')}
            >
              {number(item)}
            </button>
          ),
        )}
        <IconButton
          label={t('pagination.next')}
          icon={ArrowRight}
          variant="outline"
          size="sm"
          tooltip={false}
          disabled={page >= lastPage}
          onClick={() => {
            onPageChange(page + 1)
          }}
        />
      </div>
    </nav>
  )
}
