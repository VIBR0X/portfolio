// Boards the plane, takes off, flies, lands, exits. Needs `npx vite --port 5179` running.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def }
const out = arg('--out', '/tmp/fly')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await page.goto('http://localhost:5179/', { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
await page.click('#start-btn')
await page.waitForTimeout(2600)

const state = () => page.evaluate(() => {
  const w = window.__world
  const blob = w.shadows.items.find((i) => i.target === w.car.physics.chassisBody)
  const p = w.plane.position
  const c = w.car.physics.position
  const yaw = w.plane.physics.yaw
  return {
    mode: w.mode,
    y: +w.plane.position.y.toFixed(2),
    speed: +w.plane.speed.toFixed(1),
    airborne: !w.plane.grounded,
    carVisible: w.car.group.visible,
    carBlob: blob ? blob.enabled : null,
    // Offset from the plane in the plane's own frame: right = (cos yaw, 0, −sin yaw).
    carLateral: +((c.x - p.x) * Math.cos(yaw) - (c.z - p.z) * Math.sin(yaw)).toFixed(2),
    lapChip: [...document.querySelectorAll('*')].some((e) => /RING \d/.test(e.textContent || '') && !e.children.length),
    calls: w.experience.renderer.info.render.calls,
  }
})
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key) }
const checks = []
const check = (name, ok, detail) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }

// Drive onto the FLY pad and board.
await page.evaluate(() => window.__world.car.teleport(17, -3, 0))
await page.waitForTimeout(700)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
let s = await state()
check('boarding switches to plane mode', s.mode === 'plane', JSON.stringify(s))
check('the car is hidden while flying', s.carVisible === false, `carVisible=${s.carVisible}`)
check('and its blob shadow goes with it', s.carBlob === false, `carBlob=${s.carBlob}`)
// Orientation: at yaw 0 the propeller must sit at the nose end (−Z) on the fuselage centre line.
// This is the check that would have caught the sideways-built plane.
const nose = await page.evaluate(() => {
  const w = window.__world
  const p = w.plane.propHub.getWorldPosition(new w.plane.group.position.constructor())
  return { x: +(p.x - w.plane.group.position.x).toFixed(2), z: +(p.z - w.plane.group.position.z).toFixed(2) }
})
check('the propeller is at the nose, toward −Z', nose.z < -2.5 && Math.abs(nose.x) < 0.2, JSON.stringify(nose))
await page.screenshot({ path: `${out}/00-hardstand.png` })

// Full throttle down the hardstand until the wheels leave the ground.
await page.keyboard.down('Shift')
await hold('ArrowUp', 4000)
s = await state()
check('the plane leaves the ground', s.airborne === true, JSON.stringify(s))
await hold('ArrowUp', 2500)
await page.keyboard.up('Shift')
const climbed = await state()
check('it climbs above 8 m', climbed.y > 8, `y=${climbed.y}`)
await page.screenshot({ path: `${out}/01-airborne.png` })

// Bank a full turn to check the yaw response.
const yawBefore = await page.evaluate(() => window.__world.plane.physics.yaw)
await hold('ArrowLeft', 1500)
const yawAfter = await page.evaluate(() => window.__world.plane.physics.yaw)
check('banking turns the plane', Math.abs(yawAfter - yawBefore) > 0.5, `yaw delta ${(yawAfter - yawBefore).toFixed(2)} rad`)

// Exiting mid-air must be refused.
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
s = await state()
check('exiting mid-air is refused', s.mode === 'plane', `mode=${s.mode}`)

// Dive back down and land. Hold the dive and poll rather than guessing a duration: the descent
// rate depends on airspeed, so the time needed scales with however high the climb above went.
await page.keyboard.down('ArrowDown')
let grounded = false
for (let i = 0; i < 40 && !grounded; i++) {
  await page.waitForTimeout(500)
  grounded = await page.evaluate(() => window.__world.plane.grounded)
}
await page.keyboard.up('ArrowDown')
await page.waitForTimeout(500)
s = await state()
check('it comes back to the ground', s.airborne === false, JSON.stringify(s))
await page.screenshot({ path: `${out}/02-landed.png` })

// Once stopped, Enter hops out and the car comes back.
await page.waitForTimeout(2500)
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
s = await state()
check('exiting on the ground returns to the car', s.mode === 'car', JSON.stringify(s))
check('the car is visible again', s.carVisible === true, `carVisible=${s.carVisible}`)
check('its blob shadow is back', s.carBlob === true, `carBlob=${s.carBlob}`)
// 8.6 m wingspan: anything under 5.3 m to starboard is parked under the wing.
check('the car is parked clear of the wingspan', s.carLateral > 5.3, `lateral=${s.carLateral} m`)
check('the air-race chip does not follow you out of the plane', s.lapChip === false, `lapChip=${s.lapChip}`)

console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
process.exit(checks.some((c) => !c.ok) || errors.length ? 1 : 0)
