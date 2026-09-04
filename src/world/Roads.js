import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, palette } from './Materials.js'
import { floorLabel } from './Text.js'

/**
 * Tarmac footprint in metres. `disc` entries are roundabouts (w = d = diameter); the rest are rectangles.
 * Shared with the wear map so traffic darkening lines up with the tarmac.
 */
export const ROAD_RECTS = [
  { cx: 0, cz: -40, w: 14, d: 144, name: 'runway' },
  { cx: 0, cz: -30, w: 196, d: 12, name: 'north avenue' },
  { cx: 39, cz: 30, w: 90, d: 10, name: 'south avenue' },
  { cx: -58, cz: -40, w: 52, d: 12, name: 'experience apron' },
  { cx: 0, cz: -68, w: 40, d: 46, name: 'skills yard' },
  { cx: 0, cz: -98, w: 30, d: 20, name: 'education apron' },
  { cx: 0, cz: 46, w: 34, d: 22, name: 'contact apron' },
  { cx: 52, cz: 40, w: 48, d: 44, name: 'playground apron' },
  { cx: 86, cz: 54, w: 24, d: 6, name: 'landing strip' },
  { cx: 0, cz: -30, w: 16, d: 16, disc: true, name: 'north roundabout' },
  { cx: 0, cz: 30, w: 12, d: 12, disc: true, name: 'south roundabout' },
]

/**
 * Tarmac network from the spec §3: runway, two avenues, roundabouts, aprons, dashes, threshold bars.
 * Everything is visual only (no physics) and merged into a handful of draw calls.
 */
export function buildRoads(world) {
  const strips = []
  const rect = (cx, cz, w, d, y = 0.01) => {
    const g = new THREE.PlaneGeometry(w, d)
    g.rotateX(-Math.PI / 2)
    g.translate(cx, y, cz)
    return g
  }
  const disc = (cx, cz, r, y = 0.012) => {
    const g = new THREE.CircleGeometry(r, 24)
    g.rotateX(-Math.PI / 2)
    g.translate(cx, y, cz)
    return g
  }

  // Runway, avenues, aprons and roundabouts, all from the shared footprint
  for (const r of ROAD_RECTS) strips.push(r.disc ? disc(r.cx, r.cz, r.w / 2) : rect(r.cx, r.cz, r.w, r.d))
  const tarmac = new THREE.Mesh(mergeGeometries(strips), flat(palette.tarmac))
  tarmac.name = 'roads'
  world.addStatic(tarmac, { reveal: false })

  // Cream markings: roundabout rings, threshold bars, dashes
  const cream = []
  const ring = (cx, cz, r0, r1, y = 0.02) => {
    const g = new THREE.RingGeometry(r0, r1, 32)
    g.rotateX(-Math.PI / 2)
    g.translate(cx, y, cz)
    return g
  }
  for (const [r0, r1] of [[5.6, 6.4], [6.8, 7.2], [7.6, 8]]) {
    cream.push(ring(0, -30, r0, r1))
    cream.push(ring(0, 30, r0 * 0.75, r1 * 0.75))
  }
  for (let i = 0; i < 8; i++) cream.push(rect(-6 + i * 1.7, 24, 0.7, 3.4, 0.02)) // threshold bars
  const dash = (cx, cz, alongX) => rect(cx, cz, alongX ? 1.6 : 0.2, alongX ? 0.2 : 1.6, 0.02)
  for (let z = 28; z >= -108; z -= 4) if (Math.abs(z) > 9 && Math.abs(z + 30) > 9) cream.push(dash(0, z, false))
  for (let x = -96; x <= 96; x += 4) if (Math.abs(x) > 9) cream.push(dash(x, -30, true))
  for (let x = 8; x <= 82; x += 4) cream.push(dash(x, 30, true))
  const markings = new THREE.Mesh(mergeGeometries(cream), flat(palette.cream))
  markings.name = 'road-markings'
  world.addStatic(markings, { reveal: false })

  // Runway number
  const num = floorLabel('00', { width: 4, height: 2.8, color: palette.cream, fontSize: 1.8, weight: 900 })
  num.position.set(0, 0.025, 19)
  world.addStatic(num, { reveal: false })

  // Floor arrows at the crossroads mouths (spec §4.2)
  const arrows = [
    ['◀ EXPERIENCE', -11, -30], ['PROJECTS ▶', 11, -30], ['▲ SKILLS · EDUCATION', 0, -41],
    ['▼ START', 0, -19], ['PLAYGROUND ↘', 6, -22], ['CONTACT ▼', -6, -22],
  ]
  for (const [text, x, z] of arrows) {
    const a = floorLabel(text, { width: 6, height: 1.6, color: palette.cream, fontSize: 0.5, weight: 800 })
    a.position.set(x, 0.025, z)
    world.addStatic(a, { reveal: false })
  }
}
