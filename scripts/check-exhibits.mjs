// Exhibit visibility audit: asserts that every working model a section puts on show, and the car
// itself wherever it can drive, is actually visible from the game camera.
//
// This exists because the Experience section's four dioramas were invisible and nothing caught it:
// each hangar carried an 8 m board hovering at its mouth and each model sat 4 m inside a 4.6 m
// half-tube. check-boards-clear proved the boards were readable — it never asked whether the boards
// were standing in front of anything, and no audit ever asked whether the CAR could be seen.
//
// It traces from REAL camera positions. Camera.js puts the camera at focus + (0,26,28)·zoom·boost
// with focus = (car.x, 0.6, car.z), so its rays fan out from a fixed height above the car; a single
// parallel ray along (0,26,28) is the zoom→∞ limit and is optimistic everywhere — under it a design
// ships green and still looks broken, which is the exact sin this audit exists to prevent.
//
// A section opts in with `get exhibits()`, and optionally `get viewpoints()` / `get driveable()`.
//
// Usage: node scripts/check-exhibits.mjs [--verbose]
import './dom-stub.mjs'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'

const root = new URL('..', import.meta.url).pathname
const { setFont } = await import(root + 'src/world/Text.js')
setFont(new FontLoader().parse(JSON.parse(readFileSync(root + 'public/fonts/helvetiker_bold.typeface.json', 'utf8'))))
const { Controls } = await import(root + 'src/core/Controls.js')
const { Sounds } = await import(root + 'src/core/Sounds.js')
const { World } = await import(root + 'src/world/World.js')
const { CAR } = await import(root + 'src/world/CarPhysics.js')
const { buildSections } = await import(root + 'src/world/sections/index.js')

const verbose = process.argv.includes('--verbose')
const scene = new THREE.Scene()
const experience = { scene, camera: new THREE.PerspectiveCamera(40, 16 / 9, 1, 260), canvas: { addEventListener() {}, focus() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) }, isTouch: false, isSmall: false, quality: 'high', sizes: { width: 1280, height: 720, pixelRatio: 1 }, on: () => () => {}, emit() {}, renderer: { info: { render: { calls: 0 } } } }
const ui = new Proxy({ anyOpen: false, panelOpen: false, isTouch: false, el: {} }, { get: (t, k) => (k in t ? t[k] : () => {}) })
const world = new World({ experience, controls: new Controls({ isTouch: false }), sounds: new Sounds(), ui, strict: true }).build(buildSections)
world.reveal.finish()
scene.updateMatrixWorld(true)

// Camera.js: position = focus + (0,26,28) · zoom · aspectBoost, focus = (car.x, 0.6, car.z).
// 0.55 is the shallowest ray the visitor can choose and is the worst case almost everywhere; the
// 1.35 boost is the isSmall (narrow viewport) multiplier.
const KS = [0.55, 1.0, 1.9].flatMap((z) => [1, 1.35].map((b) => ({ k: z * b, label: `zoom ${z}${b > 1 ? ' small' : ''}` })))
const cameraAt = (cx, cz, k, out) => out.set(cx, 0.6 + 26 * k, cz + 28 * k)

const solids = []
scene.traverse((o) => {
  if (!o.isMesh || o.visible === false) return
  if (o.material?.transparent) return          // glazing, pad fills, dust
  if (o.material?.isMeshBasicMaterial) return  // printed faces, decals, floor stencils, counters
  solids.push(o)
})

const isUnder = (obj, rootObj) => { for (let o = obj; o; o = o.parent) if (o === rootObj) return true; return false }

const raycaster = new THREE.Raycaster()
raycaster.near = 0.15 // a point sitting proud of a surface must not report that surface
const from = new THREE.Vector3()
const cam = new THREE.Vector3()
const dir = new THREE.Vector3()

/** Trace `point` to a camera focused on (cx, cz) at scale k. Returns the blocking hit, or null. */
function blockerFor(point, cx, cz, k, ignore) {
  cameraAt(cx, cz, k, cam)
  dir.copy(cam).sub(point)
  const dist = dir.length()
  if (dist < 0.3) return null
  dir.divideScalar(dist)
  raycaster.set(point, dir)
  raycaster.far = dist - 0.05 // stop at the camera, never report geometry behind the viewer
  for (const h of raycaster.intersectObjects(solids, false)) {
    if (ignore && ignore.some((g) => isUnder(h.object, g))) continue
    return h
  }
  return null
}

const failures = []
let checkedExhibits = 0
let checkedCar = 0

for (const section of world.sections) {
  let exhibits = null
  let viewpoints = null
  try { exhibits = section.exhibits; viewpoints = section.viewpoints } catch { exhibits = null }
  if (!exhibits?.length) continue
  const sectionViews = viewpoints?.length ? viewpoints : [section.def.spawn]

  for (const e of exhibits) {
    checkedExhibits++
    const spread = e.spread ?? 1.2
    // Five samples: centre, both flanks, the far side, and one TOWARD the camera — the last is the
    // one that catches a blocker sitting just south of the mechanism, which four never looked for.
    const dz = e.dz ?? spread
    const samples = [[0, 0], [-spread, 0], [spread, 0], [0, -dz], [0, dz * 0.6]]
    const bad = []
    const primaryBad = []
    let tried = 0
    const views = e.views?.length ? e.views : sectionViews
    for (const [dx, dz] of samples) {
      from.set(e.x + dx, e.y, e.z + dz)
      views.forEach(([cx, cz], vi) => {
        for (const { k, label } of KS) {
          tried++
          const hit = blockerFor(from, cx, cz, k, e.ignore)
          if (!hit) continue
          const line = `${hit.object.name || hit.object.geometry.type} at ${hit.distance.toFixed(1)} m (car ${cx},${cz} ${label})`
          bad.push(line)
          if (vi < (e.primary ?? 2)) primaryBad.push(line)
        }
      })
    }
    // Head-on is absolute; oblique gets a tolerance. The first two viewpoints a section lists are
    // the ones the visitor actually reads the model from — its own pad and the road straight out in
    // front — and a single blocked ray there is a failure. The rest are glances from along the row,
    // where a lattice legitimately shows its own rails and no layout could ever be clean from every
    // angle; those are allowed up to 10% of the sweep before they count.
    const fail = primaryBad.length > 0 || bad.length > tried * 0.1
    if (fail) failures.push({ label: e.label, at: [e.x, e.y, e.z], n: bad.length, total: tried, primary: primaryBad.length, blockers: [...new Set(primaryBad.length ? primaryBad : bad)].slice(0, 4) })
    else if (verbose) console.log(`ok    ${e.label.padEnd(28)} head-on clear, ${tried - bad.length}/${tried} rays clear`)
  }
}

// The defect that started this was not an invisible model, it was an invisible CAR: a board hung
// across a hangar mouth and the player's own vehicle went behind it. No static probe finds that,
// because the camera follows the car — so the car is probed where it can actually drive.
const { w: CW, l: CL } = CAR.chassis
const ROOF = 1.2

// A spot the car cannot physically occupy is not a spot it can be hidden in. Without this the sweep
// probes points inside the Epik shed and reports the shed blocking a car that could never be there.
const blockers = world.physics.world.bodies.filter((b) => {
  if (b === world.physics.ground || !b.shapes.length) return false
  const kind = b.userData?.kind
  return b.mass === 0 && (kind === 'wall' || kind === 'board')
})
for (const b of blockers) b.updateAABB()
function occupied(x, z) {
  for (const b of blockers) {
    const a = b.aabb
    if (a.upperBound.y < 0.15 || a.lowerBound.y > ROOF) continue
    if (a.lowerBound.x <= x + CW / 2 && a.upperBound.x >= x - CW / 2 &&
        a.lowerBound.z <= z + CL / 2 && a.upperBound.z >= z - CL / 2) return true
  }
  return false
}

function carBlocked(x, z) {
  checkedCar++
  // Roof centre first: that is "the car is behind something", which is the defect. The two flank
  // samples are advisory — a car brushing past a 0.5 m post has a corner hidden for a moment and
  // that is a post, not a wall, so it must not fail the audit.
  let flanks = 0
  let last = null
  for (const [ox, weight] of [[0, 'centre'], [-CW / 2, 'flank'], [CW / 2, 'flank']]) {
    from.set(x + ox, ROOF, z)
    let hit = null
    for (const { k, label } of KS) {
      hit = blockerFor(from, x, z, k, null) // the camera follows THIS car position
      if (hit) { last = `${hit.object.name || hit.object.geometry.type} at ${hit.distance.toFixed(1)} m (${label})`; break }
    }
    if (hit && weight === 'centre') return last
    if (hit) flanks++
  }
  return flanks === 2 ? last : null
}

for (const section of world.sections) {
  let areas = null
  try { areas = section.driveable } catch { areas = null }
  if (!areas?.length) continue
  for (const a of areas) {
    const spots = []
    if (a.lanes) for (const l of a.lanes) for (let z = l.z0; z <= l.z1 + 1e-6; z += 1.0) spots.push([l.x, z])
    else for (let x = a.x0; x <= a.x1 + 1e-6; x += 2.0) for (let z = a.z0; z <= a.z1 + 1e-6; z += 1.5) spots.push([x, z])
    const blocked = []
    for (const [x, z] of spots) { if (occupied(x, z)) continue; const b = carBlocked(x, z); if (b) blocked.push(`(${x.toFixed(1)}, ${z.toFixed(1)}) ${b}`) }
    if (blocked.length) failures.push({ label: `${section.id} car in ${a.label}`, at: null, n: blocked.length, total: spots.length, blockers: blocked.slice(0, 4) })
    else if (verbose) console.log(`ok    car visible at all ${spots.length} spots in ${section.id}/${a.label}`)
  }
}

for (const f of failures) {
  console.log(`HIDDEN ${f.label}${f.at ? ` at (${f.at.join(', ')})` : ''} — ${f.n}/${f.total} sight lines blocked${f.primary ? ` (${f.primary} of them HEAD-ON)` : ''} by:`)
  for (const b of f.blockers) console.log(`         ${b}`)
}
console.log(`\n${checkedExhibits} exhibits and ${checkedCar} car positions checked, ${failures.length} the camera cannot see`)
process.exit(failures.length ? 1 : 0)
