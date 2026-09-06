import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new','--use-gl=angle','--use-angle=default','--enable-gpu','--ignore-gpu-blocklist'] })
const page = await b.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5179/', { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
await page.click('#start-btn'); await page.waitForTimeout(3000)
const r = await page.evaluate(async () => {
  const w = window.__world
  w.car.teleport(22, 8, 0); w.camera.snap(w.car.physics.position); w.ui.hideCard?.()
  if (w.dustDevils) { w.dustDevils.mesh.visible = false; for (const d of w.dustDevils.devils) { d.x = w.extents.x0 + 4; d.z = w.extents.z0 + 4 } }
  await new Promise(r => setTimeout(r, 1500))
  return new Promise((resolve) => {
    const off = w.experience.on('rendered', () => {
      off()
      const cam = w.experience.camera, V = cam.position.constructor
      const out = []
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const x = 30 + i * 0.6, z = 10 + j * 0.6
        const v = new V(x, 0.02, z).project(cam)
        const sx = ((v.x + 1) / 2) * w.experience.sizes.width, sy = ((1 - v.y) / 2) * w.experience.sizes.height
        const rgb = w.experience.readPixel(sx, sy)
        out.push({ x, z, sx: Math.round(sx), sy: Math.round(sy), b: Math.round((rgb[0]+rgb[1]+rgb[2])/3) })
      }
      const bs = out.map(o => o.b)
      resolve({ effects: w.experience.effects, low: w.experience.lowQuality, pr: w.experience.sizes.pixelRatio,
        ratio: +(Math.min(...bs)/Math.max(...bs)).toFixed(3),
        darkest: out.slice().sort((a,b2)=>a.b-b2.b).slice(0,3), brightest: out.slice().sort((a,b2)=>b2.b-a.b)[0] })
    })
  })
})
console.log(JSON.stringify(r))
await b.close()
