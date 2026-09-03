// Node smoke test: builds the whole world with DOM stubs, teleports through every section,
// exercises every interactive pad, and reports counts + errors.
// Usage: node scripts/smoke-sections.mjs [--verbose] [--text "needle" ...]
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
const { SECTION_DEFS: ALL_DEFS } = await import(root + 'src/world/sections/registry.js')

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const needles = []
let only = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--text') needles.push(args[++i])
  if (args[i] === '--only') only = args[++i]
}
const NAMES = { intro: 'Intro', crossroads: 'Crossroads', experience: 'Experience', projects: 'Projects', skills: 'Skills', education: 'Education', contact: 'Contact', playground: 'Playground' }
const SECTION_DEFS = only ? ALL_DEFS.filter((d) => d.id === only) : ALL_DEFS
let build
if (only) {
  const mod = await import(root + `src/world/sections/${NAMES[only]}.js`)
  const Cls = mod[`${NAMES[only]}Section`]
  if (!Cls) { console.log(`FATAL: ${NAMES[only]}.js must export class ${NAMES[only]}Section`); process.exit(1) }
  build = (world) => world.addSection(new Cls(world, SECTION_DEFS[0]))
} else {
  build = (await import(root + 'src/world/sections/index.js')).buildSections
}

// Fake experience + UI that record what the world asks of them.
const scene = new THREE.Scene()
const experience = {
  scene, camera: new THREE.PerspectiveCamera(40, 16 / 9, 1, 260), canvas: { addEventListener() {}, focus() {} },
  isTouch: false, isSmall: false, quality: 'high', sizes: { width: 1280, height: 720, pixelRatio: 1 }, on() { return () => {} }, emit() {},
  renderer: { info: { render: { calls: 0 } } },
}
const calls = []
const ui = new Proxy({ anyOpen: false, panelOpen: false, isTouch: false, el: {} }, {
  get(t, k) {
    if (k in t) return t[k]
    return (...a) => { calls.push([k, ...a]); if (k === 'showPanel' || k === 'showEntry' || k === 'togglePanel' || k.startsWith('show')) t.panelOpen = true; if (k === 'closePanel') t.panelOpen = false; return undefined }
  },
})
const controls = new Controls({ isTouch: false })
const sounds = new Sounds()
const errors = []
const origError = console.error
console.error = (...a) => { errors.push(a.map(String).join(' ')); origError(...a) }

let world
try {
  world = new World({ experience, controls, sounds, ui, build, strict: true })
} catch (err) {
  console.log('FATAL: world failed to build:', err.stack)
  process.exit(1)
}

const count = () => {
  let meshes = 0, instanced = 0, textures = new Set(), triangles = 0
  scene.traverse((o) => {
    if (o.isInstancedMesh) { instanced++; triangles += (o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3) * o.count }
    else if (o.isMesh) { meshes++; triangles += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3 }
    const m = o.material
    if (m && m.map) textures.add(m.map)
  })
  return { meshes, instanced, textures: textures.size, triangles: Math.round(triangles), bodies: world.physics.world.bodies.length, areas: world.areas.areas.length, updatables: world.updatables.length }
}

const dt = 1 / 60
let t = 0
const step = (n) => { for (let i = 0; i < n; i++) { t += dt; world.update(dt, t) } }

world.reveal.finish()
world.start()
step(120)
const totals = count()

const report = []
for (const def of SECTION_DEFS) {
  const s = world.sectionById.get(def.id)
  const before = errors.length
  world.teleportTo(def.id)
  step(90)
  // drive around a bit
  controls.keys.add('ArrowUp'); step(60); controls.keys.add('ArrowLeft'); step(60); controls.keys.delete('ArrowLeft'); controls.keys.delete('ArrowUp'); step(30)
  // exercise pads inside this section
  const pads = world.areas.areas.filter((a) => s.contains(a.x, a.z))
  let interacted = 0
  for (const a of pads) {
    try { a.setActive(true); if (a.interact()) interacted++; a.setActive(false) } catch (err) { errors.push(`pad ${a.label} in ${def.id}: ${err.stack}`) }
  }
  try { s.onHorn?.(); s.reset(); step(60) } catch (err) { errors.push(`${def.id} reset/horn: ${err.stack}`) }
  report.push({ id: def.id, pads: pads.length, interacted, disturbed: s.disturbed, newErrors: errors.length - before })
}

// Text checks: gather all texture texts
const texts = []
scene.traverse((o) => { const m = o.material; if (m && m.map && m.map.userData && m.map.userData.text) texts.push(m.map.userData.text) })
const corpus = texts.join('\n')
const missing = needles.filter((n) => !corpus.includes(n))

console.log(JSON.stringify({ totals, sections: report, textures: texts.length, missingText: missing, errors: errors.slice(0, 10), uiCalls: verbose ? calls.slice(0, 40) : calls.length }, null, 2))
process.exit(errors.length || missing.length ? 1 : 0)
