import { type ElementType, type HTMLAttributes, type ReactNode, useId } from 'react'

export type CardVariant = 'glass' | 'feature' | 'hero' | 'slate' | 'raised'

const VARIANT_CLASSES: Record<CardVariant, string> = {
  glass: 'glass border-card-edge rounded-card border shadow-card lift',
  feature: 'bg-feature text-feature-foreground rounded-feature shadow-card on-dark lift',
  hero: 'bg-hero text-feature-foreground rounded-feature shadow-card on-dark lift',
  slate: 'bg-slate text-slate-foreground rounded-card on-slate',
  raised: 'bg-surface-raised rounded-inner',
}

interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: CardVariant
  as?: ElementType
  padding?: 'none' | 'md' | 'lg'
}

const PADDING = { none: '', md: 'p-5', lg: 'p-6' } as const

export function Card({
  variant = 'glass',
  as: Component = 'div',
  padding = 'lg',
  className = '',
  ...props
}: CardProps) {
  return <Component className={`${VARIANT_CLASSES[variant]} ${PADDING[padding]} ${className}`} {...props} />
}

interface SectionCardProps extends Omit<CardProps, 'title' | 'as'> {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  headingLevel?: 2 | 3
  children?: ReactNode
}

export function SectionCard({
  title,
  description,
  actions,
  headingLevel = 2,
  children,
  className = '',
  ...props
}: SectionCardProps) {
  const titleId = useId()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <Card as="section" aria-labelledby={titleId} className={`flex flex-col gap-5 ${className}`} {...props}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading id={titleId} className="text-heading">
            {title}
          </Heading>
          {typeof description === 'string' ? (
            <p className="text-caption text-subtle-foreground">{description}</p>
          ) : (
            description
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </Card>
  )
}
