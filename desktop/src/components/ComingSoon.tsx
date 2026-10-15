import { Construction } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function ComingSoon() {
  const { t } = useTranslation()

  return (
    <div className="text-muted-foreground flex h-full min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed">
      <Construction className="size-8" aria-hidden="true" />
      <p className="text-sm">{t('comingSoon')}</p>
    </div>
  )
}
