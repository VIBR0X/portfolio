// Headless Chrome (GPU) run: start, teleport through sections, screenshot each, report errors + draw calls.
// Usage: node scripts/e2e.mjs [--url http://localhost:5179/] [--out dir] [--sections intro,projects]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def }
const url = arg('--url', 'http://localhost:5179/')
const out = arg('--out', '/tmp/claude-1000/-home-vedant-kriv-portfolio/37e013c9-8752-4efd-a8ff-bf9b3cb39380/scratchpad/shots')
const only = arg('--sections', '').split(',').filter(Boolean)
const mobile = process.argv.includes('--mobile')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
await page.screenshot({ path: `${out}/00-start.png` })
await page.click('#start-btn')
await page.waitForTimeout(2600)
await page.screenshot({ path: `${out}/01-intro.png` })
const stats = await page.evaluate(() => {
  const w = window.__world
  const info = w.experience.renderer.info.render
  return { calls: info.calls, triangles: info.triangles, bodies: w.physics.world.bodies.length, sections: w.sections.map((s) => s.id) }
})
console.log('after reveal', JSON.stringify(stats))
const ids = only.length ? only : stats.sections
let n = 2
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
    return { fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(0), calls: info.calls, triangles: info.triangles, car: [+w.car.physics.position.x.toFixed(1), +w.car.physics.position.z.toFixed(1)] }
  })
  await page.screenshot({ path: `${out}/${String(n).padStart(2, '0')}-${id.replace(/:/g, '_')}.png` })
  console.log(id, JSON.stringify(r))
  n++
}
console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
process.exit(errors.filter((e) => e.startsWith('pageerror') || e.startsWith('error')).length ? 1 : 0)
