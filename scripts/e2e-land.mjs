// Really lands the aircraft the way the HUD tells you to, and asserts the visitor is not told they
// crashed. Usage: node scripts/e2e-land.mjs [--url http://localhost:5179/]
//
// The defect this guards (measured 2026-09-09): airborne, throttle is the elevator, so the only way
// down is to hold S. That sinks at 4.67 m/s at the model's own ~20 m/s cruise equilibrium, against a
// 4.5 m/s limit -- so every naive landing from every altitude reported "Crashed - respawned", by a
// margin of 2-4%. Then the unbraked rollout ran 36-96 m into the crossroads signpost, which is a
// solid body, and crashed there too. A play-test crashed six landings out of six.
import { chromium } from 'playwright-core'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def }
const url = arg('--url', 'http://localhost:5179/')
const out = arg('--out', `${tmpdir()}/portfolio-land`)
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('error: ' + m.text()) })

const checks = []
const check = (name, ok, detail = '') => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`) }

await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
await page.click('#start-btn')
await page.waitForTimeout(2600)
await page.evaluate(() => { window.__world.experience._sample = null })

// Record every toast the site raises, so a "Crashed" anywhere in the run is visible.
await page.evaluate(() => {
  const w = window.__world
  w.__toasts = []
  const orig = w.ui.toast.bind(w.ui)
  w.ui.toast = (m, ms) => { w.__toasts.push(m); return orig(m, ms) }
})

/**
 * Put the aircraft over the runway at `height`, flying north at cruise, then hold S all the way down
 * with nothing else pressed — the approach the on-screen chip actually asks for.
 *
 * The runway (x ±7, z -112..32) is the longest clear strip in the world, and the heights tested are
 * the ones a straight-in approach can actually make from its north end: sink is 3.5 m/s at 20 m/s
 * ground speed, so every 1 m of altitude costs about 5.7 m of run, and the Skills yard stands across
 * the runway from z -44. Higher approaches need a circuit and a turn, which is piloting rather than
 * the defect under test — flying into the pipeline tanks, or into the 8 m sounding rocket at the east
 * end of the avenue, is a real crash and should stay one.
 */
async function land(height) {
  await page.evaluate(async (h) => {
    const w = window.__world
    w.__toasts.length = 0
    if (w.mode === 'plane') w.exitPlane()
    w.plane.physics.respawn()
    w.car.teleport(0, 26, 0)
    await new Promise((r) => setTimeout(r, 250))
    w.boardPlane()
    const p = w.plane.physics
    p.position.set(0, h, 20)
    p.yaw = 0            // north, down the runway
    p.pitch = 0
    p.bank = 0
    p.speed = 20         // the model's own airborne equilibrium
    p.airborne = true
    p.vy = 0
  }, height)
  await page.waitForTimeout(400)

  await page.keyboard.down('s')
  const touchdown = await page.evaluate(async () => {
    const w = window.__world
    for (let i = 0; i < 1500 && w.plane.physics.airborne; i++) await new Promise((r) => requestAnimationFrame(r))
    const p = w.plane.physics
    return { impactVy: +(p._lastVy ?? 0).toFixed(2), at: [+p.position.x.toFixed(1), +p.position.z.toFixed(1)], toasts: w.__toasts.slice() }
  })
  await page.keyboard.up('s')

  // Then let the rollout run with nothing pressed, which is what a visitor does.
  const rollout = await page.evaluate(async () => {
    const w = window.__world
    const p = w.plane.physics
    const z0 = p.position.z
    for (let i = 0; i < 1800 && p.speed > 0.3; i++) await new Promise((r) => requestAnimationFrame(r))
    return { m: +Math.abs(p.position.z - z0).toFixed(1), toasts: w.__toasts.slice() }
  })
  return { ...touchdown, rollout: rollout.m, toasts: rollout.toasts }
}

for (const height of [4, 6, 9]) {
  const r = await land(height)
  const crashed = r.toasts.some((t) => /crash/i.test(t))
  const landed = r.toasts.some((t) => /^Landed/i.test(t))
  check(`a held-S approach from ${height} m is not a crash`, !crashed, `impact vy ${r.impactVy} m/s, touchdown at ${JSON.stringify(r.at)}, rollout ${r.rollout} m, toasts ${JSON.stringify(r.toasts)}`)
  check(`  and it reports a landing`, landed, JSON.stringify(r.toasts))
  check(`  and its sink rate is inside the ${'4.5'} m/s limit`, Math.abs(r.impactVy) <= 4.5, `vy ${r.impactVy}`)
  check(`  and it rolls to a stop in under 30 m`, r.rollout < 30, `${r.rollout} m`)
  await page.screenshot({ path: `${out}/land-${height}m.png` })
}

// A boosted power dive must still be punished, or the touchdown grade means nothing.
{
  const r = await page.evaluate(async () => {
    const w = window.__world
    w.__toasts.length = 0
    if (w.mode === 'plane') w.exitPlane()
    w.plane.physics.respawn()
    w.car.teleport(0, 26, 0)
    await new Promise((r) => setTimeout(r, 250))
    w.boardPlane()
    const p = w.plane.physics
    p.position.set(0, 26, 20); p.yaw = 0; p.pitch = 0; p.bank = 0; p.speed = 38; p.airborne = true; p.vy = 0
    return true
  })
  await page.waitForTimeout(300)
  await page.keyboard.down('Shift')
  await page.keyboard.down('s')
  const hard = await page.evaluate(async () => {
    const w = window.__world
    for (let i = 0; i < 1500 && w.plane.physics.airborne; i++) await new Promise((r) => requestAnimationFrame(r))
    return { vy: +(w.plane.physics._lastVy ?? 0).toFixed(2), toasts: w.__toasts.slice() }
  })
  await page.keyboard.up('s'); await page.keyboard.up('Shift')
  check('a boosted power dive still lands hard', Math.abs(hard.vy) > 4.5, `vy ${hard.vy} m/s, toasts ${JSON.stringify(hard.toasts)}`)
}

console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
const failed = checks.filter((c) => !c.ok).length + errors.length
console.log(failed ? `${failed} FAILED` : `all ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
