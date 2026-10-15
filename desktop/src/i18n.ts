import i18n, { type InitOptions } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type Language,
  NAMESPACES,
  resources,
  SUPPORTED_LANGUAGES,
} from './locales'

export const LANGUAGE_STORAGE_KEY = 'solvia.language'

function syncDocumentLanguage(language: string): void {
  document.documentElement.lang = language
}

export const i18nOptions = {
  resources,
  supportedLngs: SUPPORTED_LANGUAGES,
  fallbackLng: DEFAULT_LANGUAGE,
  load: 'languageOnly',
  ns: NAMESPACES,
  defaultNS: 'common',
  initAsync: false,
  interpolation: { escapeValue: false },
  detection: {
    order: ['localStorage', 'navigator'],
    lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    caches: [],
    convertDetectedLanguage: (lng: string) => lng.split('-')[0] ?? lng,
  },
} satisfies InitOptions

void i18n.use(LanguageDetector).use(initReactI18next).init(i18nOptions)

syncDocumentLanguage(currentLanguage())
i18n.on('languageChanged', syncDocumentLanguage)

export function currentLanguage(): Language {
  const resolved = i18n.resolvedLanguage ?? i18n.language
  return isSupportedLanguage(resolved) ? resolved : DEFAULT_LANGUAGE
}

function persistLanguage(language: Language): boolean {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    return true
  } catch {
    return false
  }
}

export async function setLanguage(language: Language): Promise<void> {
  persistLanguage(language)
  await i18n.changeLanguage(language)
}

export default i18n
