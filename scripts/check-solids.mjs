// Collision audit: builds the whole world under the DOM stub and lists every solid-looking static
// mesh the car could reach that has no static physics body under it. A "solid-looking" mesh is an
// opaque, lit mesh whose world box is at least 0.5 m in every horizontal direction, at least 0.4 m
// tall, and starts below 1.6 m (the car's roof). Decals, labels, boards' printed faces, the floor,
// roads and the hill ring are skipped by material or name.
// Usage: node scripts/check-solids.mjs [--verbose]
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
scene.updateMatrixWorld(true)

// Names that exempt a whole subtree: the ground pieces, the vehicles, the red buttons that are driven
// over on purpose, the drive-in hangar shells (solid sides and back, open mouth) and the instanced
// crowds whose bodies are their hidden proxies.
const SKIP_NAMES = new Set(['floor', 'roads', 'road-markings', 'hills', 'car', 'plane', 'red-button', 'hangar', 'instanced-props'])
// The ground plane's half-space AABB would 'cover' anything touching y=0, so it is left out.
const bodies = world.physics.world.bodies.filter((b) => b.mass === 0 && b.shapes.length && b !== world.physics.ground)
for (const b of bodies) b.updateAABB()
// Meshes that follow a body (dynamic props, the car, the plane) are found through the physics pairs.
const following = new Set()
for (const pair of world.physics.pairs || []) if (pair.mesh) pair.mesh.traverse((o) => following.add(o))

const box = new THREE.Box3()
const missing = []
let checked = 0
const exempt = new Set()
scene.traverse((o) => { if (SKIP_NAMES.has(o.name)) o.traverse((c) => exempt.add(c)) })
scene.traverse((o) => {
  if (!o.isMesh || !o.material || !o.visible) return
  if (exempt.has(o)) return
  if (following.has(o)) return
  const m = o.material
  if (m.isMeshBasicMaterial || m.transparent) return
  if (o.isInstancedMesh) {
    // Instanced statics: check each instance box separately (clutter, tyres, lights).
    const im = new THREE.Matrix4()
    const gb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox)
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, im)
      const b = gb.clone().applyMatrix4(im).applyMatrix4(o.matrixWorld)
      consider(b, `${o.name || 'instanced'}[${i}] (${o.geometry.type})`)
    }
    return
  }
  box.setFromObject(o)
  consider(box.clone(), describe(o))
})

function describe(o) {
  const chain = []
  let p = o
  while (p && p !== scene) { chain.unshift(p.name || p.type); p = p.parent }
  return chain.join('/') + ` (${o.geometry.type})`
}

function consider(b, label) {
  const size = new THREE.Vector3()
  b.getSize(size)
  if (size.x < 0.5 || size.z < 0.5 || size.y < 0.4) return
  if (b.min.y > 1.6) return
  const c = new THREE.Vector3()
  b.getCenter(c)
  const { x0, x1, z0, z1 } = world.extents
  if (c.x < x0 || c.x > x1 || c.z < z0 || c.z > z1) return
  checked++
  // Shrink the mesh box a little so touching a body at the edge counts.
  const inner = b.clone().expandByScalar(-Math.min(0.2, size.x * 0.2, size.z * 0.2))
  const covered = bodies.some((body) => {
    const a = body.aabb
    return a.lowerBound.x <= inner.max.x && a.upperBound.x >= inner.min.x &&
      a.lowerBound.z <= inner.max.z && a.upperBound.z >= inner.min.z &&
      a.lowerBound.y <= inner.max.y && a.upperBound.y >= inner.min.y
  })
  if (!covered) missing.push({ label, centre: [+c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1)], size: [+size.x.toFixed(1), +size.y.toFixed(1), +size.z.toFixed(1)] })
  else if (verbose) console.log('ok  ', label, c.toArray().map((v) => +v.toFixed(1)))
}

missing.sort((a, b) => a.centre[0] - b.centre[0] || a.centre[2] - b.centre[2])
for (const m of missing) console.log(`MISSING ${m.label} at (${m.centre.join(', ')}) size ${m.size.join('×')}`)
console.log(`\nchecked ${checked} solid meshes, ${missing.length} without a static body`)
process.exit(missing.length ? 1 : 0)
