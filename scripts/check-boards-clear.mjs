// Boards lean back 30°, so their top edge sits height/2 north of their base. This asserts that
// nothing solid occupies the volume a board leans into.
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

const scene = new THREE.Scene()
const experience = { scene, camera: new THREE.PerspectiveCamera(40, 16 / 9, 1, 260), canvas: { addEventListener() {}, focus() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) }, isTouch: false, isSmall: false, quality: 'high', sizes: { width: 1280, height: 720, pixelRatio: 1 }, on: () => () => {}, emit() {}, renderer: { info: { render: { calls: 0 } } } }
const ui = new Proxy({ anyOpen: false, panelOpen: false, isTouch: false, el: {} }, { get: (t, k) => (k in t ? t[k] : () => {}) })
const world = new World({ experience, controls: new Controls({ isTouch: false }), sounds: new Sounds(), ui, strict: true }).build(buildSections)
world.reveal.finish()
scene.updateMatrixWorld(true)

// Board faces are the planes carrying a CanvasTexture with recorded text.
const faces = []
scene.traverse((o) => {
  if (o.isMesh && o.material?.map?.userData?.text && o.geometry.type === 'PlaneGeometry' && o.geometry.parameters.height > 1) faces.push(o)
})

// The camera always looks north and down from (0, +26, +28) relative to its focus, so a board is
// only readable if nothing blocks the line from its face back toward the camera.
const TO_CAMERA = new THREE.Vector3(0, 26, 28).normalize()

const solids = []
scene.traverse((o) => {
  if (!o.isMesh || faces.includes(o)) return
  if (o.material?.transparent) return
  // Hidden meshes cannot block a sight line. The air-race rings are the case that matters: they
  // are only shown while flying, and a board is only read from the ground.
  if (o.visible === false) return
  solids.push(o)
})

function isDescendantOf(object, root) {
  let o = object
  while (o) {
    if (o === root) return true
    o = o.parent
  }
  return false
}

const raycaster = new THREE.Raycaster()
raycaster.far = 40
const problems = []
const point = new THREE.Vector3()
for (const face of faces) {
  const { width, height } = face.geometry.parameters
  for (const [u, v] of [[-0.35, 0.4], [0, 0.4], [0.35, 0.4], [0, 0]]) {
    point.set(u * width, v * height, 0.05).applyMatrix4(face.matrixWorld)
    raycaster.set(point, TO_CAMERA)
    const hits = raycaster.intersectObjects(solids, false)
    const blocker = hits.find((h) => !isDescendantOf(h.object, face.parent))
    if (blocker) {
      problems.push(`"${face.material.map.userData.text.split('\n')[0].slice(0, 34)}" blocked by ${blocker.object.name || blocker.object.geometry.type} at ${blocker.distance.toFixed(1)} m`)
      break
    }
  }
}

const unique = [...new Set(problems)]
if (unique.length) {
  console.log(`${unique.length} boards are blocked from the camera:`)
  for (const p of unique) console.log('  ' + p)
  process.exit(1)
}
console.log(`${faces.length} boards checked, none obstructed`)
