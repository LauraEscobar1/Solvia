import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { BUTTON_BASE } from './buttonStyles'

export interface Breadcrumb {
  label: string
  to?: string
}

interface PageHeaderProps {
  title: ReactNode
  size?: 'title' | 'title-detail'
  count?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  breadcrumbs?: Breadcrumb[]
  back?: { to: string; label: string }
}

export function PageHeader({
  title,
  size = 'title',
  count,
  eyebrow,
  actions,
  breadcrumbs,
  back,
}: PageHeaderProps) {
  const { t } = useTranslation()

  return (
    <header className="flex flex-col gap-4">
      {(back ?? breadcrumbs) && (
        <nav aria-label={t('breadcrumbs')} className="flex items-center gap-3">
          {back && (
            <Link
              to={back.to}
              aria-label={back.label}
              className={`${BUTTON_BASE} glass border-card-edge size-10 border text-foreground hover:bg-surface-sunken`}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          )}
          {breadcrumbs && (
            <ol className="text-body flex items-center gap-2 font-semibold">
              {breadcrumbs.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                  {index > 0 && (
                    <span aria-hidden="true" className="text-subtle-foreground">
                      /
                    </span>
                  )}
                  {crumb.to ? (
                    <Link to={crumb.to} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </nav>
      )}
      {eyebrow && <div className="flex flex-wrap items-center gap-2">{eyebrow}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <h1 className={size === 'title' ? 'text-title' : 'text-title-detail'}>{title}</h1>
          {count}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
