import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '@/i18n'
import { isSupportedLanguage, SUPPORTED_LANGUAGES } from '@/locales'

export function LanguageSelector() {
  const { t, i18n } = useTranslation()
  const current = i18n.resolvedLanguage ?? i18n.language

  return (
    <label className="bg-surface-muted text-muted-foreground flex items-center gap-1.5 rounded-lg border py-1 pr-1 pl-2.5">
      <Languages className="size-4" aria-hidden="true" />
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={current}
        onChange={(event) => {
          const { value } = event.target
          if (isSupportedLanguage(value)) void setLanguage(value)
        }}
        className="text-foreground cursor-pointer rounded-md bg-transparent py-0.5 text-sm outline-none"
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
