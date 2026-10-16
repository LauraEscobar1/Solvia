import enAdmin from './en/admin.json'
import enAlerts from './en/alerts.json'
import enAuth from './en/auth.json'
import enCommon from './en/common.json'
import enDashboard from './en/dashboard.json'
import enErrors from './en/errors.json'
import enNav from './en/nav.json'
import enRequests from './en/requests.json'
import enSettings from './en/settings.json'
import enValidation from './en/validation.json'
import esAdmin from './es/admin.json'
import esAlerts from './es/alerts.json'
import esAuth from './es/auth.json'
import esCommon from './es/common.json'
import esDashboard from './es/dashboard.json'
import esErrors from './es/errors.json'
import esNav from './es/nav.json'
import esRequests from './es/requests.json'
import esSettings from './es/settings.json'
import esValidation from './es/validation.json'

export const SUPPORTED_LANGUAGES = ['es', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'es'

export const NAMESPACES = [
  'common',
  'nav',
  'dashboard',
  'settings',
  'errors',
  'auth',
  'admin',
  'validation',
  'requests',
  'alerts',
] as const
export type Namespace = (typeof NAMESPACES)[number]

export const resources = {
  es: {
    common: esCommon,
    nav: esNav,
    dashboard: esDashboard,
    settings: esSettings,
    errors: esErrors,
    auth: esAuth,
    admin: esAdmin,
    validation: esValidation,
    requests: esRequests,
    alerts: esAlerts,
  },
  en: {
    common: enCommon,
    nav: enNav,
    dashboard: enDashboard,
    settings: enSettings,
    errors: enErrors,
    auth: enAuth,
    admin: enAdmin,
    validation: enValidation,
    requests: enRequests,
    alerts: enAlerts,
  },
} as const satisfies Record<Language, Record<Namespace, object>>

export function isSupportedLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}
