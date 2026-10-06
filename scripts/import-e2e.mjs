// End-to-end test of #/import against the local-mode build: node scripts/import-e2e.mjs [outDir]
import { chromium, devices } from 'playwright'
import { spawn } from 'child_process'
import fs from 'fs'
const out = process.argv[2] || '/tmp/claude-0/import-shots'
fs.mkdirSync(out, { recursive: true })
const PORT = 4181
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nb-NO', timezoneId: 'Asia/Seoul' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
const base = `http://localhost:${PORT}/?local=1`
let n = 0
const shot = (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true })
const t = async (name, fn) => {
  try {
    await fn()
    console.log('✓', name)
  } catch (e) {
    errors.push(`${name}: ${e.message.split('\n')[0]}`)
    console.log('✗', name)
    await shot('FAIL-' + name.replace(/\W+/g, '-'))
  }
}
const open = async (hash) => {
  await page.goto('about:blank')
  await page.goto(base + hash)
  await page.waitForSelector('.page')
}
const workouts = () => page.evaluate(() => window.__jernlogg.allDocs().filter((d) => d.collection === 'workouts' && !d.deleted).map((d) => d.data))

await page.goto(base)
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('jernlogg.me', 'david') // logged in as David: imports are always saved on your own account
})

await t('1: lenke med bruker David', async () => {
  await open('#/import?d=bruker:David;Benkpress:3x15x80')
  if ((await page.locator('.ex-card').count()) !== 1) throw new Error('expected 1 exercise')
  if ((await page.locator('.ex-card .set-row').count()) !== 3) throw new Error('expected 3 sets')
  if (await page.getByText('Teksten gjelder').count()) throw new Error('unexpected user warning')
  const before = (await workouts()).length
  if (before !== 0) throw new Error('something was saved before pressing Lagre')
  await shot('case1')
  await page.getByRole('button', { name: 'Lagre økt' }).click()
  await page.waitForFunction(() => location.hash === '#/feed')
  const ws = await workouts()
  if (ws.length !== 1 || ws[0].userId !== 'david' || ws[0].exercises[0].sets.length !== 3 || ws[0].exercises[0].sets[0].weight !== 80) throw new Error('bad saved workout ' + JSON.stringify(ws))
  if ((await page.evaluate(() => location.href)).includes('d=')) throw new Error('d= still in URL after save')
})

await t('2: lim inn tekst med linjeskift', async () => {
  await open('#/import')
  await page.fill('textarea', '# Jernlogg v1\ndato: 2026-10-03\nvarighet: 75\nKnebøy: 2x10x60, 8x80, 6x90\nPull-ups: 3x8x0')
  await page.getByRole('button', { name: 'Tolk teksten' }).click()
  const cards = page.locator('.ex-card')
  if ((await cards.nth(0).locator('.set-row').count()) !== 4) throw new Error('squat should have 4 sets')
  if ((await cards.nth(1).locator('.set-row').count()) !== 3) throw new Error('pullups should have 3 sets')
  if ((await page.inputValue('input[type=datetime-local]')) !== '2026-10-03T12:00') throw new Error('date wrong')
  if ((await page.locator('label:has-text("Varighet") input').inputValue()) !== '75') throw new Error('duration wrong')
  if (await page.getByText('Teksten gjelder').count()) throw new Error('no user in text should not warn')
  await shot('case2')
})

await t('3: linje som ikke kan tolkes', async () => {
  await open('#/import?d=Benkpress: 3x15x80;Benk: tre sett')
  await page.getByText('Linje 2: «Benk: tre sett» – fant ikke sett i formatet SxRxKG eller RxKG').waitFor()
  if ((await page.locator('.ex-card').count()) !== 1) throw new Error('Benkpress should still import')
  await shot('case3')
})

await t('4: ukjent bruker og 82.5 kg', async () => {
  await open('#/import?d=bruker:Ola;Benkpress:3X15X82.5')
  await page.getByText('Teksten gjelder «Ola», men økta lagres på deg (David)').waitFor()
  if ((await page.getByLabel('Vekt sett 1 Benkpress').inputValue()) !== '82,5') throw new Error('82.5 not parsed')
})

await t('5: samme lenke igjen gir duplikatvarsel', async () => {
  await open('#/import?d=bruker:David;Benkpress:3x15x80')
  await page.getByText('Denne økta ser ut til å være lagret fra før').waitFor()
  if (await page.getByRole('button', { name: 'Lagre økt' }).isDisabled()) throw new Error('must still allow saving')
})

await t('enkoding: + og %C3%B8 og %0A', async () => {
  await open('#/import?d=bruker%3AErik%0ASittende+roing%3A12x80%2C10x80%0AKneb%C3%B8y%3A5x100')
  await page.getByText('Teksten gjelder «Erik»').waitFor()
  const names = await page.locator('.ex-card .ex-title .name').allTextContents()
  if (names.join('|') !== 'Sittende roing|Knebøy') throw new Error('names: ' + names.join('|'))
})

await t('ødelagt %-koding krasjer ikke', async () => {
  await open('#/import?d=notat:100%;Benkpress:5x100')
  if ((await page.locator('.ex-card').count()) !== 1) throw new Error('should import Benkpress')
})

await t('ukjent øvelse må avklares', async () => {
  await open('#/import?d=bruker:Felix;Benkpress:1x1x100;Zercher squat:3x5x80')
  await page.getByText('Ukjent øvelse «Zercher squat».').waitFor()
  if (!(await page.getByRole('button', { name: 'Lagre økt' }).isDisabled())) throw new Error('save should be disabled')
  await shot('unknown')
  await page.getByRole('button', { name: 'Opprett ny' }).click()
  await page.getByRole('button', { name: 'Lagre økt' }).click()
  await page.waitForFunction(() => location.hash === '#/feed')
  const ex = await page.evaluate(() => window.__jernlogg.allDocs().filter((d) => d.collection === 'exercises').map((d) => d.data.name))
  const last = (await workouts()).at(-1)
  if (!ex.includes('Zercher squat')) throw new Error('custom exercise not created ' + JSON.stringify({ ex, last }))
})

await t('fil-opplasting', async () => {
  await open('#/import')
  fs.writeFileSync('/tmp/claude-0/okt.md', '# Jernlogg v1\nbruker: david\nMarkløft: 3x5x140\n')
  await page.setInputFiles('input[type=file]', '/tmp/claude-0/okt.md')
  await page.locator('.ex-card').first().waitFor()
  if (await page.getByText('Teksten gjelder').count()) throw new Error('david (lowercase) not matched to me')
})

await t('ingen horisontal scroll', async () => {
  await open('#/import?d=bruker:David;Benkpress:3x15x80;Sittende roing:12x80,12x80,10x80;Kabelkryss:3x12x20;Pull-ups:3x8x0')
  const of = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  if (of) throw new Error('overflow')
  await shot('david-example')
})

await browser.close()
server.kill()
console.log(errors.length ? '\nFEIL:\n' + errors.join('\n') : '\nAlle import-tester OK')
process.exit(errors.length ? 1 : 0)
