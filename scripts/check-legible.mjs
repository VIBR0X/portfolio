// Every printed line drawn in the world must be big enough to read from where the visitor stands.
// Usage: node scripts/check-legible.mjs [--url http://localhost:5179/] [--floor 7]
//
// Nothing else measures this. check-boards.mjs asserts copy does not OVERFLOW its canvas and
// e2e-board-fit.mjs reports the fitter's chosen scale — both are about layout inside the texture, and
// both pass happily while the finished board renders at four pixels on screen. Measured 2026-09-09,
// before this existed: bay and stand board body copy projected 3.5–5 px of cap height at 1280×720 and
// under 8 px at 1080p, so the visitor was shown copy they were failing to read at every station.
//
// The measurement is the one a reader cares about: cap height in CSS pixels, taken by projecting the
// text's own drawn height through the real camera. Each line is measured from every section spawn it
// is visible from and judged on its BEST view — the question is whether there is somewhere a visitor
// naturally stands where the text can be read, not whether it is legible from across the whole range.
//
// Only TITLES are enforced. That is the design position, not a loophole: these boards stand 40-60 m
// from the spawns they serve, and no type size that fits a 6 m plate makes a sentence readable at
// that distance — asking for one only drives the fitter to its minimum scale and shrinks the title
// with it. So a board is a sign (its title must read, and its counter carries the live number) while
// the panel behind the OPEN pad is the reading surface. Subtitles and body lines are reported for
// information so a regression in them is still visible.
import { chromium } from 'playwright-core'

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def }
const url = arg('--url', 'http://localhost:5179/')
const FLOOR = Number(arg('--floor', '7'))

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
await page.click('#start-btn')
await page.waitForTimeout(2600)
await page.evaluate(() => { window.__world.experience._sample = null })

const rows = await page.evaluate(async () => {
  const w = window.__world
  const THREE_V = w.experience.camera.position.constructor
  const out = []

  // Where a visitor actually stands: every section spawn, and every interaction pad — a stand's own
  // OPEN pad is much closer to its board than the section spawn is, and it is where you read from.
  const views = [
    ...w.sections.map((s) => ({ id: s.def.id, x: s.def.spawn[0], z: s.def.spawn[1], yaw: s.def.yaw })),
    ...w.areas.areas.map((a) => ({ id: `${a.label || 'pad'}`, x: a.x, z: a.z, yaw: 0 })),
  ]

  for (const def of views) {
    w.car.teleport(def.x, def.z, def.yaw)
    w.camera.snap(w.car.physics.position)
    await new Promise((r) => setTimeout(r, 160))
    const cam = w.experience.camera
    w.experience.scene.updateMatrixWorld(true)

    w.experience.scene.traverse((o) => {
      const sizes = o.material?.map?.userData?.sizes
      if (!o.visible || !sizes) return
      const centre = o.getWorldPosition(new THREE_V())
      const p = centre.clone().project(cam)
      // Only judge what is genuinely on screen from this spawn.
      if (p.z > 1 || Math.abs(p.x) > 1.0 || Math.abs(p.y) > 1.0) return

      // Step half a line up and down the face's own vertical axis, so the board's 30° backward tilt
      // and the camera's 43° downward look are both accounted for, then measure the projected gap.
      const faceUp = new THREE_V(0, 1, 0).applyQuaternion(o.getWorldQuaternion(new (Object.getPrototypeOf(cam.quaternion).constructor)()))
      for (const [role, metres] of Object.entries(sizes)) {
        if (!metres) continue
        const a = centre.clone().addScaledVector(faceUp, -metres / 2).project(cam)
        const b = centre.clone().addScaledVector(faceUp, metres / 2).project(cam)
        // Cap height is about 0.72 of the em box in this face.
        const px = Math.abs((a.y - b.y) / 2) * w.experience.sizes.height * 0.72
        out.push({
          section: def.id,
          key: `${o.uuid}:${role}`,
          role,
          metres: +metres.toFixed(3),
          px: +px.toFixed(1),
          dist: +centre.distanceTo(cam.position).toFixed(1),
          text: String(o.material.map.userData.text || '').split('\n')[0].slice(0, 44),
        })
      }
    })
  }
  return out
})

// Judge each line on its best view across every spawn it is visible from.
const best = new Map()
for (const r of rows) {
  const prev = best.get(r.key)
  if (!prev || r.px > prev.px) best.set(r.key, r)
}
const lines = [...best.values()]
const bad = lines.filter((r) => r.role === 'title' && r.px < FLOOR)
const byRole = {}
for (const r of lines) (byRole[r.role] ||= []).push(r.px)
console.log(`measured ${lines.length} printed lines (best of ${rows.length} views from every section spawn and interaction pad) at 1280x720; floor ${FLOOR} px cap height`)
for (const [role, list] of Object.entries(byRole).sort()) {
  list.sort((a, b) => a - b)
  console.log(`  ${role.padEnd(9)} n=${String(list.length).padStart(3)}   min ${list[0].toFixed(1)}   median ${list[Math.floor(list.length / 2)].toFixed(1)}   max ${list[list.length - 1].toFixed(1)}`)
}
const info = lines.filter((r) => r.role !== 'title' && r.px < FLOOR)
if (info.length) console.log(`\n(${info.length} subtitle/body lines are under ${FLOOR} px; these are carried by the panel, not enforced)`)
if (bad.length) {
  console.log(`\n${bad.length} TITLE(s) below ${FLOOR} px — a sign nobody can read:`)
  for (const r of bad.sort((a, b) => a.px - b.px).slice(0, 30)) {
    console.log(`  ${String(r.px).padStart(5)} px  best from ${r.section} at ${r.dist} m  ${r.role} (${r.metres} m)  "${r.text}"`)
  }
}
console.log(errors.length ? `errors: ${errors.join('; ')}` : 'errors: none')
await browser.close()
process.exit(bad.length || errors.length ? 1 : 0)
