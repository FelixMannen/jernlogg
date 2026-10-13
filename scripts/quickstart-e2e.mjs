// Runde 25 (tilbakemeldinger fra Felix): hurtigstart med andre trykk på «Start», ukedager/ukenummer på treningsdager.
// Lokal modus: node scripts/quickstart-e2e.mjs [outDir]
import { chromium, devices } from 'playwright'
import { spawn } from 'child_process'
import fs from 'fs'
import { tmpdir } from 'os'
const out = process.argv[2] || `${tmpdir()}/jernlogg/qs-shots`
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const PORT = 4191
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined })
const errors = []
let ctx, page
// fresh context per scenario: the app's offline cache lives in IndexedDB, which localStorage.clear() does not touch
async function fresh() {
  await ctx?.close()
  ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nb-NO', timezoneId: 'Asia/Seoul' })
  page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
}
const base = `http://localhost:${PORT}/?local=1`
let n = 0
const shot = (name, el) => (el ?? page).screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` })
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
const active = () => page.evaluate(() => window.__jernlogg.allDocs().find((d) => d.collection === 'workouts' && !d.deleted && d.data.status === 'active')?.data)
// same as discardWorkout(): soft delete
const discard = async () => {
  await page.evaluate(() => {
    const d = window.__jernlogg.allDocs().find((d) => d.collection === 'workouts' && !d.deleted && d.data.status === 'active')
    if (d) window.__jernlogg.put('workouts', d.id, d.data, { deleted: true })
  })
  if (await active()) throw new Error('økta ble ikke forkastet')
}

// sessions: newest first in the array; days ago = index + 1
async function seed(kinds) {
  await fresh()
  await page.goto(base)
  await page.evaluate((kinds) => {
    localStorage.clear()
    localStorage.setItem('jernlogg.me', 'felix')
    localStorage.setItem('jernlogg.tip1', '1')
    localStorage.setItem('jernlogg.installHidden', '1')
    const J = window.__jernlogg
    J.put('templates', 'tPush', { name: 'Push', createdBy: 'felix', items: [{ exerciseId: 'benkpress', sets: 3, reps: 8 }] })
    kinds.forEach((k, i) => {
      const start = new Date(Date.now() - (i + 1) * 86400e3)
      const end = new Date(start.getTime() + 3600e3).toISOString()
      const base = { userId: 'felix', startedAt: start.toISOString(), endedAt: end, status: 'done' }
      if (k === 'run') J.put('workouts', 'w' + i, { ...base, title: 'Løpetur', kind: 'run', exercises: [], run: { distanceKm: 5, durationSec: 1500 } })
      else
        J.put('workouts', 'w' + i, {
          ...base,
          title: k === 'push' ? 'Push' : 'Kveldsøkt',
          templateId: k === 'push' ? 'tPush' : undefined,
          exercises: [{ uid: 'x' + i, exerciseId: 'benkpress', sets: [{ uid: 's' + i, weight: 80, reps: 8, done: true }] }],
        })
    })
  }, kinds)
  await page.goto('about:blank')
}

const startBtn = () => page.locator('nav.nav a[href="#/okt"]')

await t('første trykk på Start viser startskjermen med tips', async () => {
  await seed(['empty', 'push', 'push', 'run', 'push', 'empty'])
  await page.goto(base + '#/feed')
  await startBtn().click()
  await page.getByText('Trykk på + igjen for å starte «Push» med en gang').waitFor()
  if (await active()) throw new Error('første trykk startet en økt')
  await shot('start-screen')
})

await t('andre trykk starter malen man bruker oftest', async () => {
  await startBtn().click()
  await page.getByRole('button', { name: 'Fullfør', exact: true }).waitFor()
  const a = await active()
  if (a?.templateId !== 'tPush' || a.title !== 'Push') throw new Error('feil økt: ' + JSON.stringify(a?.title))
  await shot('quick-push')
})

await t('Start mens en økt pågår åpner bare økta', async () => {
  await page.goto(base + '#/feed')
  await startBtn().click()
  await page.getByRole('button', { name: 'Fullfør', exact: true }).waitFor()
  await startBtn().click()
  const n = await page.evaluate(() => window.__jernlogg.allDocs().filter((d) => d.collection === 'workouts' && d.data.status === 'active').length)
  if (n !== 1) throw new Error(n + ' aktive økter')
  await discard()
})

await t('flest løpeturer → stoppeklokke', async () => {
  await seed(['run', 'push', 'run', 'empty', 'run'])
  await page.goto(base + '#/okt')
  await page.getByText('starte en løpetur med stoppeklokke').waitFor()
  await startBtn().click()
  await page.waitForFunction(() => window.__jernlogg.allDocs().some((d) => d.collection === 'workouts' && d.data.status === 'active' && d.data.kind === 'run'))
  await shot('quick-run')
  await discard()
})

await t('uavgjort → den nyeste typen vinner, ingen historikk → tom styrkeøkt', async () => {
  await seed(['empty', 'push'])
  await page.goto(base + '#/okt')
  await page.getByText('starte en tom styrkeøkt').waitFor()
  await seed([])
  await page.goto(base + '#/okt')
  await page.getByText('starte en tom styrkeøkt').waitFor()
  await startBtn().click()
  await page.getByRole('button', { name: 'Fullfør', exact: true }).waitFor()
  const a = await active()
  if (a.templateId || a.exercises.length) throw new Error('ikke tom økt')
  await discard()
})

await t('treningsdager: ukedager til venstre og ukenummer øverst', async () => {
  await seed(['push', 'empty', 'run', 'push'])
  await page.goto(base + '#/profil')
  const card = page.locator('section.card', { has: page.getByRole('heading', { name: 'Treningsdager' }) })
  await card.waitFor()
  const days = await card.locator('.heat-day').allTextContents()
  if (days.join('') !== 'MTOTFLS') throw new Error('ukedager: ' + days.join(''))
  const weeks = await card.locator('.heat-week').allTextContents()
  if (weeks.length !== 18) throw new Error(weeks.length + ' ukenumre')
  const thisWeek = await page.evaluate(() => {
    const d = new Date()
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
    return String(Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7))
  })
  if (weeks.at(-1) !== thisWeek) throw new Error(`siste uke ${weeks.at(-1)}, forventet ${thisWeek}`)
  // the training day from yesterday must sit in yesterday's weekday row
  const y = new Date(Date.now() - 86400e3)
  const key = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
  const row = await card.locator(`.heat i[title="${key}"]`).evaluate((el) => {
    const kids = [...el.parentElement.children]
    return Math.floor(kids.indexOf(el) / 19) - 1
  })
  const expected = (y.getDay() + 6) % 7
  if (row !== expected) throw new Error(`i går havnet i rad ${row}, forventet ${expected}`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  if (overflow) throw new Error('horisontal scroll')
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await shot('heatmap', card)
})

await browser.close()
server.kill()
if (errors.length) {
  console.log('\nFEIL:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\nAlle hurtigstart- og kalendertester OK')
