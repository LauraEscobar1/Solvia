import { Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { type InputHTMLAttributes, type Ref, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CONTROL_BASE } from './styles'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon
  revealable?: boolean
  ref?: Ref<HTMLInputElement>
}

export function TextField({
  icon: Icon,
  revealable = false,
  type = 'text',
  className = '',
  ...props
}: TextFieldProps) {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState(false)
  const effectiveType = revealable && revealed ? 'text' : type

  return (
    <div className="relative">
      {Icon && (
        <Icon
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
      )}
      <input
        type={effectiveType}
        className={`${CONTROL_BASE} h-12 w-full rounded-full ${Icon ? 'pl-11' : 'pl-4'} ${revealable ? 'pr-12' : 'pr-4'} ${className}`}
        {...props}
      />
      {revealable && (
        <button
          type="button"
          aria-label={revealed ? t('password.hide') : t('password.show')}
          aria-pressed={revealed}
          onClick={() => {
            setRevealed((value) => !value)
          }}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full"
        >
          {revealed ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  )
}
