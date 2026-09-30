// Headless Chrome (GPU) run: start, teleport through sections, screenshot each, report errors + draw calls.
// Usage: node scripts/e2e.mjs [--url http://localhost:5179/] [--out dir] [--sections intro,projects] [--no-effects] [--mobile] [--free-tier]
//
// The auto-quality sampler drops the AO pass ~8 s after START and the resolution tier ~11 s, and it
// only ever lowers. Left alone it changes the tier mid-sweep, which is why this script once reported
// Projects at 14 fps / 245 calls and, on the same tree, 60 fps / 378 calls. Every run therefore pins
// the tier before measuring; --free-tier restores the old behaviour for testing the fallback itself.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def }
const url = arg('--url', 'http://localhost:5179/')
const out = arg('--out', `${tmpdir()}/portfolio-shots`)
const only = arg('--sections', '').split(',').filter(Boolean)
const mobile = process.argv.includes('--mobile')
const noEffects = process.argv.includes('--no-effects')
const freeTier = process.argv.includes('--free-tier')
// Budgets from the Mars spec §Budget; asserted below so a regression fails the run.
const MAX_CALLS = 450
const MAX_BODIES = 300
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
if (noEffects) await page.evaluate(() => window.__world.experience.setEffects(false))
await page.screenshot({ path: `${out}/00-start.png` })
await page.click('#start-btn')
// Pin the quality tier so every number below is comparable (see the header note).
if (!freeTier) await page.evaluate(() => { window.__world.experience._sample = null; window.__world.experience.setEffects(true) })
await page.waitForTimeout(2600)
await page.screenshot({ path: `${out}/01-intro.png` })
const stats = await page.evaluate(() => {
  const w = window.__world
  const info = w.experience.renderer.info.render
  return { calls: info.calls, triangles: info.triangles, bodies: w.physics.world.bodies.length, effects: w.experience.effects, quality: w.experience.quality, sections: w.sections.map((s) => s.id) }
})
console.log('after reveal', JSON.stringify(stats))
const ids = only.length ? only : stats.sections
let n = 2
const over = []
for (const id of ids) {
  const [sec, x, z] = id.split(':')
  if (x !== undefined) await page.evaluate(([x, z]) => window.__world.car.teleport(Number(x), Number(z), 0), [x, z])
  else await page.evaluate((id) => window.__world.teleportTo(id), sec)
  await page.waitForTimeout(1400)
  const r = await page.evaluate(async () => {
    const w = window.__world
    let frames = 0
    const off = w.experience.on('update', () => frames++)
    const t0 = performance.now()
    await new Promise((r) => setTimeout(r, 1000))
    off()
    const info = w.experience.renderer.info.render
    return { fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(0), calls: info.calls, triangles: info.triangles, bodies: w.physics.world.bodies.length, effects: w.experience.effects, low: w.experience.lowQuality, car: [+w.car.physics.position.x.toFixed(1), +w.car.physics.position.z.toFixed(1)] }
  })
  await page.screenshot({ path: `${out}/${String(n).padStart(2, '0')}-${id.replace(/:/g, '_')}.png` })
  console.log(id, JSON.stringify(r))
  if (r.calls > MAX_CALLS) over.push(`${id}: ${r.calls} draw calls > ${MAX_CALLS}`)
  if (r.bodies > MAX_BODIES) over.push(`${id}: ${r.bodies} bodies > ${MAX_BODIES}`)
  n++
}
console.log('budget:', over.length ? '\n' + over.join('\n') : `ok (<= ${MAX_CALLS} calls, <= ${MAX_BODIES} bodies at every viewpoint)`)
console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
const failed = errors.filter((e) => e.startsWith('pageerror') || e.startsWith('error')).length + over.length
process.exit(failed ? 1 : 0)
