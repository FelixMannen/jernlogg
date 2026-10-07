// End-to-end test of supplements in local mode: node scripts/supp-e2e.mjs [outDir]
import { chromium, devices } from 'playwright'
import { spawn } from 'child_process'
import fs from 'fs'
const out = process.argv[2] || '/tmp/claude-0/supp-shots'
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const PORT = 4189
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nb-NO', timezoneId: 'Asia/Seoul' })
await ctx.addInitScript(() => {
  if (location.protocol === 'about:') return
  if (!sessionStorage.getItem('init')) {
    localStorage.clear()
    sessionStorage.setItem('init', '1')
  }
  localStorage.setItem('jernlogg.me', localStorage.getItem('jernlogg.me') || 'felix')
  localStorage.setItem('jernlogg.tip1', '1')
  localStorage.setItem('jernlogg.installHidden', '1')
})
const page = await ctx.newPage()
page.setDefaultTimeout(8000)
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
const base = `http://localhost:${PORT}/?local=1`
let n = 0
const shot = (name, full = false) => page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full })
const t = async (name, fn) => {
  try {
    await fn()
    console.log('✓', name)
  } catch (e) {
    errors.push(`${name}: ${e.message.split('\n')[0]}`)
    console.log('✗', name, e.message.split('\n')[0])
    await shot('FAIL-' + name.replace(/\W+/g, '-'))
  }
}
const logs = () => page.evaluate(() => window.__jernlogg.allDocs().filter((d) => d.collection === 'supplement_logs' && !d.deleted).map((d) => d.id))
const overflow = async (label) => {
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push('horizontal overflow on ' + label)
}

await page.goto(base + '#/profil')
await page.locator('#supplementer').waitFor()

await t('legg til kreatin med lager', async () => {
  await page.locator('#supplementer').getByRole('button', { name: 'Legg til' }).click()
  await page.locator('.sheet').getByRole('button', { name: 'Kreatin', exact: true }).click()
  await page.locator('.sheet label:has-text("Lager") input').fill('50')
  await shot('editor')
  await page.locator('.sheet').getByRole('button', { name: 'Lagre' }).click()
  await page.locator('#supplementer .supp-head', { hasText: 'Kreatin' }).waitFor()
  await page.locator('#supplementer').getByText('50 g igjen').waitFor()
})

await t('kryss av i feeden', async () => {
  await page.goto(base + '#/feed')
  await page.getByRole('region', { name: 'Supplementer i dag' }).waitFor()
  await shot('feed-card')
  await page.getByRole('button', { name: 'Kreatin: tatt' }).click()
  if ((await logs()).length !== 1) throw new Error('no log')
  await page.getByRole('region', { name: 'Supplementer i dag' }).getByText('Kreatin tatt ✓').waitFor()
  // next app start: the card is gone when everything is taken
  await page.reload()
  await page.locator('.nav').waitFor()
  if (await page.getByRole('region', { name: 'Supplementer i dag' }).count()) throw new Error('card should hide when all taken')
})

await t('profil: tatt, streak 1, lager 45 g', async () => {
  await page.goto(base + '#/profil')
  const sec = page.locator('#supplementer')
  await sec.getByText('Kreatin tatt ✓').waitFor()
  await sec.getByText('1 🔥').waitFor()
  await sec.getByText('45 g igjen').waitFor()
})

await t('tok den i går → streak 2, kalender', async () => {
  await page.locator('#supplementer .supp-head').first().click()
  await page.getByRole('button', { name: 'Tok den i går' }).click()
  await page.locator('.sheet').getByText('2 🔥').waitFor()
  await shot('detail')
  await page.keyboard.press('Escape')
})

await t('angre i dag via knappen', async () => {
  await page.locator('#supplementer').getByRole('button', { name: 'Angre Kreatin' }).click()
  await page.locator('#supplementer').getByRole('button', { name: 'Kreatin: tatt' }).waitFor()
  await page.locator('#supplementer').getByRole('button', { name: 'Kreatin: tatt' }).click()
  await page.locator('#supplementer').getByText('Kreatin tatt ✓').waitFor()
})

await t('omega-3 med to doser', async () => {
  await page.locator('#supplementer').getByRole('button', { name: 'Legg til' }).click()
  await page.locator('.sheet').getByRole('button', { name: 'Omega-3', exact: true }).click()
  await page.locator('.sheet').getByRole('button', { name: /Legg til en dose til/ }).click()
  await page.locator('.sheet').getByLabel('Klokkeslett dose 2').selectOption('20')
  await page.locator('.sheet').getByRole('button', { name: 'Lagre' }).click()
  await page.locator('#supplementer').getByRole('button', { name: /Omega-3 20:00 ikke tatt/ }).waitFor()
  await shot('profil-supp', true)
  await overflow('profil')
})

await t('pause og fortsett', async () => {
  await page.locator('#supplementer .supp-head', { hasText: 'Omega-3' }).click()
  await page.getByRole('button', { name: 'Sett på pause' }).click()
  await page.keyboard.press('Escape')
  await page.locator('#supplementer').getByText('På pause').waitFor()
  await page.locator('#supplementer .supp-head', { hasText: 'Omega-3' }).click()
  await page.getByRole('button', { name: 'Fortsett' }).click()
  await page.keyboard.press('Escape')
  if (await page.locator('#supplementer').getByText('På pause').count()) throw new Error('still paused')
})

await t('ny boks nullstiller lageret', async () => {
  await page.locator('#supplementer .supp-head', { hasText: 'Kreatin' }).click()
  await page.getByRole('button', { name: 'Ny boks' }).click()
  await page.getByLabel('Mengde i ny boks').fill('500')
  await page.locator('.sheet').getByRole('button', { name: 'Lagre' }).click()
  await page.keyboard.press('Escape')
  await page.locator('#supplementer').getByText(/500 g igjen|495 g igjen/).waitFor()
})

await t('#/supplementer-siden (varsel-mål på iPhone)', async () => {
  await page.goto(base + '#/supplementer')
  await page.getByText('Supplementer i dag').first().waitFor()
  await page.getByRole('button', { name: /Trykk når tatt/ }).first().click()
  await shot('today-page')
  await overflow('supplementer')
})

await t('David ser ikke Felix sine supplementer', async () => {
  await page.evaluate(() => localStorage.setItem('jernlogg.me', 'david'))
  await page.goto('about:blank')
  await page.goto(base + '#/u/felix')
  await page.waitForSelector('.nav')
  await page.waitForTimeout(300)
  if (await page.locator('#supplementer').count()) throw new Error('visible on Felix profile when viewed by David')
  await page.goto(base + '#/feed')
  await page.waitForSelector('.nav')
  if (await page.getByRole('region', { name: 'Supplementer i dag' }).count()) throw new Error('David sees Felix pending supplements')
  await page.goto(base + '#/profil')
  await page.locator('#supplementer').waitFor()
  if (await page.locator('#supplementer .supp').count()) throw new Error('David sees Felix supplements')
})

await browser.close()
server.kill()
console.log(errors.length ? '\nFEIL:\n' + errors.join('\n') : '\nAlle supplement-tester OK')
process.exit(errors.length ? 1 : 0)
