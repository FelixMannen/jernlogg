import { chromium } from 'playwright'
import fs from 'fs'
const svg = fs.readFileSync('public/icon.svg', 'utf8')
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
for (const s of [192, 512]) {
  const p = await b.newPage({ viewport: { width: s, height: s } })
  await p.setContent(`<html><body style="margin:0;background:#15181c">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`)
  await p.screenshot({ path: `public/icon-${s}.png`, omitBackground: false })
}
await b.close()
