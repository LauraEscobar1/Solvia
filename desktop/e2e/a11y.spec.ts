import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { ACCOUNT, mockApi } from './api'

const THEMES = ['light', 'dark'] as const
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

interface Screen {
  name: string
  open: (page: Page) => Promise<void>
}

async function go(page: Page, hash: string) {
  await page.evaluate((target) => {
    window.location.hash = target
  }, hash)
}

const SCREENS: Screen[] = [
  {
    name: 'panel',
    open: async (page) => {
      await expect(page.getByRole('region', { name: 'Estado actual' })).toBeVisible()
    },
  },
  {
    name: 'solicitudes en lista',
    open: async (page) => {
      await go(page, '#/requests')
      await expect(page.getByRole('link', { name: /Reembolso de matrícula/ }).first()).toBeVisible()
    },
  },
  {
    name: 'solicitudes en tablero',
    open: async (page) => {
      await go(page, '#/requests')
      await page.getByRole('radio', { name: 'Tablero' }).click()
      await expect(page.getByRole('region', { name: /Asignada/ }).first()).toBeVisible()
    },
  },
  {
    name: 'detalle',
    open: async (page) => {
      await go(page, '#/requests/req-81')
      await expect(page.getByRole('heading', { level: 1, name: 'Reembolso de matrícula por doble cobro' })).toBeVisible()
      await expect(page.getByText('La solicitud superó su SLA')).toBeVisible()
    },
  },
  {
    name: 'análisis',
    open: async (page) => {
      await go(page, '#/analytics')
      await expect(page.getByRole('row', { name: /Finanzas/ })).toBeVisible()
    },
  },
  {
    name: 'alertas',
    open: async (page) => {
      await go(page, '#/alerts')
      await expect(page.getByRole('list', { name: 'Alertas' })).toBeVisible()
    },
  },
  {
    name: 'configuración',
    open: async (page) => {
      await go(page, '#/settings')
      await expect(page.getByText('En línea')).toBeVisible()
    },
  },
  {
    name: 'nueva solicitud',
    open: async (page) => {
      await go(page, '#/requests')
      await page.getByRole('button', { name: 'Nueva solicitud' }).first().click()
      await expect(page.getByRole('dialog', { name: 'Nueva solicitud' })).toBeVisible()
    },
  },
  ...['users', 'areas', 'sla', 'ai'].map(
    (section): Screen => ({
      name: `administración · ${section}`,
      open: async (page) => {
        await go(page, `#/admin/${section}`)
        await expect(page.locator('main table, main dl').first()).toBeVisible()
      },
    }),
  ),
]

async function expectAccessible(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  const summary = results.violations.map(
    (violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  )
  expect(summary).toEqual([])
}

for (const theme of THEMES) {
  test.describe(`español ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.use({ colorScheme: theme })

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((preference) => {
        localStorage.setItem('solvia.language', 'es')
        localStorage.setItem('solvia.theme', JSON.stringify({ state: { preference }, version: 1 }))
      }, theme)
      await mockApi(page, theme)
      await page.goto('/#/login')
    })

    test('login', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
      await expectAccessible(page)
    })

    for (const screen of SCREENS) {
      test(screen.name, async ({ page }) => {
        await page.locator('input[type="email"]').fill(ACCOUNT.email)
        await page.locator('input[type="password"]').fill(ACCOUNT.password)
        await page.locator('input[type="password"]').press('Enter')
        await page.waitForURL(/#\/$/)
        await screen.open(page)
        await expectAccessible(page)
      })
    }
  })
}
