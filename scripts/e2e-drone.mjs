// Asserts stand 04's drone really follows the car: it patrols on its own, breaks off and closes on
// the car when the car is on the Projects range, trails rather than sticking to it, and rejoins its
// own figure-eight when the car leaves.
// Usage: node scripts/e2e-drone.mjs   (needs a dev server on :5179)
import { chromium } from 'playwright-core'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const out = `${tmpdir()}/portfolio-drone`
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await page.goto('http://localhost:5179/', { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
await page.click('#start-btn')
await page.waitForTimeout(2800)

const st = () => page.evaluate(() => {
  const w = window.__world
  const s = w.sectionById.get('projects')
  const d = s.drone.position
  const c = w.car.physics.position
  return { mode: s.droneMode, drone: [+d.x.toFixed(1), +d.y.toFixed(1), +d.z.toFixed(1)], gap: +Math.hypot(d.x - c.x, d.z - c.z).toFixed(1), height: +(d.y - c.y).toFixed(1), car: [+c.x.toFixed(1), +c.z.toFixed(1)] }
})
const go = async (x, z) => { await page.evaluate(([x, z]) => { const w = window.__world; w.car.teleport(x, z, 0); w.camera.snap(w.car.physics.position) }, [x, z]); await page.waitForTimeout(600) }
const hold = async (k, ms) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k) }
const results = []
const check = (n, ok, d) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n} — ${d}`) }

// Far away: it flies its own course.
await go(0, 40)
await page.waitForTimeout(2500)
const away = await st()
check('patrols its own course while the car is off the range', away.mode === 'patrol' && Math.hypot(away.drone[0] - 82, away.drone[2] + 42) < 5, `mode ${away.mode}, at ${away.drone}`)

// Inside the section but nowhere near stand 04: it must stay on its own exhibit.
await go(30, -31)
await page.waitForTimeout(2500)
const farSide = await st()
check('stays on its exhibit while the car is elsewhere in the section', farSide.mode === 'patrol', `mode ${farSide.mode} with the car ${Math.hypot(30 - 82, -31 + 42).toFixed(0)} m from the stand`)

// Arrive at stand 04's own pad. The chase used to begin anywhere inside the section AABB — from
// x >= 8, the crossroads' east exit, 74 m before the stand — so the figure-eight the stand exists to
// demonstrate was never once seen and the drone parked over the stencil instead. It now breaks off
// only within 24 m of its own stand, which is where a visitor reading that stand actually is.
await go(82, -33)
const arrive = await st()
await page.waitForTimeout(5000)
const closed = await st()
// It holds a deliberate station off the shoulder now, so "closes on the car" is no longer the
// assertion — arriving at the pad can already put it within a couple of metres. What matters is that
// it leaves its pattern and takes up station.
check('breaks off its pattern to follow the car', closed.mode === 'chase' && closed.gap < 8, `mode ${closed.mode}, gap ${arrive.gap} m -> ${closed.gap} m`)
check('holds station off the car, not on top of it', closed.gap < 8 && closed.gap > 1.5 && closed.height > 2.5, `gap ${closed.gap} m, ${closed.height} m up`)
await page.screenshot({ path: `${out}/01-following.png` })

// Sprint: it should trail, not stick. Sampled DURING the run and reduced to the peak lag — a
// single reading after the throttle is released catches the drone already closing again.
await page.keyboard.down('ArrowUp')
let peak = 0
for (let i = 0; i < 18; i++) { await page.waitForTimeout(100); peak = Math.max(peak, (await st()).gap) }
await page.keyboard.up('ArrowUp')
const sprint = await st()
check('trails under acceleration instead of sticking', peak > 4, `peak lag ${peak.toFixed(1)} m while driving`)
await page.screenshot({ path: `${out}/02-trailing.png` })
await page.waitForTimeout(3000)
const settled = await st()
check('closes again once the car slows', settled.gap < 8 && settled.gap > 1.5, `gap ${settled.gap} m at rest`)

// Leave the range: it goes home and rejoins the pattern.
await go(0, 40)
await page.waitForTimeout(9000)
const home = await st()
check('rejoins its own figure-eight when the car leaves', home.mode === 'patrol' && Math.hypot(home.drone[0] - 82, home.drone[2] + 42) < 5, `mode ${home.mode}, at ${home.drone}`)
await page.screenshot({ path: `${out}/03-home.png` })

console.log('errors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
process.exit(results.every(Boolean) && !errors.length ? 0 : 1)
