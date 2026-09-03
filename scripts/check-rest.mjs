// Confirms every dynamic prop settles exactly on the ground rather than floating or sinking.
import '/home/vedant/kriv/portfolio/scripts/dom-stub.mjs'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
const root = '/home/vedant/kriv/portfolio/'
const { setFont } = await import(root + 'src/world/Text.js')
setFont(new FontLoader().parse(JSON.parse(readFileSync(root + 'public/fonts/helvetiker_bold.typeface.json', 'utf8'))))
const { Controls } = await import(root + 'src/core/Controls.js')
const { Sounds } = await import(root + 'src/core/Sounds.js')
const { World } = await import(root + 'src/world/World.js')
const { buildSections } = await import(root + 'src/world/sections/index.js')

const scene = new THREE.Scene()
const experience = { scene, camera: new THREE.PerspectiveCamera(40, 16 / 9, 1, 260), canvas: { addEventListener() {}, focus() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) }, isTouch: false, isSmall: false, quality: 'high', sizes: { width: 1280, height: 720, pixelRatio: 1 }, on: () => () => {}, emit() {}, renderer: { info: { render: { calls: 0 } } } }
const ui = new Proxy({ anyOpen: false, panelOpen: false, isTouch: false, el: {} }, { get: (t, k) => (k in t ? t[k] : () => {}) })
const world = new World({ experience, controls: new Controls({ isTouch: false }), sounds: new Sounds(), ui, strict: true }).build(buildSections)
world.reveal.finish()
world.start()
const dt = 1 / 60
for (let i = 0; i < 600; i++) world.update(dt, i * dt)

// After settling: a body resting on flat ground should sit at exactly half its own height,
// and each visual mesh's lowest point should meet the ground it stands on.
const { CANNON } = await import(root + 'src/core/Physics.js')
const box = new THREE.Box3()
const report = {}
for (const { body, mesh } of world.physics.pairs) {
  const tag = body.userData?.tag || 'untagged'
  const shape = body.shapes[0]
  let halfHeight = null
  if (shape instanceof CANNON.Box) halfHeight = shape.halfExtents.y
  else if (shape instanceof CANNON.Sphere) halfHeight = shape.radius
  else if (shape instanceof CANNON.Cylinder) halfHeight = shape.height / 2
  const r = (report[tag] ||= { n: 0, bodyErr: -Infinity, meshBottom: Infinity, meshTop: -Infinity })
  r.n++
  if (halfHeight != null) r.bodyErr = Math.max(r.bodyErr, Math.abs(body.position.y - halfHeight))
  mesh.updateMatrixWorld(true)
  box.setFromObject(mesh)
  if (isFinite(box.min.y)) {
    r.meshBottom = Math.min(r.meshBottom, box.min.y)
    r.meshTop = Math.max(r.meshTop, box.max.y)
  }
}
// Instanced crowds keep their transform on invisible proxies, so measure those directly.
for (const section of world.sections) {
  for (const key of Object.keys(section)) {
    const v = section[key]
    if (!v || !v.proxies || !v.bodies) continue
    const shape = v.bodies[0].shapes[0]
    const halfHeight = shape instanceof CANNON.Box ? shape.halfExtents.y
      : shape instanceof CANNON.Sphere ? shape.radius
      : shape instanceof CANNON.Cylinder ? shape.height / 2 : null
    v.update()
    v.mesh.updateMatrixWorld(true)
    box.setFromObject(v.mesh)
    const err = halfHeight == null ? NaN : Math.max(...v.bodies.map((b) => Math.abs(b.position.y - halfHeight)))
    console.log(`${(section.id + '.' + key).padEnd(22)} n=${String(v.bodies.length).padStart(3)}  body y-err=${err.toFixed(3)}  mesh y=[${box.min.y.toFixed(3)}, ${box.max.y.toFixed(3)}]`)
  }
}
for (const [tag, r] of Object.entries(report)) {
  console.log(`${tag.padEnd(22)} n=${String(r.n).padStart(3)}  body y-err=${(r.bodyErr === -Infinity ? NaN : r.bodyErr).toFixed(3)}  mesh y=[${r.meshBottom.toFixed(3)}, ${r.meshTop.toFixed(3)}]`)
}
