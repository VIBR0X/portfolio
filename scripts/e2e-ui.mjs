// Exercises the DOM layer: panels, map, help, text résumé, mobile controls, keyboard shortcuts.
import { chromium } from 'playwright-core'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const url = arg('--url', 'http://localhost:5179/')
const out = arg('--out', `${tmpdir()}/portfolio-ui`)
const mobile = process.argv.includes('--mobile')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
  : { viewport: { width: 1280, height: 720 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
const tag = mobile ? 'm' : 'd'
await page.screenshot({ path: `${out}/${tag}0-start.png` })
await page.click('#start-btn')
await page.waitForTimeout(2500)

const shot = async (name) => page.screenshot({ path: `${out}/${tag}-${name}.png` })
const check = async (name, sel) => ({ name, visible: await page.locator(sel).isVisible().catch(() => false) })
const results = []

// Detail panel via a teleport + pad interaction
await page.evaluate(() => window.__world.teleportTo('experience'))
await page.waitForTimeout(900)
await page.evaluate(() => window.__world.ui.showEntry('tark'))
await page.waitForTimeout(500)
results.push(await check('panel', '#panel'))
await shot('panel')

// prev/next inside the panel
const navText = await page.locator('.panel-nav button').first().textContent().catch(() => null)
results.push({ name: 'panel-prev-label', value: navText })
await page.locator('.panel-nav button').last().click()
await page.waitForTimeout(300)
results.push({ name: 'panel-next-title', value: await page.locator('#panel h2').textContent().catch(() => null) })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
results.push(await check('panel-closed-by-esc', '#panel'))

// Map
await page.keyboard.press('m')
await page.waitForTimeout(400)
results.push(await check('map', '#map'))
await shot('map')
results.push({ name: 'map-entries', value: await page.locator('#map-list button').count() })
await page.keyboard.press('m')
await page.waitForTimeout(300)

// Help
await page.keyboard.press('c')
await page.waitForTimeout(400)
results.push(await check('help', '#help'))
await shot('help')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// Text résumé
await page.keyboard.press('t')
await page.waitForTimeout(500)
results.push(await check('resume', '#resume'))
results.push({ name: 'resume-mentions-epik', value: await page.locator('#resume').innerText().then((t) => t.includes('Founding Data Engineer')) })
await shot('resume')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// Number-key teleport
await page.keyboard.press('8')
await page.waitForTimeout(900)
results.push({ name: 'teleport-8-playground', value: await page.evaluate(() => window.__world.currentSection?.id) })
await shot('teleport8')

// Click a board in the world: a visitor who does not want to drive must still get in.
await page.evaluate(() => window.__world.teleportTo('experience'))
await page.waitForTimeout(1200)
const clickHit = await page.evaluate(() => {
  const w = window.__world
  // A pointer label is now a string, a { title, sub, hint } record, or a thunk returning either,
  // so that the hover tooltip can carry a subtitle and a live verb.
  const labelOf = (t) => { const l = typeof t.label === 'function' ? t.label() : t.label; return typeof l === 'object' && l ? l.title : l }
  const target = w.pointer.targets.find((t) => labelOf(t) === 'TARK')
  if (!target) return { found: false }
  const p = new w.car.group.position.constructor()
  target.object.getWorldPosition(p)
  p.project(w.experience.camera)
  return { found: true, x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight }
})
if (clickHit.found) {
  await page.mouse.click(clickHit.x, clickHit.y)
  await page.waitForTimeout(400)
}
results.push({ name: 'click-board-opens-panel', value: await page.evaluate(() => window.__world.ui.panelOpen && window.__world.ui.currentEntry) })
await shot('click-board')
await page.keyboard.press('Escape')

// Touch controls presence
results.push({ name: 'touch-controls', value: await page.locator('.touch-controls').count() })
if (mobile) {
  await page.evaluate(() => window.__world.teleportTo('contact'))
  await page.waitForTimeout(1200)
  await shot('mobile-contact')
  results.push({ name: 'joystick', value: await page.locator('.joystick').isVisible() })
}

console.log(JSON.stringify(results, null, 1))
console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
process.exit(errors.length ? 1 : 0)
