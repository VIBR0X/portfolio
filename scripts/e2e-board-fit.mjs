// Board copy fit, measured in a REAL browser.
//
// scripts/dom-stub.mjs fakes measureText as `len × size × 0.55`, so the Node audits cannot see
// text wrap: check-boards.mjs said "all board and label text fits" while the WINNER board printed
// seven lines onto a four-line panel and the Experience bay boards ran into their counters.
//
// makeBoardTexture now fits each board's copy to its plate and records the result on
// texture.userData.fit. This reads every board's record off the running page and fails if any
// board overflowed, or had to shrink to the floor of the fit range (copy too long for the plate).
//
// Needs the dev server up: npm run dev, then node scripts/e2e-board-fit.mjs
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await b.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5179/', { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 30000 })
await page.click('#start-btn')
await page.waitForTimeout(2500)
const rows = await page.evaluate(() => {
  const out = []
  window.__world.scene.traverse((o) => {
    const fit = o.isMesh && o.material?.map?.userData?.fit
    if (!fit) return
    const p = new (o.position.constructor)()
    o.getWorldPosition(p)
    out.push({ title: o.material.map.userData.text.split('\n')[0], x: Math.round(p.x), z: Math.round(p.z), ...fit })
  })
  return out.sort((a, b) => a.x - b.x || a.z - b.z)
})
let bad = 0
for (const r of rows) {
  const floor = r.scale <= 0.7
  const flag = r.overflow ? 'OVERFLOW' : floor ? 'AT FLOOR' : 'ok      '
  if (r.overflow || floor) bad++
  console.log(`${flag} ×${r.scale.toFixed(2)}  ${String(r.needed).padStart(4)}/${String(r.avail).padStart(4)} px  (${r.x},${r.z})  ${r.title}`)
}
await b.close()
if (!rows.length) { console.error('no boards found'); process.exit(1) }
if (bad) { console.error(`\n${bad} of ${rows.length} boards do not fit their plate`); process.exit(1) }
console.log(`\n${rows.length} boards checked, every one fitted to its plate`)
