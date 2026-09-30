// Loses and restores the WebGL context, then checks the scene comes back exactly as bright.
// scene.environment is a PMREM render target with no CPU-side image, so unlike every other texture
// the browser cannot re-upload it; if nothing regenerates it the scene silently loses its
// environment contribution and stays ~20 % darker, with no console error to notice.
// Usage: node scripts/e2e-context.mjs [--url http://localhost:5179/] [--no-effects] [--cycles 3]
import { chromium } from 'playwright-core'
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def }
const url = arg('--url', 'http://localhost:5179/')
const cycles = Number(arg('--cycles', 3))
const noEffects = process.argv.includes('--no-effects')

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
if (noEffects) await page.evaluate(() => window.__world.experience.setEffects(false))
await page.click('#start-btn')
await page.waitForTimeout(2600)

/** Mean of the same 5×5 open-regolith grid e2e-finish uses (only before/after are compared, so the Mars re-baseline changes nothing here). */
const sample = () => page.evaluate(async () => {
  const w = window.__world
  w.car.teleport(22, 8, 0)
  w.camera.snap(w.car.physics.position)
  w.ui.hideCard?.()
  w.ui.closePanel?.()
  await new Promise((r) => setTimeout(r, 1200))
  return new Promise((resolve) => {
    const off = w.experience.on('rendered', () => {
      off()
      const cam = w.experience.camera
      const V = cam.position.constructor
      const acc = [0, 0, 0]
      let n = 0
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const v = new V(30 + i * 0.6, 0.02, 10 + j * 0.6).project(cam)
        const rgb = w.experience.readPixel(((v.x + 1) / 2) * w.experience.sizes.width, ((1 - v.y) / 2) * w.experience.sizes.height)
        acc[0] += rgb[0]; acc[1] += rgb[1]; acc[2] += rgb[2]; n++
      }
      resolve(acc.map((c) => Math.round(c / n)))
    })
  })
})

const results = []
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }
const dev = (a, b) => Math.max(...a.map((c, i) => Math.abs(c - b[i])))

const before = await sample()
console.log(`lit ground before any loss: ${before.join(',')}`)

for (let i = 1; i <= cycles; i++) {
  await page.evaluate(() => {
    const gl = window.__world.experience.renderer.getContext()
    window.__lose = gl.getExtension('WEBGL_lose_context')
    window.__lose.loseContext()
  })
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__lose.restoreContext())
  await page.waitForTimeout(2200)
  const after = await sample()
  check(`lit ground unchanged after loss/restore ${i}`, dev(after, before) <= 2, `rgb ${after.join(',')} vs ${before.join(',')} (max Δ ${dev(after, before)})`)
}

// Control: the same pixel with no environment at all. If the restore had silently dropped the
// environment the reading above would land here instead, which is the failure this guards.
const dark = await page.evaluate(() => { window.__world.experience.scene.environment = null; return true }) && await sample()
check('the environment is worth measuring here', dev(dark, before) >= 10, `rgb ${dark.join(',')} with scene.environment = null (max Δ ${dev(dark, before)})`)

console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
process.exit(results.some((r) => !r.ok) || errors.length ? 1 : 0)
