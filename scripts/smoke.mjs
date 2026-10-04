// Automated walkthrough in mobile viewport against local-mode build.
// Usage: node scripts/smoke.mjs [--seed] [outDir]
import { chromium, devices } from 'playwright'
import { spawn } from 'child_process'
import fs from 'fs'

const seed = process.argv.includes('--seed')
const out = process.argv.filter((a) => !a.startsWith('--'))[2] || '/tmp/claude-0/shots'
fs.mkdirSync(out, { recursive: true })
const PORT = 4179
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))

const errors = []
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nb-NO', timezoneId: 'Asia/Seoul' })
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
const base = `http://localhost:${PORT}/?local=1`
let n = 0
const shot = async (name, full = false) => {
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full })
}
const step = async (name, fn) => {
  try {
    await fn()
  } catch (e) {
    errors.push(`step "${name}" failed: ${e.message.split('\n')[0]}`)
    await shot('FAIL-' + name.replace(/\W+/g, '-'))
  }
}

try {
  await page.goto(base)
  await page.evaluate(() => localStorage.clear())
  await page.goto(base)
  if (seed) {
    await page.evaluate(() => {
      const J = window.__jernlogg
      const ex = {
        felix: [['benkpress', 80], ['kneboy', 100], ['markloft', 130], ['militaerpress', 50]],
        david: [['benkpress', 90], ['kneboy', 120], ['markloft', 150], ['pullups', 10]],
        erik: [['benkpress', 70], ['kneboy', 110], ['markloft', 140], ['stangroing', 60]],
      }
      const titles = ['Push', 'Pull', 'Bein']
      let k = 0
      for (const [user, list] of Object.entries(ex)) {
        for (let wk = 8; wk >= 1; wk--) {
          for (let d = 0; d < 2; d++) {
            const start = new Date(Date.now() - (wk * 7 - d * 3) * 86400000)
            start.setHours(17, 0, 0, 0)
            const prog = (8 - wk) * 2.5
            const exercises = list.slice(d, d + 3).map(([id, base], i) => ({
              uid: 'x' + k + i,
              exerciseId: id,
              sets: [0, 1, 2].map((s) => ({ uid: `s${k}${i}${s}`, weight: id === 'pullups' ? 0 : base + prog, reps: 8 - s, done: true, warmup: false })),
            }))
            J.put('workouts', 'seed' + k++, {
              userId: user,
              title: titles[(wk + d) % 3],
              startedAt: start.toISOString(),
              endedAt: new Date(start.getTime() + 3600e3).toISOString(),
              status: 'done',
              exercises,
            })
          }
        }
        J.put('bodyweight', `bw:${user}:2026-09-01`, { userId: user, date: '2026-09-01', weight: user === 'david' ? 84 : 78 })
      }
    })
  }
  await shot('picker')
  await step('pick user', async () => {
    await page.getByRole('button', { name: /Felix/ }).click()
    await page.waitForSelector('.nav')
  })
  await shot('feed')
  await step('open start', async () => {
    await page.click('a[href="#/okt"]')
    await page.getByRole('button', { name: /Start tom økt/ }).click()
  })
  await step('add exercises', async () => {
    await page.getByRole('button', { name: /Legg til øvelse/ }).first().click()
    await page.fill('.sheet input', 'benk')
    await page.locator('.sheet .list-item').first().click()
    await page.fill('.sheet input', 'knebøy')
    await page.locator('.sheet .list-item').first().click()
    await shot('picker-selected')
    await page.getByRole('button', { name: /Legg til 2 øvelser/ }).click()
  })
  await shot('logger')
  await step('log sets', async () => {
    const card = page.locator('.ex-card').first()
    const w = card.getByLabel('Vekt sett 1')
    await w.fill('95')
    await card.getByLabel('Reps sett 1').fill('5')
    await shot('logger-focus')
    await card.getByLabel('Fullfør sett').first().click()
    await card.getByLabel('Fullfør sett').first().click()
    await page.waitForTimeout(300)
  })
  await shot('logger-done')
  {
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, vv: window.visualViewport?.scale, wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 5).map((e) => e.className || e.tagName) }))
    if (m.sw > m.iw + 1 || m.wide.length) errors.push('logger overflow ' + JSON.stringify(m))
  }
  await step('finish', async () => {
    await page.getByRole('button', { name: 'Fullfør', exact: true }).click()
    const dlg = page.getByRole('alertdialog')
    if (await dlg.isVisible().catch(() => false)) await dlg.getByRole('button', { name: /Avslutt/ }).click()
    await page.waitForURL(/ferdig/)
  })
  await shot('summary')
  await step('feed', async () => {
    await page.click('a[href="#/feed"]')
    await page.locator('.react').first().click()
  })
  await shot('feed-after')
  await step('topp', async () => page.click('a[href="#/topp"]'))
  await shot('topp')
  await step('maler', async () => page.click('a[href="#/maler"]'))
  await shot('maler')
  await step('template flow', async () => {
    await page.getByRole('button', { name: 'Push', exact: true }).click()
    await page.getByRole('button', { name: 'Start økt' }).first().click()
    await page.waitForURL(/#\/okt/)
    const cards = await page.locator('.ex-card').count()
    if (cards !== 5) throw new Error('expected 5 exercises from Push template, got ' + cards)
    // warmup generator on first exercise
    await page.locator('.ex-card').first().getByRole('button', { name: /Valg for/ }).click()
    await page.getByRole('button', { name: /Generer oppvarming/ }).click()
    const warm = await page.locator('.ex-card').first().locator('.set-idx.warm').count()
    if (warm < 2) throw new Error('warmup generator added ' + warm + ' sets')
    await shot('template-warmup')
    // complete first work set and finish
    const first = page.locator('.ex-card').first()
    const rows = first.locator('.set-row')
    await rows.nth(warm).getByLabel('Fullfør sett').click()
    await page.getByRole('button', { name: 'Fullfør', exact: true }).click()
    const dlg = page.getByRole('alertdialog')
    await dlg.getByRole('button', { name: /Avslutt/ }).click()
    await page.waitForURL(/ferdig/)
    await page.getByRole('button', { name: 'Beist' }).click()
  })
  await step('edit flow', async () => {
    await page.getByRole('button', { name: /Rediger/ }).click()
    await page.waitForURL(/#\/okt/)
    const save = page.getByRole('button', { name: 'Lagre', exact: true })
    await save.waitFor()
    await save.click()
    await page.waitForURL(/#\/w\//)
  })
  await shot('after-edit')
  await step('profil', async () => page.click('a[href="#/profil"]'))
  await shot('profil', true)
  await step('exercise', async () => {
    await page.goto(base + '#/ex/benkpress')
  })
  await shot('exercise')
  await step('compare', async () => page.getByRole('button', { name: 'Sammenlign alle' }).click())
  await shot('exercise-compare')
  // overflow check
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (overflow) errors.push('horizontal overflow on exercise page')
  for (const r of ['feed', 'topp', 'maler', 'profil', 'okt']) {
    await page.goto(base + '#/' + r)
    await page.waitForTimeout(150)
    const of = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    if (of) errors.push('horizontal overflow on ' + r)
  }
  await ctx.setDefaultTimeout(5000)
} finally {
  await browser.close()
  server.kill()
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'OK – no errors')
console.log('screenshots in', out)
