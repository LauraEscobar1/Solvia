import enCommon from './en/common.json'
import enDashboard from './en/dashboard.json'
import enErrors from './en/errors.json'
import enNav from './en/nav.json'
import enSettings from './en/settings.json'
import esCommon from './es/common.json'
import esDashboard from './es/dashboard.json'
import esErrors from './es/errors.json'
import esNav from './es/nav.json'
import esSettings from './es/settings.json'

export const SUPPORTED_LANGUAGES = ['es', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'es'

export const NAMESPACES = ['common', 'nav', 'dashboard', 'settings', 'errors'] as const
export type Namespace = (typeof NAMESPACES)[number]

export const resources = {
  es: {
    common: esCommon,
    nav: esNav,
    dashboard: esDashboard,
    settings: esSettings,
    errors: esErrors,
  },
  en: {
    common: enCommon,
    nav: enNav,
    dashboard: enDashboard,
    settings: enSettings,
    errors: enErrors,
  },
} as const satisfies Record<Language, Record<Namespace, object>>

export function isSupportedLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}
