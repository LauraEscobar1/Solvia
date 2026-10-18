import { useTranslation } from 'react-i18next'
import { PILL_FIELD } from '@/components/ui/SelectPill'
import { ChevronsUpDown } from 'lucide-react'
import { saveLanguagePreference } from '@/lib/auth/preferences'
import { isSupportedLanguage, SUPPORTED_LANGUAGES } from '@/locales'

export function LanguageSelector() {
  const { t, i18n } = useTranslation()
  const current = i18n.resolvedLanguage ?? i18n.language

  return (
    <label className={PILL_FIELD}>
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={current}
        onChange={(event) => {
          const { value } = event.target
          if (isSupportedLanguage(value)) void saveLanguagePreference(value)
        }}
        className="cursor-pointer appearance-none bg-transparent font-semibold outline-none"
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
      <ChevronsUpDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3.5 size-3.5 -translate-y-1/2"
        aria-hidden="true"
      />
    </label>
  )
}
