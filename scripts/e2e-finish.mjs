// Finish checks in headless Chrome: lit regolith keeps its palette colour, the tower's shadow darkens
// the ground to 55–72 % of the light it would otherwise get, a board face stays exact cream, and open
// ground shows no shadow acne.
// Needs `npx vite --port 5179` running. Usage: node scripts/e2e-finish.mjs [--url http://localhost:5179/] [--no-effects]
import { chromium } from 'playwright-core'
import { palette } from '../src/world/Materials.js'
import { hexBytes } from '../src/world/Textures.js'
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def }
const url = arg('--url', 'http://localhost:5179/')
const noEffects = process.argv.includes('--no-effects')

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
if (noEffects) await page.evaluate(() => window.__world.experience.setEffects(false))
await page.click('#start-btn')
await page.waitForTimeout(3000)

/** Put the car at (carX, carZ), settle, then read the pixel under each world point (y ≈ ground) in the next frame. */
async function sample(carX, carZ, points) {
  return page.evaluate(async ([cx, cz, pts]) => {
    const w = window.__world
    w.car.teleport(cx, cz, 0)
    w.camera.snap(w.car.physics.position)
    w.ui.hideCard?.()
    w.ui.closePanel?.()
    await new Promise((r) => setTimeout(r, 1500))
    return new Promise((resolve) => {
      const off = w.experience.on('rendered', () => {
        off()
        const cam = w.experience.camera
        const V = cam.position.constructor
        const out = {}
        for (const [name, x, y, z] of pts) {
          const v = new V(x, y, z).project(cam)
          const sx = ((v.x + 1) / 2) * w.experience.sizes.width
          const sy = ((1 - v.y) / 2) * w.experience.sizes.height
          out[name] = { rgb: w.experience.readPixel(sx, sy), screen: [Math.round(sx), Math.round(sy)] }
        }
        resolve(out)
      })
    })
  }, [carX, carZ, points])
}

/** sRGB byte → linear light. The frame is sRGB-encoded (OutputPass) with NoToneMapping. */
const toLinear = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const bright = (rgb) => (rgb[0] + rgb[1] + rgb[2]) / 3
const light = (rgb) => (toLinear(rgb[0]) + toLinear(rgb[1]) + toLinear(rgb[2])) / 3
const results = []
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }

// 1. Lit open ground east of the runway, plus a 5×5 grid for the acne guard.
{
  const grid = []
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) grid.push([`g${i}_${j}`, 30 + i * 0.6, 0.02, 10 + j * 0.6])
  const s = await sample(22, 8, grid)
  const samples = Object.values(s).map((v) => v.rgb)
  // Mean of 25 samples, so the grain's speckle averages out; compared with the spec's lit-ground
  // target, the regolith base tone (spec §1.4: #B65E38 ±12). The grain's own mean (midway between
  // regolith and regolithLight) is not the target any more: the Mars light is warm by design
  // (sun #FFF0DE, sky #F1CFA8, ground #9C5535, a rust environment dome), so the lit ground keeps
  // the grain's red but loses ~20/255 of its green and blue, and no sun intensity in the allowed
  // range brings those back (measured 2026-09-05: sun 1.25 → 192,93,51; 1.5 → 197,96,54).
  const mean = [0, 1, 2].map((k) => samples.reduce((acc, rgb) => acc + rgb[k], 0) / samples.length)
  const target = hexBytes(palette.regolith)
  const dev = Math.max(...mean.map((c, k) => Math.abs(c - target[k])))
  check('lit regolith mean within ±12/channel of palette.regolith', dev <= 12, `mean rgb ${mean.map((c) => c.toFixed(0)).join(',')} vs regolith ${target.join(',')} (max deviation ${dev.toFixed(1)})`)
  const b = samples.map(bright)
  const ratio = Math.min(...b) / Math.max(...b)
  check('no acne: darkest of 25 ground samples ≥ 82 % of brightest', ratio >= 0.82, `ratio ${ratio.toFixed(3)}`)
}

// 2. The control tower's shadow (cab and roof, falling north-west of the base at (0,−104)) versus lit ground
//    mirrored on the north-east side. Both points are 0.5 m off the runway edge, so any wear darkening cancels.
//    The ratio is taken in linear light, not in sRGB bytes. LIGHTING is a light budget — Experience.js
//    aims for "shadowed regolith ≈ 55–72 % of lit" — and the sRGB transfer curve lifts that same shadow
//    once encoded. Decoding first is what makes 55–72 % mean the fraction of light the shadow removes.
{
  const s = await sample(0, -88, [['shade', -7.5, 0.02, -111.5], ['lit', 7.5, 0.02, -111.5]])
  const r = light(s.shade.rgb) / light(s.lit.rgb)
  check('tower shadow darkens the ground to 55–72 % of its light', r >= 0.55 && r <= 0.72, `shade ${s.shade.rgb.join(',')} lit ${s.lit.rgb.join(',')} linear ratio ${r.toFixed(3)}`)
}

// 3. The IIT Bombay board face (board at x 0, z −99.4, bottom 1.1, height 2.6, tilted 30° back): lower-right plain area.
{
  const s = await sample(0, -88, [['cream', 2.0, 1.1 + 0.6 * Math.cos(Math.PI / 6) + 0.13 * Math.sin(Math.PI / 6), -99.4 - 0.6 * Math.sin(Math.PI / 6) + 0.13 * Math.cos(Math.PI / 6)]])
  const cream = [255, 248, 234]
  const dev = Math.max(...s.cream.rgb.map((c, k) => Math.abs(c - cream[k])))
  check('board face stays Cream within ±6', dev <= 6, `rgb ${s.cream.rgb.join(',')} at ${s.cream.screen.join(',')}`)
}

console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
process.exit(results.some((r) => !r.ok) || errors.length ? 1 : 0)
