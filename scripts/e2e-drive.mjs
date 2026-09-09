// Drives the car for real in the browser: knocks the name over, uses a pad, resets, jumps.
import { chromium } from 'playwright-core'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const out = `${tmpdir()}/portfolio-drive`
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await page.goto('http://localhost:5179/', { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
await page.click('#start-btn')

// Catch the reveal mid-flight
await page.waitForTimeout(700)
await page.screenshot({ path: `${out}/00-reveal.png` })
await page.waitForTimeout(2000)

const state = () => page.evaluate(() => {
  const w = window.__world
  const intro = w.sectionById.get('intro')
  return {
    car: [+w.car.physics.position.x.toFixed(1), +w.car.physics.position.z.toFixed(1)],
    speed: +w.car.physics.speed.toFixed(1),
    lettersMoved: intro.letters.filter((l) => Math.abs(l.body.position.y - l.body.userData.home.p.y) > 0.25 || Math.hypot(l.body.position.x - l.body.userData.home.p.x, l.body.position.z - l.body.userData.home.p.z) > 0.4).length,
    area: w.areas.current?.label || null,
    panelOpen: w.ui.panelOpen,
    disturbed: intro.disturbed,
  }
})
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key) }
const log = []

log.push(['start', await state()])
await hold('ArrowUp', 2200)              // drive north into the name
await page.waitForTimeout(600)
log.push(['after-charge', await state()])
await page.screenshot({ path: `${out}/01-letters.png` })

await page.keyboard.press('r')           // R resets the toys in this section
await page.waitForTimeout(1600)
log.push(['after-reset', await state()])
await page.screenshot({ path: `${out}/02-reset.png` })

// Park on the ABOUT pad and open it
await page.evaluate(() => window.__world.car.teleport(0, -17, 0))
await page.waitForTimeout(600)
log.push(['on-pad', await state()])
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
log.push(['after-enter', await state()])
await page.screenshot({ path: `${out}/03-pad-panel.png` })

// Jump
await page.keyboard.press('Escape')
await page.evaluate(() => window.__world.teleportTo('playground'))
await page.waitForTimeout(900)
await hold('ArrowUp', 1500)
const airborne = await page.evaluate(async () => {
  const w = window.__world
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
  let peak = 0
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 25)); peak = Math.max(peak, w.car.physics.position.y) }
  return +peak.toFixed(2)
})
log.push(['jump-peak-y', airborne])
await page.screenshot({ path: `${out}/04-playground.png` })

// Boost top speed on the runway
await page.evaluate(() => window.__world.car.teleport(0, 20, 0))
await page.waitForTimeout(400)
await page.keyboard.down('Shift')
await hold('ArrowUp', 3000)
await page.keyboard.up('Shift')
log.push(['boost', await state()])

console.log(JSON.stringify(log, null, 1))
console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
process.exit(errors.length ? 1 : 0)
