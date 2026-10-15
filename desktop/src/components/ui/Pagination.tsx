import { useTranslation } from 'react-i18next'
import { useFormatters } from '@/lib/format'
import { Button } from './Button'

interface PaginationProps {
  page: number
  size: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, size, total, onPageChange }: PaginationProps) {
  const { t } = useTranslation('admin')
  const { number } = useFormatters()
  const lastPage = Math.max(1, Math.ceil(total / size))
  const from = total === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(page * size, total)

  return (
    <nav aria-label={t('pagination.label')} className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">
        {t('pagination.summary', { from: number(from), to: number(to), total: number(total) })}
      </span>
      <div className="flex gap-2">
        <Button
          disabled={page <= 1}
          onClick={() => {
            onPageChange(page - 1)
          }}
        >
          {t('pagination.previous')}
        </Button>
        <Button
          disabled={page >= lastPage}
          onClick={() => {
            onPageChange(page + 1)
          }}
        >
          {t('pagination.next')}
        </Button>
      </div>
    </nav>
  )
}
