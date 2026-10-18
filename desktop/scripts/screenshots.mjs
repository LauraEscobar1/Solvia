import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from '@playwright/test'
import { createServer } from 'vite'

const DESKTOP = fileURLToPath(new URL('..', import.meta.url))
const OUTPUT = path.resolve(DESKTOP, '../docs/design/screenshots')
const API = (process.env.SOLVIA_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '')
const PORT = 1420
const APP = `http://localhost:${PORT}`
const ENGINE = process.env.SCREENSHOT_BROWSER === 'chromium' ? chromium : webkit
const ONLY = process.env.SCREENSHOT_ONLY?.split(',').filter(Boolean) ?? null
const VIEWPORT = {
  width: Number(process.env.SCREENSHOT_WIDTH ?? 1440),
  height: Number(process.env.SCREENSHOT_HEIGHT ?? 900),
}

const VARIANTS = [
  { language: 'es', theme: 'light' },
  { language: 'es', theme: 'dark' },
  { language: 'en', theme: 'light' },
  { language: 'en', theme: 'dark' },
].filter(({ language, theme }) => !process.env.SCREENSHOT_VARIANT || process.env.SCREENSHOT_VARIANT === `${language}-${theme}`)

const SECRET_KEYS = ['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'SEED_DEMO_PASSWORD']

async function seedCredentials() {
  const values = Object.fromEntries(SECRET_KEYS.map((key) => [key, process.env[key]]))
  if (SECRET_KEYS.some((key) => !values[key])) {
    const raw = await readFile(path.resolve(DESKTOP, '../.env'), 'utf8').catch(() => '')
    for (const line of raw.split('\n')) {
      const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (match && SECRET_KEYS.includes(match[1]) && !values[match[1]]) {
        values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
      }
    }
  }
  const missing = SECRET_KEYS.filter((key) => !values[key])
  if (missing.length > 0) throw new Error(`Faltan variables en el entorno o en .env: ${missing.join(', ')}`)
  return {
    admin: { email: values.SEED_ADMIN_EMAIL, password: values.SEED_ADMIN_PASSWORD },
    supervisor: { email: 'supervisor@example.com', password: values.SEED_DEMO_PASSWORD },
    assignee: { email: 'responsable1@example.com', password: values.SEED_DEMO_PASSWORD },
    requester: { email: 'solicitante1@example.com', password: values.SEED_DEMO_PASSWORD },
  }
}

async function ensureApi() {
  const response = await fetch(`${API}/api/v1/health`).catch(() => null)
  if (!response?.ok) {
    throw new Error(
      `La API no responde en ${API}. Levanta Postgres y la API (docker compose up -d) y carga la semilla con --demo.`,
    )
  }
}

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
}

async function go(page, hash) {
  await page.evaluate((target) => {
    window.location.hash = target
  }, hash)
  await settle(page)
}

function wanted(name) {
  return !ONLY || ONLY.some((item) => name.includes(item))
}

async function shoot(page, folder, name) {
  if (!wanted(name)) return null
  const file = path.join(folder, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function openSession(browser, variant, account) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: variant.theme,
    locale: variant.language === 'es' ? 'es-CO' : 'en-US',
    reducedMotion: 'reduce',
  })
  await context.addInitScript(({ language, theme }) => {
    localStorage.setItem('solvia.language', language)
    localStorage.setItem('solvia.theme', JSON.stringify({ state: { preference: theme }, version: 1 }))
  }, variant)
  await context.route(`${API}/api/v1/ai/**`, (route) =>
    route.request().method() === 'GET' ? route.continue() : route.abort(),
  )
  await context.route(new RegExp(`${API.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/v1/auth/(login|refresh)`), async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    if (body?.user) Object.assign(body.user, { language: variant.language, theme: variant.theme })
    await route.fulfill({ response, json: body })
  })
  const page = await context.newPage()
  await page.goto(`${APP}/#/login`)
  await settle(page)
  return { context, page, account }
}

async function signIn(page, account) {
  await page.locator('input[type="email"]').fill(account.email)
  await page.locator('input[type="password"]').fill(account.password)
  await page.locator('input[type="password"]').press('Enter')
  await page.waitForFunction(() => window.location.hash === '#/' || window.location.hash === '')
  await settle(page)
}

async function captureVariant(browser, variant, accounts) {
  const folder = path.join(OUTPUT, `${variant.language}-${variant.theme}`)
  await mkdir(folder, { recursive: true })
  const files = []
  const add = (file) => {
    if (file) files.push(file)
  }

  const supervisor = await openSession(browser, variant, accounts.supervisor)
  const page = supervisor.page
  add(await shoot(page, folder, '01-login'))
  await signIn(page, accounts.supervisor)
  add(await shoot(page, folder, '02-panel'))
  await go(page, '#/requests')
  add(await shoot(page, folder, '03-solicitudes-lista'))
  if (wanted('04-solicitudes-tablero')) {
    await page.getByRole('radio', { name: /^(Tablero|Board)$/ }).click()
    await settle(page)
    add(await shoot(page, folder, '04-solicitudes-tablero'))
    await page.getByRole('radio', { name: /^(Lista|List)$/ }).click()
  }
  await go(page, '#/analytics')
  add(await shoot(page, folder, '05-analisis'))
  if (wanted('05-analisis-cursor')) {
    const box = await page.locator('.recharts-surface').first().boundingBox()
    if (box) await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4)
    await page.waitForTimeout(200)
    add(await shoot(page, folder, '05-analisis-cursor'))
    await page.mouse.move(0, 0)
  }
  if (wanted('06-detalle')) {
    await go(page, '#/requests?sort=-risk_score')
    await page.locator('main a[href^="#/requests/"]').first().click()
    await settle(page)
    add(await shoot(page, folder, '06-detalle'))
  }
  await go(page, '#/alerts')
  add(await shoot(page, folder, '07-alertas'))
  await go(page, '#/settings')
  add(await shoot(page, folder, '08-configuracion'))
  if (wanted('09-nueva-solicitud')) {
    await go(page, '#/requests')
    await page.getByRole('button', { name: /Nueva solicitud|New request/ }).first().click()
    await settle(page)
    add(await shoot(page, folder, '09-nueva-solicitud'))
    await page.keyboard.press('Escape')
  }
  await supervisor.context.close()

  const adminScreens = ['10-admin-usuarios', '11-admin-areas', '12-admin-sla', '13-admin-ia', '16-analisis-admin']
  if (adminScreens.some(wanted)) {
    const admin = await openSession(browser, variant, accounts.admin)
    await signIn(admin.page, accounts.admin)
    const routes = ['#/admin/users', '#/admin/areas', '#/admin/sla', '#/admin/ai', '#/analytics?range=90']
    for (const [index, name] of adminScreens.entries()) {
      if (!wanted(name)) continue
      await go(admin.page, routes[index])
      add(await shoot(admin.page, folder, name))
    }
    await admin.context.close()
  }

  for (const [names, account] of [
    [['14-panel-responsable'], accounts.assignee],
    [['15-panel-solicitante', '17-analisis-solicitante'], accounts.requester],
  ]) {
    if (!names.some(wanted)) continue
    const session = await openSession(browser, variant, account)
    await signIn(session.page, account)
    add(await shoot(session.page, folder, names[0]))
    if (names[1] && wanted(names[1])) {
      await go(session.page, '#/analytics')
      add(await shoot(session.page, folder, names[1]))
    }
    await session.context.close()
  }
  return files
}

async function main() {
  const accounts = await seedCredentials()
  await ensureApi()
  const server = await createServer({
    root: DESKTOP,
    configFile: path.join(DESKTOP, 'vite.config.ts'),
    logLevel: 'warn',
    server: { port: PORT, strictPort: true },
  })
  await server.listen()
  const browser = await ENGINE.launch()
  try {
    for (const variant of VARIANTS) {
      const files = await captureVariant(browser, variant, accounts)
      for (const file of files) console.log(path.relative(path.resolve(DESKTOP, '..'), file))
    }
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
