// Runde 22 (tilbakemeldinger fra Felix): settverdier kopieres nedover (svak farge), «Hent fra forrige økt»,
// hviletimer etter «Kjør!», lager ved avkrysning bakover, invitasjon fra nettleser til app.
// Lokal modus: node scripts/feedback-e2e.mjs [outDir]
import { chromium, devices } from 'playwright'
import { spawn } from 'child_process'
import fs from 'fs'
const out = process.argv[2] || '/tmp/claude-0/fb-shots'
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const PORT = 4189
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nb-NO', timezoneId: 'Asia/Seoul' })
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
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
    errors.push(`${name}: ${e.message.split('\n')[0]}`); if (process.env.DEBUG) console.log(e.message)
    console.log('✗', name, e.message.split('\n')[0])
    await shot('FAIL-' + name.replace(/\W+/g, '-'))
  }
}
const active = () => page.evaluate(() => window.__jernlogg.allDocs().find((d) => d.collection === 'workouts' && !d.deleted && d.data.status === 'active')?.data)

await page.goto(base)
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('jernlogg.me', 'felix')
  localStorage.setItem('jernlogg.tip1', '1')
  localStorage.setItem('jernlogg.installHidden', '1')
  // last time: bench 3 sets
  const start = new Date(Date.now() - 3 * 86400e3)
  window.__jernlogg.put('workouts', 'wPrev', {
    userId: 'felix', title: 'Push', startedAt: start.toISOString(), endedAt: new Date(start.getTime() + 3600e3).toISOString(), status: 'done',
    exercises: [{ uid: 'x1', exerciseId: 'benkpress', sets: [80, 80, 75].map((w, i) => ({ uid: 's' + i, weight: w, reps: 8, done: true })) }],
  })
})
await page.goto('about:blank')

async function addExercise(q) {
  await page.getByRole('button', { name: /Legg til øvelse/ }).first().click()
  await page.fill('.sheet input', q)
  await page.locator('.sheet .list-item').first().click()
  await page.getByRole('button', { name: /Legg til 1 øvelse/ }).click()
}

await t('varsel i appen når det er lenge siden sist', async () => {
  await page.goto(base + '#/feed')
  const r = page.getByRole('status', { name: 'Påminnelse om trening' })
  await r.getByText('Det er 3 dager siden sist – på tide med en økt?').waitFor()
  await shot('reminder')
  await r.getByRole('button', { name: 'Ikke i dag' }).click()
  await page.reload()
  await page.locator('.nav').waitFor()
  if (await page.getByRole('status', { name: 'Påminnelse om trening' }).count()) throw new Error('should stay hidden today')
  await page.evaluate(() => localStorage.removeItem('jernlogg.comebackHidden'))
})

await t('ny øvelse: kg og reps i sett 1 vises svakt i settene under', async () => {
  await page.goto(base + '#/okt')
  await page.locator('.kind-tile', { hasText: 'Styrke' }).click()
  await addExercise('knebøy')
  await page.getByRole('button', { name: '+ Legg til sett' }).click()
  await page.getByRole('button', { name: '+ Legg til sett' }).click()
  await page.getByLabel('Vekt sett 1', { exact: true }).fill('100')
  await page.getByLabel('Reps sett 1', { exact: true }).fill('5')
  await page.getByLabel('Vekt sett 1', { exact: true }).blur()
  const w2 = page.getByLabel('Vekt sett 2', { exact: true })
  if ((await w2.inputValue()) !== '') throw new Error('set 2 should stay empty (only a suggestion)')
  if ((await w2.getAttribute('placeholder')) !== '100') throw new Error('set 2 placeholder: ' + (await w2.getAttribute('placeholder')))
  if (!(await w2.getAttribute('class')).includes('ghost')) throw new Error('no faded style')
  if ((await page.getByLabel('Reps sett 3', { exact: true }).getAttribute('placeholder')) !== '5') throw new Error('not copied to set 3')
  await shot('ghost')
  // change set 2 → set 3 follows set 2
  await w2.fill('105')
  if ((await page.getByLabel('Vekt sett 3', { exact: true }).getAttribute('placeholder')) !== '105') throw new Error('set 3 should follow set 2')
  // tick set 3 without typing → uses suggestion
  await page.locator('.ex-card').first().locator('.set-row').nth(2).locator('.check').click()
  const ex = (await active()).exercises[0]
  if (ex.sets[2].weight !== 105 || ex.sets[2].reps !== 5 || !ex.sets[2].done) throw new Error('tick did not use suggestion ' + JSON.stringify(ex.sets[2]))
})

await t('hviletimer: etter «Kjør!» er −15 borte og +15 forlenger', async () => {
  await page.evaluate(() => localStorage.setItem('jernlogg.rest', JSON.stringify({ endAt: Date.now() - 3000, total: 90 })))
  await page.reload()
  await page.getByRole('timer').getByText('Kjør!').waitFor()
  if (await page.getByRole('button', { name: 'Trekk fra 15 sekunder' }).count()) throw new Error('−15 still shown')
  await shot('rest-over')
  await page.getByRole('button', { name: 'Forleng pausen med 15 sekunder' }).click()
  await page.getByRole('timer').getByText(/^0:1\d$/).waitFor()
  if (!(await page.getByRole('button', { name: 'Trekk fra 15 sekunder' }).count())) throw new Error('−15 should be back while counting')
  await page.getByRole('button', { name: 'Stopp hviletimer' }).click()
})

await t('benk med historikk: svake tall fra forrige økt + «Hent kg og reps fra forrige økt»', async () => {
  await addExercise('benkpress')
  const card = page.locator('.ex-card', { hasText: 'Benkpress' })
  if ((await card.locator('.set-row').count()) !== 3) throw new Error('should have 3 sets like last time')
  if ((await card.getByLabel('Vekt sett 3', { exact: true }).getAttribute('placeholder')) !== '75') throw new Error('last time per set as suggestion')
  await card.getByRole('button', { name: /Hent kg og reps fra forrige økt/ }).click()
  const vals = await card.locator('.set-input').evaluateAll((els) => els.map((e) => e.value))
  if (vals.join('|') !== '80|8|80|8|75|8') throw new Error('values: ' + vals.join('|'))
  await shot('fetch-prev')
  await page.getByRole('button', { name: 'Forkast økt' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Forkast' }).click()
})

await t('kreatin: lager = boks − 5 g × hver gang tatt (også dager krysset av bakover)', async () => {
  await page.goto(base + '#/profil')
  await page.locator('#supplementer').getByRole('button', { name: 'Legg til' }).click()
  await page.locator('.sheet').getByRole('button', { name: 'Kreatin', exact: true }).click()
  await page.locator('.sheet label:has-text("Lager") input').fill('50')
  await page.locator('.sheet').getByRole('button', { name: 'Lagre' }).click()
  await page.locator('#supplementer').getByText('50 g igjen').waitFor()
  await page.locator('#supplementer .supp-head').first().click()
  const day = (n) => page.evaluate((n) => {
    const x = new Date(Date.now() - n * 86400e3)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }, n)
  await page.getByRole('button', { name: `${await day(3)}: before` }).click()
  await page.getByRole('button', { name: `${await day(2)}: before` }).click()
  await page.getByText(/40 g igjen av 50/).waitFor()
  await shot('stock')
  await page.getByRole('button', { name: 'Lukk' }).click()
})

await t('stor «Tatt»-knapp: eksploderer, viser «Tatt ✓ kl.» og kan angres', async () => {
  await page.goto(base + '#/feed')
  const card = page.getByRole('region', { name: 'Supplementer i dag' })
  await card.getByRole('button', { name: 'Kreatin: tatt' }).click()
  if (!(await card.locator('.burst i').count())) throw new Error('no burst animation')
  await card.getByText('Kreatin tatt ✓').waitFor()
  await card.getByText(/kl\. \d\d:\d\d/).waitFor()
  await shot('taken')
  const logs = await page.evaluate(() => window.__jernlogg.allDocs().filter((d) => d.collection === 'supplement_logs' && !d.deleted).length)
  if (logs !== 3) throw new Error('logs: ' + logs)
  await card.getByRole('button', { name: 'Angre Kreatin' }).click()
  await card.getByRole('button', { name: 'Kreatin: tatt' }).waitFor()
  const after = await page.evaluate(() => window.__jernlogg.allDocs().filter((d) => d.collection === 'supplement_logs' && !d.deleted).length)
  if (after !== 2) throw new Error('undo failed: ' + after)
  await card.getByRole('button', { name: 'Kreatin: tatt' }).click()
  await page.goto(base + '#/profil')
  await page.locator('#supplementer').getByText('Kreatin tatt ✓').waitFor()
  await page.locator('#supplementer').getByText('35 g igjen').waitFor()
})

await t('invitasjon: lim inn lenke eller kode i appen', async () => {
  await page.goto(base + '#/grupper')
  await page.getByLabel('Invitasjonslenke eller kode').fill('https://jernlogg.vercel.app/#/bli-med/abcd1234')
  await page.getByRole('button', { name: 'Åpne' }).click()
  await page.waitForFunction(() => location.hash === '#/bli-med/abcd1234')
  await page.getByText('Fant ingen gruppe').waitFor()
  await page.goto(base + '#/grupper')
  await page.evaluate(() => navigator.clipboard.writeText('Bli med: https://jernlogg.vercel.app/#/koble/david/0a1b2c3d4e'))
  await page.getByRole('button', { name: 'Lim inn' }).click()
  await page.waitForFunction(() => location.hash === '#/koble/david/0a1b2c3d4e')
})

await t('iPhone i Safari: tilbud om å kopiere invitasjonen til appen', async () => {
  await page.evaluate(() => localStorage.removeItem('jernlogg.me'))
  await page.goto('about:blank')
  await page.goto(base + '#/bli-med/abcd1234')
  await page.getByText('Har du Jernlogg på hjem-skjermen?').waitFor()
  await page.getByRole('button', { name: 'Kopier lenken' }).click()
  await page.getByRole('button', { name: /Kopiert/ }).waitFor()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  if (!clip.endsWith('#/bli-med/abcd1234')) throw new Error('clipboard: ' + clip)
  await shot('safari-invite')
})

await browser.close()
server.kill()
console.log(errors.length ? '\nFEIL:\n' + errors.join('\n') : '\nAlle tilbakemeldings-tester OK')
process.exit(errors.length ? 1 : 0)
