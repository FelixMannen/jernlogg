// Simulates an iPhone on-screen keyboard (visual viewport shrinks, layout viewport doesn't)
// and checks that interactive elements stay above it: node scripts/keyboard-e2e.mjs [outDir]
import { chromium, devices } from 'playwright'
import { spawn } from 'child_process'
import fs from 'fs'
const out = process.argv[2] || '/tmp/claude-0/kb-shots'
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const PORT = 4187
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nb-NO' })
await ctx.addInitScript(() => {
  try {
    if (!localStorage.getItem('jernlogg.noMe')) localStorage.setItem('jernlogg.me', 'erik')
    localStorage.setItem('jernlogg.tip1', '1')
  } catch {}
  // fake visual viewport we can shrink like a keyboard would
  const et = new EventTarget()
  const state = { height: innerHeight, offsetTop: 0 }
  const vv = { get height() { return state.height }, get offsetTop() { return state.offsetTop }, get width() { return innerWidth }, addEventListener: et.addEventListener.bind(et), removeEventListener: et.removeEventListener.bind(et) }
  Object.defineProperty(window, 'visualViewport', { get: () => vv })
  window.__kb = (px) => {
    state.height = innerHeight - px
    et.dispatchEvent(new Event('resize'))
  }
})
const page = await ctx.newPage()
page.setDefaultTimeout(8000)
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
const t = async (name, fn) => {
  try {
    await fn()
    console.log('✓', name)
  } catch (e) {
    errors.push(`${name}: ${e.message.split('\n')[0]}`)
    console.log('✗', name, e.message.split('\n')[0])
  }
}
const KB = 336
await page.goto(`http://localhost:${PORT}/?local=1#/okt`)
await page.locator('.kind-tile', { hasText: 'Styrke' }).click()

for (const q of ['benk', 'zercher', 'knebøy']) {
  await t(`søk «${q}»: treff og knapper over tastaturet`, async () => {
    await page.getByRole('button', { name: /Legg til øvelse/ }).first().click()
    await page.fill('.sheet input', q)
    await page.evaluate((kb) => window.__kb(kb), KB)
    await page.waitForTimeout(200)
    const visibleBottom = await page.evaluate(() => window.visualViewport.height)
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('.sheet input, .sheet .list-item, .sheet .btn')].map((el) => ({ t: el.textContent.trim().slice(0, 20), b: el.getBoundingClientRect().bottom, top: el.getBoundingClientRect().top })),
    )
    const sheet = await page.evaluate(() => document.querySelector('.sheet').getBoundingClientRect().bottom)
    if (sheet > visibleBottom + 1) throw new Error(`sheet bottom ${sheet} > visible ${visibleBottom}`)
    // the first result row (or the "create" button when nothing matched) must be visible
    const firstAction = boxes.find((b) => b.t && !b.t.startsWith('Søk'))
    if (firstAction && firstAction.b > visibleBottom) throw new Error(`«${firstAction.t}» under keyboard (${firstAction.b} > ${visibleBottom})`)
    await page.screenshot({ path: `${out}/picker-${q}.png` })
    await page.evaluate(() => window.__kb(0))
    await page.keyboard.press('Escape')
  })
}

await t('ingen +/- under kg og reps når man skriver', async () => {
  await page.getByRole('button', { name: /Legg til øvelse/ }).first().click()
  await page.fill('.sheet input', 'benk')
  await page.locator('.sheet .list-item').first().click()
  await page.getByRole('button', { name: /Legg til 1 øvelse/ }).click()
  await page.getByLabel('Vekt sett 1').click()
  await page.waitForTimeout(150)
  if (await page.locator('.stepper').count()) throw new Error('stepper still shown')
  if (await page.getByRole('button', { name: '+2,5' }).count()) throw new Error('+2,5 button shown')
})

await t('settnummer åpner meny med oppvarming og slett', async () => {
  await page.getByLabel('Vekt sett 1').fill('100')
  await page.getByRole('button', { name: 'Sett 1: oppvarming, skiver eller slett' }).click()
  await page.getByText('Skiver for 100 kg').waitFor()
  await page.screenshot({ path: `${out}/set-menu.png` })
  await page.getByRole('button', { name: 'Gjør til oppvarmingssett' }).click()
  if (!(await page.locator('.set-idx.warm').count())) throw new Error('not warmup')
  const before = await page.locator('.ex-card .set-row').count()
  await page.getByRole('button', { name: 'Sett V1: oppvarming, skiver eller slett' }).click()
  await page.getByRole('button', { name: 'Slett sett' }).click()
  if ((await page.locator('.ex-card .set-row').count()) !== before - 1) throw new Error('set not deleted')
  await page.getByRole('button', { name: 'Angre' }).click()
  if ((await page.locator('.ex-card .set-row').count()) !== before) throw new Error('undo failed')
})

await t('bunnmeny skjules mens tastaturet er oppe', async () => {
  await page.evaluate((kb) => window.__kb(kb), KB)
  await page.waitForTimeout(100)
  if (await page.locator('.nav').isVisible()) throw new Error('nav visible over keyboard')
  await page.evaluate(() => window.__kb(0))
})

await t('innlogging: knapper over tastaturet (e-post og kode)', async () => {
  await page.evaluate(() => (localStorage.removeItem('jernlogg.me'), localStorage.setItem('jernlogg.noMe', '1')))
  await page.reload()
  for (const [field, button, value] of [
    ['E-post', 'Send meg en kode', 'erik@test.no'],
    ['Kode fra e-posten', 'Logg inn', '12'],
  ]) {
    await page.getByLabel(field).click()
    await page.getByLabel(field).fill(value)
    await page.evaluate((kb) => window.__kb(kb), KB)
    await page.waitForTimeout(250)
    const visibleBottom = await page.evaluate(() => window.visualViewport.height)
    const b = await page.getByRole('button', { name: button, exact: true }).evaluate((el) => el.getBoundingClientRect().bottom)
    if (b > visibleBottom) throw new Error(`«${button}» under tastaturet (${b} > ${visibleBottom})`)
    await page.screenshot({ path: `${out}/login-${field.replace(/\W+/g, '-')}.png` })
    await page.evaluate(() => window.__kb(0))
    if (button === 'Send meg en kode') await page.getByRole('button', { name: button }).click()
  }
})

await browser.close()
server.kill()
console.log(errors.length ? '\nFEIL:\n' + errors.join('\n') : '\nAlle tastatur-tester OK')
process.exit(errors.length ? 1 : 0)
