// Long-run checks: idle drift, tab-switch dt clamp, wall tunnelling, memory, reduced motion.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] })
const results = []
const errors = []

async function session({ reducedMotion = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.goto('http://localhost:5179/', { waitUntil: 'load' })
  await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
  await page.click('#start-btn')
  await page.waitForTimeout(reducedMotion ? 400 : 2600)
  return { page, context }
}

// --- reduced motion: everything visible immediately, no swoop
{
  const { page, context } = await session({ reducedMotion: true })
  results.push({ name: 'reduced-motion-reveal-done', value: await page.evaluate(() => window.__world.reveal.done) })
  results.push({ name: 'reduced-motion-no-swoop', value: await page.evaluate(() => window.__world.camera.swoop === 0) })
  await context.close()
}

const { page, context } = await session()

// --- memory and object counts after the reveal
results.push({ name: 'gpu', value: await page.evaluate(() => {
  const i = window.__world.experience.renderer.info
  return { textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs?.length ?? null }
}) })

// --- idle for 25 s: nothing should drift or stay awake
const before = await page.evaluate(() => window.__world.physics.world.bodies.map((b) => [+b.position.x.toFixed(3), +b.position.y.toFixed(3), +b.position.z.toFixed(3)]))
await page.waitForTimeout(25000)
const after = await page.evaluate(() => window.__world.physics.world.bodies.map((b) => [+b.position.x.toFixed(3), +b.position.y.toFixed(3), +b.position.z.toFixed(3)]))
let maxDrift = 0
for (let i = 0; i < before.length; i++) {
  const d = Math.hypot(after[i][0] - before[i][0], after[i][1] - before[i][1], after[i][2] - before[i][2])
  if (d > maxDrift) maxDrift = d
}
results.push({ name: 'idle-25s-max-drift-m', value: +maxDrift.toFixed(3) })
results.push({ name: 'idle-awake-bodies', value: await page.evaluate(() => window.__world.physics.world.bodies.filter((b) => b.mass > 0 && b.sleepState !== 2).length) })

// --- tab hidden for 6 s then back: dt clamp must stop a fling
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
await page.waitForTimeout(6000)
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
await page.waitForTimeout(1200)
results.push({ name: 'after-tab-switch-car', value: await page.evaluate(() => {
  const p = window.__world.car.physics
  return { y: +p.position.y.toFixed(2), speed: +p.speed.toFixed(2) }
}) })

// --- drive flat out into the world boundary
results.push({ name: 'wall-tunnelling', value: await page.evaluate(async () => {
  const w = window.__world
  w.car.teleport(0, -100, Math.PI / 2)   // face west toward the x = -110 wall
  await new Promise((r) => setTimeout(r, 300))
  const input = { throttle: 1, steer: 0, boost: true, brake: false, jump: false }
  const orig = w.controls.update.bind(w.controls)
  w.controls.update = () => { orig(); w.controls.throttle = input.throttle; w.controls.boost = true }
  await new Promise((r) => setTimeout(r, 6000))
  w.controls.update = orig
  return { x: +w.car.physics.position.x.toFixed(1), inside: w.car.physics.position.x > -112 }
}) })

// --- audio graph should not grow without bound
results.push({ name: 'audio-nodes-after-100-hits', value: await page.evaluate(async () => {
  const s = window.__world.sounds
  for (let i = 0; i < 100; i++) { s._lastHit = 0; s.hit(1, 420) }
  await new Promise((r) => setTimeout(r, 500))
  return { state: s.ctx.state, running: s.ctx.state === 'running' }
}) })

console.log(JSON.stringify(results, null, 1))
console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await context.close()
await browser.close()
process.exit(errors.length ? 1 : 0)
