// Measures every board/label texture: does the text fit the canvas it is drawn on?
import './dom-stub.mjs'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
const root = new URL('..', import.meta.url).pathname
const { setFont } = await import(root + 'src/world/Text.js')
setFont(new FontLoader().parse(JSON.parse(readFileSync(root + 'public/fonts/helvetiker_bold.typeface.json', 'utf8'))))

// Record every fillText call and flag any that would run past the canvas edge.
const overflow = []
const orig = globalThis.document.createElement
globalThis.document.createElement = (tag) => {
  const el = orig(tag)
  if (tag !== 'canvas') return el
  const getContext = el.getContext.bind(el)
  el.getContext = (...a) => {
    const ctx = getContext(...a)
    const fill = ctx.fillText.bind(ctx)
    ctx.fillText = (text, x, y) => {
      const w = ctx.measureText(text).width
      const left = ctx.textAlign === 'center' ? x - w / 2 : x
      if (left < -1 || left + w > el.width + 1) overflow.push({ text: String(text).slice(0, 60), left: Math.round(left), right: Math.round(left + w), canvas: el.width })
      return fill(text, x, y)
    }
    return ctx
  }
  return el
}

const { Controls } = await import(root + 'src/core/Controls.js')
const { Sounds } = await import(root + 'src/core/Sounds.js')
const { World } = await import(root + 'src/world/World.js')
const { buildSections } = await import(root + 'src/world/sections/index.js')
const scene = new THREE.Scene()
const experience = { scene, camera: new THREE.PerspectiveCamera(40, 16 / 9, 1, 260), canvas: { addEventListener() {}, focus() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) }, isTouch: false, isSmall: false, quality: 'high', sizes: { width: 1280, height: 720, pixelRatio: 1 }, on: () => () => {}, emit() {}, renderer: { info: { render: { calls: 0 } } } }
const ui = new Proxy({ anyOpen: false, panelOpen: false, isTouch: false, el: {} }, { get: (t, k) => (k in t ? t[k] : () => {}) })
new World({ experience, controls: new Controls({ isTouch: false }), sounds: new Sounds(), ui, strict: true }).build(buildSections)

if (overflow.length) {
  console.log(`${overflow.length} text runs overflow their canvas:`)
  for (const o of overflow) console.log(`  "${o.text}"  x ${o.left}..${o.right} of ${o.canvas}`)
  process.exit(1)
}
console.log('all board and label text fits')
