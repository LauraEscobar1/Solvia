import { describe, expect, it } from 'vitest'
import tokensCss from '@/styles/tokens.css?raw'

type Mode = 'light' | 'dark'

const TEXT = 4.5
const NON_TEXT = 3

const HEX = /^#[0-9a-f]{6}$/i

function declarations(selector: string): Record<string, string> {
  const start = tokensCss.search(new RegExp(`^${selector.replace('.', '\\.')} \\{`, 'm'))
  if (start < 0) throw new Error(`No se encontró el bloque ${selector}`)
  const body = tokensCss.slice(start, tokensCss.indexOf('\n}', start))
  const values: Record<string, string> = {}
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (name && value) values[name] = value.trim()
  }
  return values
}

const light = declarations(':root')
const TOKENS: Record<Mode, Record<string, string>> = {
  light,
  dark: { ...light, ...declarations('.dark') },
}

function channel(value: number): number {
  const srgb = value / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => channel(Number.parseInt(hex.slice(offset, offset + 2), 16)))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function contrast(mode: Mode, foreground: string, background: string): number {
  const colors = [foreground, background].map((token) => {
    const value = TOKENS[mode][token]
    if (!value || !HEX.test(value)) throw new Error(`${token} no es un color hexadecimal en ${mode}`)
    return luminance(value)
  })
  const [high, low] = [Math.max(...colors), Math.min(...colors)]
  return (high + 0.05) / (low + 0.05)
}

const BOTH_MODES: [string, string, number][] = [
  ['foreground', 'background', TEXT],
  ['foreground', 'surface-solid', TEXT],
  ['foreground', 'surface-raised', TEXT],
  ['foreground', 'control', TEXT],
  ['foreground', 'blob-blue', TEXT],
  ['muted-foreground', 'background', TEXT],
  ['muted-foreground', 'surface-solid', TEXT],
  ['muted-foreground', 'surface-raised', TEXT],
  ['muted-foreground', 'blob-blue', TEXT],
  ['muted-foreground', 'blob-lime', TEXT],
  ['subtle-foreground', 'background', TEXT],
  ['subtle-foreground', 'surface-solid', TEXT],
  ['subtle-foreground', 'surface-sunken', TEXT],
  ['subtle-foreground', 'blob-blue', TEXT],
  ['subtle-foreground', 'blob-lime', TEXT],
  ['nav-foreground', 'carbon', TEXT],
  ['accent', 'carbon', TEXT],
  ['accent-foreground', 'accent', TEXT],
  ['accent-text', 'background', TEXT],
  ['accent-text', 'surface-solid', TEXT],
  ['accent-text', 'accent-soft', TEXT],
  ['accent-text', 'blob-blue', TEXT],
  ['accent-text', 'blob-lime', TEXT],
  ['accent-line', 'background', NON_TEXT],
  ['accent-line', 'surface-solid', NON_TEXT],
  ['solid-foreground', 'solid', TEXT],
  ['feature-foreground', 'hero', TEXT],
  ['feature-foreground', 'hero-row', TEXT],
  ['accent', 'hero-row', TEXT],
  ['feature-foreground', 'feature', TEXT],
  ['feature-foreground', 'feature-row', TEXT],
  ['feature-muted', 'feature', TEXT],
  ['feature-muted', 'feature-row', TEXT],
  ['accent', 'hero', TEXT],
  ['accent', 'feature', TEXT],
  ['accent', 'feature-row', TEXT],
  ['risk-high-on-feature', 'feature', TEXT],
  ['risk-high-on-feature', 'feature-row', TEXT],
  ['risk-medium-on-feature', 'feature-row', TEXT],
  ['slate-foreground', 'slate', TEXT],
  ['slate-foreground', 'slate-soft', TEXT],
  ['danger-text', 'background', TEXT],
  ['danger-text', 'surface-solid', TEXT],
  ['danger-soft-foreground', 'danger-soft', TEXT],
  ['danger-foreground', 'danger', TEXT],
  ['ink', 'pill-inner', TEXT],
  ['neutral-soft-foreground', 'pill-inner-neutral', TEXT],
  ['ink', 'danger-strong', TEXT],
  ['ink', 'alert-count', TEXT],
  ['warning-text', 'background', TEXT],
  ['warning-text', 'surface-solid', TEXT],
  ['warning-soft-foreground', 'warning-soft', TEXT],
  ['stalled-text', 'background', TEXT],
  ['stalled-text', 'surface-solid', TEXT],
  ['stalled-soft-foreground', 'stalled-soft', TEXT],
  ['neutral-soft-foreground', 'neutral-soft', TEXT],
  ['control-border', 'control', NON_TEXT],
  ['control-border', 'surface-solid', NON_TEXT],
  ['control-border', 'background', NON_TEXT],
  ['focus', 'background', NON_TEXT],
  ['focus', 'surface-solid', NON_TEXT],
  ['focus', 'control', NON_TEXT],
  ['avatar-foreground', 'avatar-1', TEXT],
  ['avatar-foreground', 'avatar-2', TEXT],
  ['avatar-foreground', 'avatar-3', TEXT],
  ['avatar-foreground', 'avatar-4', TEXT],
  ['avatar-foreground', 'avatar-5', TEXT],
  ['avatar-foreground', 'avatar-self', TEXT],
]

const DARK_ONLY: [string, string, number][] = [
  ['stage-received', 'surface-solid', NON_TEXT],
  ['stage-assigned', 'surface-solid', NON_TEXT],
  ['stage-in-progress', 'surface-solid', NON_TEXT],
  ['stage-in-progress', 'background', NON_TEXT],
]

const CASES: [Mode, string, string, number][] = [
  ...BOTH_MODES.flatMap(([fg, bg, min]): [Mode, string, string, number][] => [
    ['light', fg, bg, min],
    ['dark', fg, bg, min],
  ]),
  ...DARK_ONLY.map(([fg, bg, min]): [Mode, string, string, number] => ['dark', fg, bg, min]),
]

describe('contraste de los tokens', () => {
  it.each(CASES)('%s: --%s sobre --%s llega a %d:1', (mode, foreground, background, minimum) => {
    expect(contrast(mode, foreground, background)).toBeGreaterThanOrEqual(minimum)
  })

  it('el lima sobre fondo claro no se usa como texto', () => {
    expect(contrast('light', 'accent', 'background')).toBeLessThan(TEXT)
    expect(TOKENS.light['accent-text']).not.toBe(TOKENS.light.accent)
  })
})
