// End-to-end test of running + workout edit/delete in local mode: node scripts/run-e2e.mjs [outDir]
import { chromium, devices } from 'playwright'
import { spawn } from 'child_process'
import fs from 'fs'
const out = process.argv[2] || '/tmp/claude-0/run-shots'
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const PORT = 4185
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nb-NO', timezoneId: 'Asia/Seoul' })
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
const docs = (c) => page.evaluate((c) => window.__jernlogg.allDocs().filter((d) => d.collection === c && !d.deleted), c)
const overflow = async (label) => {
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push('horizontal overflow on ' + label)
}

await page.goto(base)
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('jernlogg.me', 'felix')
  localStorage.setItem('jernlogg.tip1', '1')
  // one strength workout to edit/delete later
  window.__jernlogg.put('workouts', 'wS', {
    userId: 'felix', title: 'Push', status: 'done', startedAt: new Date(Date.now() - 86400e3 * 2).toISOString(), endedAt: new Date(Date.now() - 86400e3 * 2 + 3600e3).toISOString(),
    exercises: [{ uid: 'x1', exerciseId: 'benkpress', sets: [{ uid: 's1', weight: 80, reps: 8, done: true }] }],
  })
})
await page.goto('about:blank')
await page.goto(base + '#/feed')
await page.waitForSelector('.nav')

await t('start-skjerm har Styrke og Løpetur', async () => {
  await page.click('a[href="#/okt"]')
  await page.getByText('Løpetur', { exact: true }).waitFor()
  await shot('start')
  await page.locator('.kind-tile', { hasText: 'Løpetur' }).click()
  await page.waitForFunction(() => location.hash === '#/lop')
  await overflow('lop')
})

await t('lag rute', async () => {
  await page.getByRole('button', { name: 'Lag første rute' }).click()
  await page.fill('.sheet input >> nth=0', 'Elverunden')
  await page.fill('.sheet input >> nth=1', '6,4')
  await page.getByRole('button', { name: 'Lagre rute' }).click()
  await page.getByText('Elverunden').first().waitFor()
  await shot('lop-ruter')
})

await t('logg rute med bare tid → tempo', async () => {
  await page.getByRole('button', { name: 'Logg', exact: true }).click()
  await page.getByLabel('Tid', { exact: true }).fill('29:15')
  await page.getByText('4:34 /km').waitFor()
  await shot('form-rute', true)
  await page.getByRole('button', { name: 'Lagre løpetur' }).click()
  await page.waitForURL(/ferdig/)
  await page.getByText('6,4').first().waitFor()
  await shot('run-summary')
})

await t('bare tid gir oppfordring, men kan lagres', async () => {
  await page.goto(base + '#/lop/ny')
  await page.getByRole('button', { name: '30 min' }).click()
  await page.getByText('Legg til distansen for å få tempo').waitFor()
  await page.getByRole('button', { name: 'Lagre løpetur' }).click()
  await page.waitForURL(/ferdig/)
  const r = (await docs('workouts')).filter((d) => d.data.kind === 'run')
  if (!r.some((d) => d.data.run.durationSec === 1800 && !d.data.run.distanceKm)) throw new Error('time-only run not saved')
})

await t('raskere tur på ruta gir rute-PR', async () => {
  await page.goto(base + '#/lop/ny')
  await page.getByRole('button', { name: /Elverunden/ }).first().click()
  await page.getByLabel('Tid', { exact: true }).fill('28:40')
  await page.getByRole('button', { name: 'Lagre løpetur' }).click()
  await page.waitForURL(/ferdig/)
  await page.getByText('PR på Elverunden').waitFor()
})

await t('stoppeklokke: start, pause, stopp, lagre', async () => {
  await page.goto(base + '#/lop')
  await page.getByRole('button', { name: /Start stoppeklokke/ }).click()
  await page.waitForFunction(() => location.hash === '#/okt')
  await page.locator('.stopwatch-time').waitFor()
  await page.waitForTimeout(2200)
  await shot('stopwatch')
  await page.getByRole('button', { name: /Pause/ }).click()
  const t1 = await page.locator('.stopwatch-time').textContent()
  await page.waitForTimeout(1200)
  const t2 = await page.locator('.stopwatch-time').textContent()
  if (t1 !== t2) throw new Error(`timer moved while paused ${t1} → ${t2}`)
  await page.getByRole('button', { name: /Stopp/ }).click()
  await page.waitForURL(/lop\/ny\?fra=/)
  const v = await page.getByLabel('Tid', { exact: true }).inputValue()
  if (!/^0:0[2-4]$/.test(v)) throw new Error('stopwatch time ' + v)
  await page.getByLabel('Distanse i km').fill('0,01')
  await page.getByRole('button', { name: 'Lagre løpetur' }).click()
  await page.waitForURL(/ferdig/)
  const active = (await docs('workouts')).filter((d) => d.data.status === 'active')
  if (active.length) throw new Error('stopwatch run still active')
})

await t('feed viser løpekort + oppfordring', async () => {
  await page.goto(base + '#/feed')
  await page.getByText('+ Legg til distanse for tempo og rekorder').waitFor()
  await shot('feed', true)
  await overflow('feed')
})

await t('rediger tur fra ⋯-meny og legg til distanse', async () => {
  const card = page.locator('.feed-item', { hasText: '+ Legg til distanse' }).first()
  await card.getByRole('button', { name: 'Rediger eller slett' }).click()
  await page.getByRole('button', { name: 'Rediger løpeturen' }).click()
  await page.getByLabel('Distanse i km').fill('5')
  await page.getByRole('button', { name: 'Lagre endringer' }).click()
  await page.waitForURL(/#\/w\//)
  await page.getByText('6:00').waitFor()
})

await t('topplister: løping-fane', async () => {
  await page.goto(base + '#/topp')
  await page.getByRole('tab', { name: /Løping/ }).click()
  await page.getByText('Km denne uka').waitFor()
  await page.getByText('Rute-rekorder').waitFor()
  await shot('topp-lop', true)
  await overflow('topp-lop')
})

await t('ukesmål: fordelt + km-mål', async () => {
  await page.goto(base + '#/profil')
  await page.getByRole('button', { name: 'Innstillinger' }).click()
  await page.getByRole('button', { name: 'Fordelt' }).click()
  await page.getByRole('button', { name: '10', exact: true }).last().click()
  await page.keyboard.press('Escape')
  const g = await page.evaluate(() => window.__jernlogg.allDocs().find((d) => d.id === 'profile:felix')?.data.goal)
  if (g?.mode !== 'split' || g.km !== 10) throw new Error('goal not saved ' + JSON.stringify(g))
  await page.getByText('🏃 Løping').waitFor()
  await shot('profil', true)
  await page.goto(base + '#/feed')
  await page.locator('.goal-pips i.run').first().waitFor()
  await shot('feed-goals')
})

await t('styrkeøkt: endre dato/varighet og slett via ⋯', async () => {
  await page.goto(base + '#/w/wS')
  await page.getByRole('button', { name: 'Rediger eller slett' }).click()
  await page.getByRole('button', { name: /Endre dato/ }).click()
  await page.locator('label:has-text("Varighet") input').fill('75')
  await page.getByRole('button', { name: 'Lagre endringer' }).click()
  const w = (await docs('workouts')).find((d) => d.id === 'wS').data
  if (Date.parse(w.endedAt) - Date.parse(w.startedAt) !== 75 * 60000) throw new Error('duration not changed')
  await page.getByRole('button', { name: 'Rediger eller slett' }).click()
  await page.getByRole('button', { name: 'Slett økta' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Slett økt' }).click()
  await page.waitForFunction(() => location.hash === '#/feed')
  if ((await docs('workouts')).some((d) => d.id === 'wS')) throw new Error('not deleted')
})

await t('import av løpetur via lenke', async () => {
  await page.goto(base + '#/feed')
  await page.evaluate(() => localStorage.setItem('jernlogg.me', 'david'))
  await page.goto('about:blank')
  await page.goto(base + '#/import?d=bruker:David;L%C3%B8p:Elverunden+27:59')
  await page.getByText('Importer løpetur').waitFor()
  if (await page.getByText('Teksten gjelder').count()) throw new Error('should be saved on David without warning')
  if (!(await page.locator('.chip.on', { hasText: 'Elverunden' }).count())) throw new Error('route not matched')
  await shot('import-run')
  await page.getByRole('button', { name: 'Lagre løpetur' }).click()
  await page.waitForFunction(() => location.hash === '#/feed')
  const d = (await docs('workouts')).find((x) => x.data.userId === 'david' && x.data.kind === 'run')
  if (!d || d.data.run.durationSec !== 1679 || d.data.run.distanceKm !== 6.4) throw new Error('bad import ' + JSON.stringify(d?.data))
})

await t('styrke fortsatt ok: start og forkast', async () => {
  await page.goto(base + '#/feed')
  await page.evaluate(() => localStorage.setItem('jernlogg.me', 'felix'))
  await page.goto('about:blank')
  await page.goto(base + '#/okt')
  await page.locator('.kind-tile', { hasText: 'Styrke' }).click()
  await page.getByRole('button', { name: /Legg til øvelse/ }).first().waitFor()
  await page.getByRole('button', { name: 'Forkast økt' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Forkast' }).click()
})

await browser.close()
server.kill()
console.log(errors.length ? '\nFEIL:\n' + errors.join('\n') : '\nAlle løpe-tester OK')
process.exit(errors.length ? 1 : 0)
