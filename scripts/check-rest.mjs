// Rest audit: settles every dynamic prop for ten simulated seconds and checks that each one ends up
// standing on the surface it is meant to stand on — not floating above it and not sunk into it.
//
// Each tag declares the height its LOWEST body should rest at (the top of its support: ground 0, the
// cargo dock 0.4, the trophy podium 1.2, the see-saw fulcrum 1.0). A tag marked `stacked` only has
// its lowest body checked, because the ones above it legitimately sit on their neighbours; every
// other tag has all of its bodies checked, so a single floating prop fails the gate. A tag with no
// entry in EXPECTED fails too: a new prop must say where it rests.
// Usage: node scripts/check-rest.mjs [--verbose]
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
const { buildSections } = await import(root + 'src/world/sections/index.js')

// Where the lowest body of each tag must come to rest, and how far it may be out.
// `stacked` and `hinged` are the explicit allowances: the props that legitimately do not all sit on
// the same flat surface. Everything else must have every body on its support within 5 cm.
const TOLERANCE = 0.05
const EXPECTED = {
  letter: { rest: 0, why: 'the VEDANT / THAKRE letters stand on Runway 00' },
  drum: { rest: 0, why: 'the crossroads drums stand on the ground' },
  ball: { rest: 0, why: 'the consulting spheres and the bowling ball roll on the ground' },
  figure: { rest: 0, why: 'the twenty-one developers stand on the ground' },
  pin: { rest: 0, why: 'the bowling pins stand on the lane' },
  cone: { rest: 0, why: 'the cones stand on the ground' },
  crate: { rest: 0.4, stacked: true, why: 'crates are stacked on the cargo dock, whose top is 0.4' },
  brick: { rest: 0, stacked: true, why: 'the bricks are laid up into a wall on the ground' },
  trophy: { rest: 1.2, why: 'the trophy stands on its podium, whose top is 1.2' },
  seesaw: { rest: 1.0, hinged: true, why: 'the plank hangs on the fulcrum hinge, fulcrum top 1.0' },
  gate: { rest: 0.7, hinged: true, why: 'the boom hangs on the post hinge with its free end on the 0.6 stop; the bar tilts, so its centre underside sits ~0.1 higher' },
  plane: { rest: 0.2, why: 'the plane stands on its landing gear, 0.2 below the body box' },
}
// A hinged prop swings, so it gets a wider window than a prop that simply lies on a surface.
const tolerance = (e) => (e.hinged ? 0.12 : TOLERANCE)

const verbose = process.argv.includes('--verbose')
const scene = new THREE.Scene()
const experience = { scene, camera: new THREE.PerspectiveCamera(40, 16 / 9, 1, 260), canvas: { addEventListener() {}, focus() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) }, isTouch: false, isSmall: false, quality: 'high', sizes: { width: 1280, height: 720, pixelRatio: 1 }, on: () => () => {}, emit() {}, renderer: { info: { render: { calls: 0 } } } }
const ui = new Proxy({ anyOpen: false, panelOpen: false, isTouch: false, el: {} }, { get: (t, k) => (k in t ? t[k] : () => {}) })
const world = new World({ experience, controls: new Controls({ isTouch: false }), sounds: new Sounds(), ui, strict: true }).build(buildSections)
world.reveal.finish()
world.start()
const dt = 1 / 60
for (let i = 0; i < 600; i++) world.update(dt, i * dt)

// After settling: the underside of a body is its centre minus the half-height of its shape, and that
// underside is what has to meet the support.
const { CANNON } = await import(root + 'src/core/Physics.js')
const halfHeightOf = (shape) => shape instanceof CANNON.Box ? shape.halfExtents.y
  : shape instanceof CANNON.Sphere ? shape.radius
  : shape instanceof CANNON.Cylinder ? shape.height / 2 : null

const box = new THREE.Box3()
const report = {}
for (const { body, mesh } of world.physics.pairs) {
  const tag = body.userData?.tag || 'untagged'
  const halfHeight = halfHeightOf(body.shapes[0])
  const r = (report[tag] ||= { n: 0, lowest: Infinity, highest: -Infinity, meshBottom: Infinity, meshTop: -Infinity })
  r.n++
  if (halfHeight != null) {
    const underside = body.position.y - halfHeight
    r.lowest = Math.min(r.lowest, underside)
    r.highest = Math.max(r.highest, underside)
  }
  mesh.updateMatrixWorld(true)
  box.setFromObject(mesh)
  if (isFinite(box.min.y)) {
    r.meshBottom = Math.min(r.meshBottom, box.min.y)
    r.meshTop = Math.max(r.meshTop, box.max.y)
  }
}
// Instanced crowds keep their transform on invisible proxies, so measure those directly.
if (verbose) {
  for (const section of world.sections) {
    for (const key of Object.keys(section)) {
      const v = section[key]
      if (!v || !v.proxies || !v.bodies) continue
      const halfHeight = halfHeightOf(v.bodies[0].shapes[0])
      v.update()
      v.mesh.updateMatrixWorld(true)
      box.setFromObject(v.mesh)
      const lowest = halfHeight == null ? NaN : Math.min(...v.bodies.map((b) => b.position.y - halfHeight))
      console.log(`${(section.id + '.' + key).padEnd(22)} n=${String(v.bodies.length).padStart(3)}  lowest underside=${lowest.toFixed(3)}  mesh y=[${box.min.y.toFixed(3)}, ${box.max.y.toFixed(3)}]`)
    }
  }
}

const failures = []
for (const [tag, r] of Object.entries(report)) {
  const e = EXPECTED[tag]
  const note = e ? (e.stacked ? ' (stacked)' : e.hinged ? ' (hinged)' : '') : ''
  console.log(`${tag.padEnd(10)} n=${String(r.n).padStart(3)}  underside=[${r.lowest.toFixed(3)}, ${r.highest.toFixed(3)}]  mesh y=[${r.meshBottom.toFixed(3)}, ${r.meshTop.toFixed(3)}]${note}`)
  if (!e) { failures.push(`${tag}: no expected rest height declared in check-rest.mjs (n=${r.n})`); continue }
  if (!isFinite(r.lowest)) { failures.push(`${tag}: no measurable shape height`); continue }
  const tol = tolerance(e)
  if (Math.abs(r.lowest - e.rest) > tol) {
    failures.push(`${tag}: lowest body rests at ${r.lowest.toFixed(3)}, expected ${e.rest.toFixed(3)} ±${tol} — ${e.why}`)
  } else if (!e.stacked && Math.abs(r.highest - e.rest) > tol) {
    failures.push(`${tag}: highest body rests at ${r.highest.toFixed(3)}, expected ${e.rest.toFixed(3)} ±${tol} — ${e.why}`)
  }
}

if (failures.length) {
  console.log('')
  for (const f of failures) console.log('FLOATING/SUNKEN ' + f)
  console.log(`\n${Object.keys(report).length} tags checked, ${failures.length} off their support`)
  process.exit(1)
}
console.log(`\n${Object.keys(report).length} tags checked, every prop rests on its support`)
