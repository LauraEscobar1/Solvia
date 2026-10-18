import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface FormFieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  aside?: ReactNode
  children: ReactNode
}

export function FormField({ label, htmlFor, error, hint, aside, children }: FormFieldProps) {
  const { t } = useTranslation('validation')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="text-caption font-semibold">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-caption text-danger-text flex items-center gap-1.5 font-medium">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {t(error, { defaultValue: t('invalid') })}
        </p>
      ) : (
        hint && <p className="text-caption text-subtle-foreground">{hint}</p>
      )}
    </div>
  )
}
