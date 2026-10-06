// End-to-end: innlogging, ny bruker, kobling av David, grupper (invitasjon, admin, mål, utfordring), privat økt,
// gruppe-toppliste, tilbakemeldinger med godkjenning, slett konto. Lokal modus: node scripts/groups-e2e.mjs [outDir]
import { chromium, devices } from 'playwright'
import { spawn } from 'child_process'
import fs from 'fs'
const out = process.argv[2] || '/tmp/claude-0/groups-shots'
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const PORT = 4187
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nb-NO', timezoneId: 'Europe/Oslo' })
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
    errors.push(`${name}: ${e.message.split('\n')[0]}`)
    console.log('✗', name, e.message.split('\n')[0])
    await shot('FAIL-' + name.replace(/\W+/g, '-'))
  }
}
const overflow = async (label) => {
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push('horizontal overflow on ' + label)
}
const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('jernlogg.localdb.v1') || '[]').filter((d) => !d.deleted))
const visible = (c) => page.evaluate((c) => window.__jernlogg.allDocs().filter((d) => d.collection === c && !d.deleted), c)
const me = () => page.evaluate(() => window.__jernlogg.getStatus().user)

async function login(email) {
  await page.getByLabel('E-post').fill(email)
  await page.getByRole('button', { name: 'Send meg en kode' }).click()
  await page.getByLabel('Kode fra e-posten').fill('123456')
}
async function logout() {
  await page.goto(base + '#/profil')
  await page.getByRole('button', { name: 'Innstillinger' }).click()
  await page.getByRole('button', { name: 'Logg ut' }).click()
  await page.getByLabel('E-post').waitFor()
}

// seed: the original three with history (as in production)
await page.goto(base)
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('jernlogg.tip1', '1')
  localStorage.setItem('jernlogg.installHidden', '1')
  const J = window.__jernlogg
  let k = 0
  for (const [user, kg] of [['felix', 80], ['david', 90], ['erik', 70]])
    for (let d = 1; d <= 3; d++) {
      const start = new Date(Date.now() - d * 86400e3)
      start.setHours(17, 0, 0, 0)
      J.put('workouts', `seed${k++}`, {
        userId: user, title: 'Push', startedAt: start.toISOString(), endedAt: new Date(start.getTime() + 3600e3).toISOString(), status: 'done',
        exercises: [{ uid: 'x' + k, exerciseId: 'benkpress', sets: [{ uid: 's' + k, weight: kg, reps: 5, done: true }] }],
      })
    }
  J.put('bodyweight', 'bw:david:2026-09-01', { userId: 'david', date: '2026-09-01', weight: 84 })
})
await page.goto('about:blank')

await t('innlogging: Felix kobles automatisk og ser gjengen', async () => {
  await page.goto(base + '#/feed')
  await shot('login')
  await login('felix@test.no')
  await page.waitForSelector('.nav')
  if ((await me()) !== 'felix') throw new Error('not felix: ' + (await me()))
  const ws = await visible('workouts')
  if (ws.length !== 9) throw new Error('felix should see 9 workouts, saw ' + ws.length)
  if ((await visible('bodyweight')).length) throw new Error('David’s bodyweight must be private')
  await shot('feed-felix')
})

let claimUrl = ''
await t('Felix lager koblingslenke for David', async () => {
  await page.goto(base + '#/profil')
  await page.getByRole('heading', { name: 'Koble David og Erik' }).scrollIntoViewIfNeeded()
  const row = page.locator('.card', { hasText: 'Koble David og Erik' })
  await row.getByRole('button', { name: 'Lag lenke' }).first().click()
  claimUrl = await page.getByLabel('Koblingslenke for David').inputValue()
  if (!/#\/koble\/david\/[0-9a-f]{10}$/.test(claimUrl)) throw new Error('bad link ' + claimUrl)
  await shot('claim-link')
})

let inviteUrl = ''
await t('ny bruker: registrering, ser ingen andres data', async () => {
  await logout()
  await login('sara@test.no')
  await page.getByText('Hva skal vi kalle deg?').waitFor()
  await page.getByLabel('Navn (vises for gruppene dine)').fill('Sara')
  await page.getByRole('radio', { name: 'Farge #2FB57C' }).click()
  await page.getByRole('radio', { name: 'Symbol 🦊' }).click()
  await shot('onboarding')
  await page.getByRole('button', { name: /Kom i gang/ }).click()
  await page.waitForFunction(() => location.hash === '#/grupper')
  if ((await visible('workouts')).length) throw new Error('new user must not see others’ workouts')
  if ((await visible('profiles')).some((p) => p.id !== 'profile:' + p.id.slice(8) || !p.id.startsWith('profile:u'))) throw new Error('sees other profiles')
  await page.goto(base + '#/feed')
  await page.getByText('Tren sammen med venner').waitFor()
  await shot('feed-new-user')
  await overflow('feed new user')
})

await t('Sara lager offentlig gruppe og deler invitasjon', async () => {
  await page.goto(base + '#/grupper')
  await page.getByRole('button', { name: /Lag ny gruppe/ }).click()
  await page.getByLabel('Navn').fill('Løpeklubben')
  await page.getByRole('button', { name: '🏃' }).click()
  await page.locator('.switch-row', { hasText: 'Offentlig gruppe' }).click()
  await page.getByRole('button', { name: 'Lag gruppe' }).click()
  await page.waitForFunction(() => location.hash.startsWith('#/g/g'))
  await page.getByText('Inviter noen').waitFor()
  await page.getByRole('button', { name: 'Del invitasjonslenke' }).click()
  await page.locator('svg.qr').waitFor()
  inviteUrl = await page.getByLabel('Invitasjonslenke', { exact: true }).inputValue()
  if (!/#\/bli-med\/[0-9a-f]{8}$/.test(inviteUrl)) throw new Error('bad invite ' + inviteUrl)
  await shot('invite')
  await page.getByRole('button', { name: 'Lukk' }).click()
  await overflow('group page')
})

await t('Sara setter felles mål og ukas utfordring', async () => {
  await page.getByRole('button', { name: 'Sett et felles mål' }).click()
  await page.getByRole('button', { name: 'Antall økter' }).click()
  await page.getByLabel(/^Mål/).fill('10')
  await page.getByRole('button', { name: 'Lagre mål' }).click()
  await page.getByText('av 10 økter').waitFor()
  await page.getByRole('button', { name: 'Sett ukas utfordring' }).click()
  await page.getByRole('button', { name: 'Flest økter' }).click()
  await page.getByRole('button', { name: 'Start utfordringen' }).click()
  await page.getByRole('heading', { name: '🎯 Flest økter' }).waitFor()
  await shot('goal-challenge', true)
})

await t('invitasjonslenke mens man er logget ut → logg inn → bli med', async () => {
  await logout()
  await page.goto(inviteUrl.replace('http://localhost:' + PORT + '/', base))
  await page.getByText('Logg inn for å bli med i gruppa').waitFor()
  await login('felix@test.no')
  await page.getByRole('button', { name: 'Bli med i gruppa' }).waitFor()
  await shot('join')
  await page.getByRole('button', { name: 'Bli med i gruppa' }).click()
  await page.waitForFunction(() => location.hash.startsWith('#/g/g'))
  await page.getByText('2 medlemmer').waitFor()
  const groups = await visible('groups')
  if (groups.length !== 2) throw new Error('felix should be in 2 groups')
})

await t('gruppevalg i feed og topplister', async () => {
  await page.goto(base + '#/feed')
  await page.getByRole('group', { name: 'Vis gruppe' }).getByRole('button', { name: /Løpeklubben/ }).click()
  const names = await page.getByRole('group', { name: 'Vis person' }).getByRole('button').allTextContents()
  if (names.join('|') !== 'Alle|Meg|Sara') throw new Error('scope people: ' + names.join('|'))
  await shot('feed-scope')
  await page.goto(base + '#/topp')
  await page.getByRole('group', { name: 'Vis gruppe' }).getByRole('button', { name: 'Alle grupper' }).click()
  await page.getByRole('heading', { name: 'Beste 1RM' }).waitFor()
  await overflow('topp')
})

await t('privat økt: telles for meg, usynlig for andre', async () => {
  await page.evaluate(() => {
    const start = new Date(Date.now() - 3600e3)
    window.__jernlogg.put('workouts', 'wPriv', {
      userId: 'felix', title: 'Rehab', private: true, startedAt: start.toISOString(), endedAt: new Date().toISOString(), status: 'done',
      exercises: [{ uid: 'p1', exerciseId: 'kneboy', sets: [{ uid: 'p2', weight: 200, reps: 5, done: true }] }],
    })
  })
  await page.goto(base + '#/feed')
  await page.locator('.private-tag').first().waitFor()
  await page.goto(base + '#/topp')
  const board = await page.locator('.card', { hasText: 'Volum denne uka' }).innerText()
  if (board.includes('1 000') || board.includes('1,0 t') || board.includes('1000')) throw new Error('private workout counted in leaderboard: ' + board)
  await logout()
  await login('sara@test.no')
  await page.waitForSelector('.nav')
  const ws = await visible('workouts')
  if (ws.some((w) => w.id === 'wPriv')) throw new Error('Sara sees private workout')
  if (!ws.some((w) => w.data.userId === 'felix')) throw new Error('Sara should see Felix’s normal workouts now')
  if (ws.some((w) => w.data.userId === 'david')) throw new Error('Sara must not see David (no shared group)')
})

await t('ukas utfordring og mål teller gruppevenner', async () => {
  const gid = (await visible('groups'))[0].id
  await page.goto(base + `#/g/${gid}`)
  await page.getByRole('heading', { name: '🎯 Flest økter' }).waitFor()
  const card = await page.locator('.card', { hasText: 'Flest økter' }).innerText()
  if (!card.includes('Felix')) throw new Error('challenge missing Felix: ' + card)
  await shot('group-sara', true)
})

await t('admin: gi admin videre og fjern medlem', async () => {
  const gid = (await visible('groups'))[0].id
  await page.goto(base + `#/g/${gid}`)
  await page.getByRole('button', { name: 'Valg for Felix' }).click()
  await page.getByRole('button', { name: /Gjør til admin/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Gi admin' }).click()
  await page.waitForFunction(() => !document.querySelector('[aria-label="Gruppeinnstillinger"]'))
  await page.waitForFunction((gid) => JSON.parse(localStorage.getItem('jernlogg.localdb.v1')).find((d) => d.id === gid)?.data.adminId === 'felix', gid)
  if (await page.getByRole('button', { name: 'Valg for Felix' }).count()) throw new Error('Sara still has admin controls')
})

await t('gruppe-toppliste (offentlige grupper)', async () => {
  await page.goto(base + '#/grupper/topp')
  await page.locator('.group-row', { hasText: 'Løpeklubben' }).waitFor()
  const row = await page.locator('.group-row', { hasText: 'Løpeklubben' }).innerText()
  if (!/2 medlemmer/.test(row)) throw new Error('row: ' + row)
  if (/Jernlogg-gjengen/.test(await page.locator('.page').innerText())) throw new Error('private group on public board')
  await shot('group-board')
  await overflow('group board')
})

await t('tilbakemelding fra ny bruker må godkjennes', async () => {
  await page.goto(base + '#/tilbakemeldinger')
  await page.locator('textarea').fill('Vil ha mørkere grafer')
  await page.getByRole('button', { name: 'Send tilbakemelding' }).click()
  await page.getByText('Venter på godkjenning').first().waitFor()
  await logout()
  await login('felix@test.no')
  await page.waitForSelector('.nav')
  await page.goto(base + '#/tilbakemeldinger')
  await page.locator('.fb-card', { hasText: 'Vil ha mørkere grafer' }).getByRole('button', { name: 'Godkjenn' }).click()
  await page.locator('.fb-card', { hasText: 'Vil ha mørkere grafer' }).getByText('Venter', { exact: true }).waitFor()
  await shot('feedback-approved')
})

await t('admin fjerner et medlem', async () => {
  const gid = (await visible('groups')).find((g) => g.data.name === 'Løpeklubben').id
  await page.goto(base + `#/g/${gid}`)
  await page.getByRole('button', { name: 'Valg for Sara' }).click()
  await page.getByRole('button', { name: 'Fjern fra gruppa' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Fjern' }).click()
  await page.getByText('1 medlem ·').waitFor()
  if ((await visible('workouts')).some((w) => w.data.userId.startsWith('u'))) throw new Error('still sees Sara’s workouts')
})

await t('David kobler kontoen sin med lenken', async () => {
  await logout()
  await page.goto(claimUrl.replace('http://localhost:' + PORT + '/', base))
  await page.getByText(/koble kontoen din til David/i).waitFor()
  await login('david@test.no')
  await page.getByRole('heading', { name: 'Er du David?' }).waitFor()
  await shot('claim')
  await page.getByRole('button', { name: 'Ja, koble til David' }).click()
  await page.waitForSelector('.nav')
  if ((await me()) !== 'david') throw new Error('not david')
  if ((await visible('bodyweight')).length !== 1) throw new Error('David should see his own bodyweight')
  if ((await visible('workouts')).filter((w) => w.data.userId === 'david').length !== 3) throw new Error('David’s history missing')
})

await t('endre navn og farge', async () => {
  await page.goto(base + '#/profil')
  await page.getByRole('button', { name: 'Innstillinger' }).click()
  await page.getByRole('button', { name: /trykk for å endre navn/ }).click()
  await page.getByLabel('Navn (vises for gruppene dine)').fill('Dave')
  await page.getByRole('button', { name: 'Lagre', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('heading', { name: 'Dave' }).waitFor()
})

await t('slett konto fjerner alt brukeren eier', async () => {
  await logout()
  await login('sara@test.no')
  await page.waitForSelector('.nav')
  const sara = await me()
  await page.goto(base + '#/profil')
  await page.getByRole('button', { name: 'Innstillinger' }).click()
  await page.getByRole('button', { name: 'Slett kontoen min' }).click()
  await page.getByLabel('Skriv SLETT for å bekrefte').fill('slett')
  await page.getByRole('button', { name: 'Slett alt for godt' }).click()
  await page.getByLabel('E-post').waitFor()
  const left = (await db()).filter((d) => d.data?.userId === sara || d.id === 'profile:' + sara)
  if (left.length) throw new Error('left behind: ' + left.map((d) => d.id).join(','))
  if (!(await db()).some((d) => d.data?.userId === 'felix' && d.collection === 'workouts')) throw new Error('others’ data touched')
})

await t('personvern-side', async () => {
  await login('felix@test.no')
  await page.waitForSelector('.nav')
  await page.goto(base + '#/personvern')
  await page.getByText('Kroppsvekt og supplementer').waitFor()
  await overflow('personvern')
})

await browser.close()
server.kill()
console.log(errors.length ? '\nFEIL:\n' + errors.join('\n') : '\nAlle innloggings- og gruppetester OK')
process.exit(errors.length ? 1 : 0)
