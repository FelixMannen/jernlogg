// Generates PNG icons from public/icon.svg: node scripts/icons.mjs
import { chromium } from 'playwright'
import fs from 'fs'
const svg = fs.readFileSync('public/icon.svg', 'utf8')
// full-bleed variant (no rounded corners) for iOS + maskable (art inside 70% safe zone)
const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/<rect width="512" height="512" rx="112" fill="#15181c"\/>/, '')
const fullBleed = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#15181c"/><g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${inner}</g></svg>`
// monochrome badge (Android status bar): white barbell on transparent
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><g fill="#fff"><rect x="8" y="44" width="80" height="8" rx="3"/><rect x="16" y="26" width="10" height="44" rx="3"/><rect x="28" y="32" width="8" height="32" rx="3"/><rect x="70" y="26" width="10" height="44" rx="3"/><rect x="60" y="32" width="8" height="32" rx="3"/></g></svg>`
const jobs = [
  ['public/icon-192.png', 192, svg, false],
  ['public/icon-512.png', 512, svg, false],
  ['public/apple-touch-icon.png', 180, fullBleed(1), false],
  ['public/icon-maskable-512.png', 512, fullBleed(0.72), false],
  ['public/badge-96.png', 96, badge, true],
]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
for (const [file, s, src, transparent] of jobs) {
  const p = await b.newPage({ viewport: { width: s, height: s } })
  await p.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#15181c'}">${src.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`)
  await p.screenshot({ path: file, omitBackground: transparent })
  await p.close()
}
await b.close()
console.log('icons ok')
