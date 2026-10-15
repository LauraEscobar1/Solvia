import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ThemeSelector } from '@/components/ThemeSelector'
import { THEME_STORAGE_KEY, useThemeStore, useThemeSync } from '@/stores/theme'
import { setSystemPrefersDark } from './matchMedia'

function ThemeHarness() {
  useThemeSync()
  return <ThemeSelector />
}

const root = document.documentElement

function storedPreference(): unknown {
  const raw = localStorage.getItem(THEME_STORAGE_KEY)
  return raw ? (JSON.parse(raw) as { state: { preference: string } }).state.preference : null
}

describe('cambio de tema', () => {
  it('aplica la clase .dark y persiste la preferencia al elegir Oscuro', async () => {
    const user = userEvent.setup()
    render(<ThemeHarness />)

    await user.click(screen.getByRole('radio', { name: 'Oscuro' }))

    expect(root).toHaveClass('dark')
    expect(root.style.colorScheme).toBe('dark')
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toHaveAttribute('aria-checked', 'true')
    expect(storedPreference()).toBe('dark')
  })

  it('quita la clase .dark al volver a Claro', async () => {
    const user = userEvent.setup()
    render(<ThemeHarness />)

    await user.click(screen.getByRole('radio', { name: 'Oscuro' }))
    await user.click(screen.getByRole('radio', { name: 'Claro' }))

    expect(root).not.toHaveClass('dark')
    expect(root.style.colorScheme).toBe('light')
    expect(storedPreference()).toBe('light')
  })

  it('en modo Sistema sigue los cambios del sistema operativo', () => {
    setSystemPrefersDark(true)
    render(<ThemeHarness />)

    expect(useThemeStore.getState().preference).toBe('system')
    expect(root).toHaveClass('dark')

    act(() => {
      setSystemPrefersDark(false)
    })
    expect(root).not.toHaveClass('dark')
  })

  it('ignora el sistema operativo si se eligió un tema explícito', async () => {
    const user = userEvent.setup()
    render(<ThemeHarness />)
    await user.click(screen.getByRole('radio', { name: 'Claro' }))

    act(() => {
      setSystemPrefersDark(true)
    })

    expect(root).not.toHaveClass('dark')
  })

  it('restaura la preferencia guardada en localStorage', async () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ state: { preference: 'dark' }, version: 1 }),
    )

    await useThemeStore.persist.rehydrate()
    render(<ThemeHarness />)

    expect(useThemeStore.getState().preference).toBe('dark')
    expect(root).toHaveClass('dark')
  })
})
