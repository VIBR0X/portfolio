// Pad reachability audit: builds the whole world under the DOM stub and asserts that for every
// interaction pad there is somewhere inside it the car can actually stand — a car-sized box that
// overlaps no solid body.
//
// This exists because the FLY pad failed exactly that test and nothing caught it: the plane's own
// collider reached 0.3 m past the pad's near edge, so a car driving up wedged against the plane
// with its centre just outside the pad, the pad never activated, and the plane could not be
// boarded at all. Every automated flight check teleported the car into the pad instead of driving
// to it, which hid the defect from the whole suite.
//
// Usage: node scripts/check-pads.mjs [--verbose]
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
const experience = {
  scene,
  camera: new THREE.PerspectiveCamera(40, 16 / 9, 1, 260),
  canvas: { addEventListener() {}, focus() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) },
  isTouch: false, isSmall: false, quality: 'high', sizes: { width: 1280, height: 720, pixelRatio: 1 }, on() { return () => {} }, emit() {},
  renderer: { info: { render: { calls: 0 } } },
}
const ui = new Proxy({ anyOpen: false, panelOpen: false, isTouch: false, el: {} }, { get(t, k) { return k in t ? t[k] : () => {} } })
const world = new World({ experience, controls: new Controls({ isTouch: false }), sounds: new Sounds(), ui })
world.build(buildSections)
world.reveal.finish()

// Anything the car cannot drive through: static walls and boards, plus the kinematic plane and
// rocket. The ground plane is excluded — its half-space AABB covers everything at y 0.
const solids = world.physics.world.bodies.filter((b) => {
  if (b === world.physics.ground || !b.shapes.length) return false
  const kind = b.userData?.kind
  return (b.mass === 0 && (kind === 'wall' || kind === 'board')) || kind === 'plane' || kind === 'rover'
})
for (const b of solids) b.updateAABB()

const { w: CAR_W, l: CAR_L } = CAR.chassis
const CAR_TOP = 1.2 // roof height above the ground; anything lower cannot block the car

/** Does a car-sized box centred at (x, z) with the given footprint clear every solid? */
function fits(x, z, halfX, halfZ) {
  for (const b of solids) {
    const a = b.aabb
    if (a.upperBound.y < 0.15) continue // flat things the car drives over
    if (a.lowerBound.y > CAR_TOP) continue // gantries and lintels the car passes under
    if (a.lowerBound.x <= x + halfX && a.upperBound.x >= x - halfX &&
        a.lowerBound.z <= z + halfZ && a.upperBound.z >= z - halfZ) return false
  }
  return true
}

/**
 * Can the car stand here, in the orientation it arrives in? A pad wider than it is deep is driven
 * onto from the north or south, so the car is nose-first along z; a deeper pad is entered from the
 * side. Testing both orientations instead would let a pad pass on the strength of a car parked
 * sideways in it, which a car driving straight at the pad can never do — that is exactly how the
 * FLY pad's 0.3 m shortfall slipped through.
 */
function standable(x, z, area) {
  return area.width >= area.depth ? fits(x, z, CAR_W / 2, CAR_L / 2) : fits(x, z, CAR_L / 2, CAR_W / 2)
}

const failures = []
for (const area of world.areas.areas) {
  const steps = 9
  let free = 0
  let firstFree = null
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x = area.x - area.width / 2 + (area.width * i) / (steps - 1)
      const z = area.z - area.depth / 2 + (area.depth * j) / (steps - 1)
      if (standable(x, z, area)) { free++; if (!firstFree) firstFree = [+x.toFixed(2), +z.toFixed(2)] }
    }
  }
  const label = area.label || '(unlabelled)'
  // The centre is the test, not merely "some corner of the rect is free". The old FLY pad had free
  // points at its extreme x edges — a car could thread past the plane's wingtip and slip in — but
  // driving straight at the pad, which is what its label invites, wedged the car 0.3 m short with
  // no pad lit and no way to board. A pad whose middle the car cannot occupy is a broken pad.
  const centreOk = standable(area.x, area.z, area)
  if (!centreOk) failures.push({ label, at: [area.x, area.z], size: [area.width, area.depth], free })
  else if (verbose) console.log(`ok    ${label.padEnd(24)} ${free}/${steps * steps} standable, e.g. ${JSON.stringify(firstFree)}`)
}

for (const f of failures) {
  console.log(`UNUSABLE ${f.label} at (${f.at.join(', ')}) size ${f.size.join('×')} — the car cannot stand at its centre (${f.free} of 81 sampled points are free)`)
}
console.log(`\n${world.areas.areas.length} pads checked, ${failures.length} the car cannot stand on`)
process.exit(failures.length ? 1 : 0)
