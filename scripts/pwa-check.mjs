// Checks the production build as a PWA: manifest, icons, service worker, offline start, push UI states.
// Runs against `vite preview` without ?local=1 (Supabase is unreachable from the sandbox, so no data is written).
import { chromium, devices } from 'playwright'
import { spawn } from 'child_process'
import fs from 'fs'
const out = process.argv[2] || '/tmp/claude-0/pwa-shots'
fs.mkdirSync(out, { recursive: true })
const PORT = 4183
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))
const base = `http://localhost:${PORT}`
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const errors = []
const ok = (n, c, x = '') => (c ? console.log('✓', n) : (errors.push(n + ' ' + x), console.log('✗', n, x)))

// --- Android-ish Chrome ---
const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'nb-NO' })
await ctx.addInitScript(() => localStorage.setItem('jernlogg.me', 'felix'))
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await page.goto(base + '/')
const manifest = await (await page.request.get(base + '/manifest.webmanifest')).json()
ok('manifest has id/scope/standalone', manifest.id === '/' && manifest.scope === '/' && manifest.display === 'standalone')
ok('manifest has maskable icon', manifest.icons.some((i) => i.purpose === 'maskable'))
for (const i of manifest.icons) ok(`icon ${i.src} exists`, (await page.request.get(base + i.src)).ok())
ok('apple-touch-icon link', (await page.getAttribute('link[rel=apple-touch-icon]', 'href')) === '/apple-touch-icon.png')
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(() => {})
ok('service worker controls page', await page.evaluate(() => !!navigator.serviceWorker.controller))
await page.goto(base + '/#/profil')
await page.waitForSelector('#varsler')
const btn = await page.getByRole('button', { name: /Slå på varsler/ }).count()
ok('push: "Slå på varsler" button shown (state off)', btn === 1)
await page.locator('#varsler').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${out}/android-varsler.png` })
// offline start from cache
await ctx.setOffline(true)
await page.reload()
ok('app starts offline from cache', await page.locator('.nav').count().then((n) => n > 0))
await ctx.setOffline(false)

// --- iPhone Safari (not installed) ---
const ios = await browser.newContext({ ...devices['iPhone 13'], locale: 'nb-NO' })
await ios.addInitScript(() => localStorage.setItem('jernlogg.me', 'david'))
const ip = await ios.newPage()
await ip.goto(base + '/#/feed')
const shown = await ip.getByText('Legg Jernlogg på Hjem-skjermen').waitFor({ timeout: 20000 }).then(() => true, () => false)
ok('iOS: install guide on feed', shown)
await ip.screenshot({ path: `${out}/ios-feed.png` })
await ip.goto(base + '/#/profil')
await ip.waitForSelector('#varsler')
ok('iOS: varsler section asks to install first', (await ip.locator('#varsler').getByText('Legg til på Hjem-skjerm').count()) > 0)
await ip.locator('#varsler').scrollIntoViewIfNeeded()
await ip.screenshot({ path: `${out}/ios-varsler.png` })

await browser.close()
server.kill()
console.log(errors.length ? '\nFEIL:\n' + errors.join('\n') : '\nPWA-sjekk OK')
process.exit(errors.length ? 1 : 0)
