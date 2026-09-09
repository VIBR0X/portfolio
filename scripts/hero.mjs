// Captures a few framed shots for sharing.
import { chromium } from 'playwright-core'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const out = process.argv[2] || `${tmpdir()}/portfolio-hero`
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 })
await page.goto('http://localhost:5179/', { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
await page.click('#start-btn')
await page.waitForTimeout(3000)
const shots = [
  ['intro', () => window.__world.car.teleport(0, 6, 0)],
  ['hangars', () => window.__world.car.teleport(-46, -28, -0.5)],
  ['projects', () => window.__world.car.teleport(46, -30, 0.4)],
  ['skills', () => window.__world.car.teleport(0, -54, 0)],
  ['tower', () => window.__world.car.teleport(2, -90, 0)],
  ['playground', () => window.__world.car.teleport(56, 46, 0.6)],
  ['contact', () => window.__world.car.teleport(0, 52, 0)],
]
let i = 1
for (const [name, fn] of shots) {
  await page.evaluate(fn)
  await page.waitForTimeout(1500)
  await page.evaluate(() => { window.__world.ui.hideCard(); document.getElementById('toast')?.classList.add('hidden') })
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${out}/${String(i).padStart(2, '0')}-${name}.png` })
  console.log(name)
  i++
}
await browser.close()
