import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { THEME_PREFERENCES, type ThemePreference, useThemeStore } from '@/stores/theme'

const ICONS = { light: Sun, dark: Moon, system: Monitor } satisfies Record<ThemePreference, unknown>

export function ThemeSelector() {
  const { t } = useTranslation()
  const preference = useThemeStore((state) => state.preference)
  const setPreference = useThemeStore((state) => state.setPreference)

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className="bg-surface-muted flex items-center gap-0.5 rounded-lg border p-0.5"
    >
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICONS[option]
        const selected = option === preference
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`theme.${option}`)}
            title={t(`theme.${option}`)}
            onClick={() => {
              setPreference(option)
            }}
            className={[
              'rounded-md p-1.5 transition-colors',
              selected
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
