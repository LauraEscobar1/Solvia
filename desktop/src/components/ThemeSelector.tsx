import { type KeyboardEvent, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { saveThemePreference } from '@/lib/auth/preferences'
import { moveFocus } from '@/lib/focus'
import { THEME_PREFERENCES, type ThemePreference, useThemeStore } from '@/stores/theme'

const PREVIEW_FRAME = 'rounded-cell flex h-20 gap-2 overflow-hidden p-2.5'

function Preview({ mode }: { mode: 'light' | 'dark' }) {
  const light = mode === 'light'
  return (
    <span className={`${PREVIEW_FRAME} ${light ? 'bg-preview-light' : 'bg-preview-dark'}`}>
      <span className="bg-preview-rail w-4 rounded-md" />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className={`h-3 rounded-md ${light ? 'bg-preview-light-bar' : 'bg-preview-dark-bar'}`} />
        <span className={`flex-1 rounded-md ${light ? 'bg-preview-light-bar' : 'bg-preview-dark-bar'}`} />
      </span>
    </span>
  )
}

function SystemPreview() {
  return (
    <span className="relative block h-20">
      <span className="absolute inset-0">
        <Preview mode="light" />
      </span>
      <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
        <Preview mode="dark" />
      </span>
    </span>
  )
}

export function ThemeSelector() {
  const { t } = useTranslation()
  const preference = useThemeStore((state) => state.preference)
  const group = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const radios = Array.from(group.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])
    if (!moveFocus(radios, document.activeElement, event.key)) return
    event.preventDefault()
    const value = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.value : undefined
    const option = THEME_PREFERENCES.find((item) => item === value)
    if (option) void saveThemePreference(option)
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={t('theme.label')}
      onKeyDown={onKeyDown}
      className="grid gap-3 sm:grid-cols-3"
    >
      {THEME_PREFERENCES.map((option: ThemePreference) => {
        const selected = option === preference
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-value={option}
            onClick={() => {
              void saveThemePreference(option)
            }}
            className={[
              'bg-surface-raised rounded-inner flex flex-col gap-3 border-2 p-3 text-left transition-colors',
              selected ? 'border-accent-line' : 'border-transparent hover:border-divider',
            ].join(' ')}
          >
            <span aria-hidden="true">{option === 'system' ? <SystemPreview /> : <Preview mode={option} />}</span>
            <span className="text-body px-1 font-semibold">{t(`theme.${option}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
