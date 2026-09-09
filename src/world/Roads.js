import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { decal, flat, palette } from './Materials.js'
import { FONT_STACK, floorLabel } from './Text.js'
import { chevronShape } from './props/index.js'
import { basaltGrain, fitGrain, worldToUv } from './Textures.js'

/**
 * Pavement footprint in metres. `disc` entries are roundabouts (w = d = diameter); the rest are rectangles.
 * Shared with the wear map so traffic darkening lines up with the pavement.
 *
 * `apron: true` marks a surface you manoeuvre *on* rather than travel *along*. The distinction is
 * not cosmetic: anything that marks a station's edge necessarily stands on that station's apron,
 * so an apron cannot be treated as an obstacle-free corridor — but a through route must be, or a
 * section can wall itself off. See `clearOfRoutes`.
 */
export const ROAD_RECTS = [
  { cx: 0, cz: -40, w: 14, d: 144, name: 'runway' },
  { cx: 0, cz: -30, w: 196, d: 12, name: 'north avenue' },
  { cx: 39, cz: 30, w: 90, d: 10, name: 'south avenue' },
  { cx: -62, cz: -41.5, w: 76, d: 19, name: 'experience apron', apron: true },
  { cx: 0, cz: -68, w: 40, d: 46, name: 'skills yard', apron: true },
  { cx: 0, cz: -98, w: 30, d: 20, name: 'education apron', apron: true },
  { cx: 0, cz: 46, w: 34, d: 22, name: 'contact apron', apron: true },
  { cx: 52, cz: 40, w: 48, d: 44, name: 'playground apron', apron: true },
  { cx: 86, cz: 54, w: 24, d: 6, name: 'landing strip' },
  { cx: 0, cz: -30, w: 16, d: 16, disc: true, name: 'north roundabout' },
  { cx: 0, cz: 30, w: 12, d: 12, disc: true, name: 'south roundabout' },
]

/** Is (x, z) at least `margin` clear of every rectangle in `rects`? */
function clearOf(rects, x, z, margin) {
  for (const r of rects) {
    if (r.disc) { if (Math.hypot(x - r.cx, z - r.cz) < r.w / 2 + margin) return false; continue }
    if (Math.abs(x - r.cx) < r.w / 2 + margin && Math.abs(z - r.cz) < r.d / 2 + margin) return false
  }
  return true
}

/** Clear of ALL pavement, aprons included. What ground dressing wants: no boulder on any road. */
export function clearOfRoads(x, z, margin = 2.5) {
  return clearOf(ROAD_RECTS, x, z, margin)
}

/**
 * Clear of every through route — the runway, the two avenues, the landing strip and the
 * roundabouts — ignoring aprons.
 *
 * This is the predicate anything that lays out a barrier must consult. The playground's tyre ring
 * is a bare ellipse with no knowledge of what it crosses; laid blind it put seven stacks across
 * the south avenue and sealed the only road into the test range, and three inside the jump ramp,
 * which made the ramp unclimbable. Both were first patched with hand-measured rectangles, and a
 * hand-measured rectangle stops being true the moment the thing it describes moves. Deriving the
 * gaps from here instead means moving a road reopens the barrier for it automatically.
 */
export function clearOfRoutes(x, z, margin = 2.5) {
  return clearOf(ROAD_RECTS.filter((r) => !r.apron), x, z, margin)
}

/** Rewrite `uv` so the geometry maps the floor rectangle once (u west→east, v south→north). */
export function planarUv(geometry, rect) {
  const pos = geometry.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = worldToUv(pos.getX(i), pos.getZ(i), rect)
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geometry
}

/**
 * Basalt pavement network from the spec §3: runway, two avenues, roundabouts, aprons, dashes,
 * threshold bars and kerb strips. Everything is visual only (no physics), merged into a handful of
 * draw calls, and shares the floor's wear map through world-planar UVs.
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
  const { floorRect } = world
  const tarmacGeo = planarUv(mergeGeometries(strips), floorRect)
  const grainTex = fitGrain(basaltGrain(), floorRect.x1 - floorRect.x0, floorRect.z1 - floorRect.z0)
  const tarmac = new THREE.Mesh(tarmacGeo, flat('#FFFFFF', { map: grainTex, aoMap: world.wearMap, roughness: 1 }))
  tarmac.name = 'roads'
  world.addStatic(tarmac, { reveal: false, cast: false })

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
  // |x| = 12 is skipped: those two dashes land inside the '◀ EXPERIENCE' / 'PROJECTS ▶' ink at
  // z −30 and, being the same cream, read as a bar struck through the words.
  for (let x = -96; x <= 96; x += 4) if (Math.abs(x) > 9 && Math.abs(Math.abs(x) - 12) > 0.5) cream.push(dash(x, -30, true))
  for (let x = 8; x <= 82; x += 4) cream.push(dash(x, 30, true))
  const markings = new THREE.Mesh(mergeGeometries(cream), flat(palette.cream))
  markings.name = 'road-markings'
  world.addStatic(markings, { reveal: false, cast: false })

  // Runway number
  const num = floorLabel('00', { width: 4, height: 2.8, color: palette.cream, fontSize: 1.8, weight: 900 })
  num.position.set(0, 0.025, 19)
  world.addStatic(num, { reveal: false })

  buildJunctionMarkers(world)

  buildKerbs(world)
}

/**
 * Junction markers at the crossroads mouths (spec §4.2). A pair of painted chevrons cut from the
 * same tapered profile the signpost arrows use, and the destination set beside them — never a
 * unicode triangle inside the string, which rendered at a different weight and baseline from the
 * letters and read as a typo.
 *
 * Positions. The tagline board at (0, −19.5) leans 30° back to y = 4.44 and, along the camera's
 * fixed (0, 26, 28) axis, shadows the whole south mouth: every floor point with |x| ≤ 8 and
 * −31.5 ≤ z ≤ −20 is hidden from at least one runway viewpoint. The old 'PLAYGROUND ↘' (6, −22)
 * and 'CONTACT ▼' (−6, −22) sat inside it and were fully unobstructed from 0 of 27 decision
 * viewpoints; out on the shoulders they are unobstructed from 26. Both clear the MAP pad
 * (x ±2.5, z −23.5…−20.5) by ≥ 5.7 m and the ABOUT pad (x ±2.75, z −18.5…−15.5) by ≥ 5.7 m, and
 * 'START' rides with 'CONTACT' because both lie straight down the runway, the way the north mouth
 * already carries Skills and Education together.
 *
 * Two draw calls for the whole set — every chevron in one merged decal, every word on one canvas
 * atlas — against six separate label planes before. Sizing each word's plane to its own word also
 * ends the silent shrink: sharing a 6 m plane made makeLabelTexture drop '▲ SKILLS · EDUCATION'
 * one step, to a 0.322 m cap against 0.350 m for the other five.
 */
const MARK = { cap: 0.52, line: 1.15, ppu: 96 } // 0.52 m cap → 24 px at zoom 0.55, 11.8 at 1.0
const MOUTHS = [
  // lines, the world bearing driven, [word x, word z, plane width], chevron centres (junction end first)
  { lines: ['EXPERIENCE'], angle: Math.PI, word: [-15.4, -30.0, 5.7], chevrons: [[-9.9, -30.0], [-11.5, -30.0]] },
  { lines: ['PROJECTS'], angle: 0, word: [14.9, -30.0, 4.8], chevrons: [[9.9, -30.0], [11.5, -30.0]] },
  { lines: ['SKILLS · EDUCATION'], angle: Math.PI / 2, word: [0, -43.8, 9.2], chevrons: [[0, -38.85], [0, -40.30]] },
  { lines: ['START', 'CONTACT'], angle: -Math.PI / 2, word: [-10.6, -22.6, 4.3], chevrons: [[-10.6, -19.9], [-10.6, -18.4]] },
  { lines: ['PLAYGROUND'], angle: Math.atan2(-70, 52), word: [11.4, -22.6, 6.2], chevrons: [[10.8, -20.9], [11.6, -19.8]] },
]

export function buildJunctionMarkers(world) {
  const { ppu, line } = MARK
  const cells = MOUTHS.map((m) => ({ w: m.word[2], h: line * m.lines.length }))
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(Math.max(...cells.map((c) => c.w)) * ppu)
  canvas.height = Math.ceil(cells.reduce((s, c) => s + c.h, 0) * ppu)
  const ctx = canvas.getContext('2d')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = palette.stencil
  ctx.letterSpacing = `${MARK.cap * ppu * 0.04}px`
  ctx.font = `800 ${(MARK.cap / 0.7) * ppu}px ${FONT_STACK}` // cap height is 0.70 em

  const words = []
  const chevrons = []
  const chevGeo = new THREE.ShapeGeometry(chevronShape()).rotateX(-Math.PI / 2)
  let y = 0
  MOUTHS.forEach((m, i) => {
    const cw = cells[i].w * ppu
    const ch = cells[i].h * ppu
    m.lines.forEach((text, k) => ctx.fillText(text, cw / 2, y + (k + 0.5) * line * ppu))
    const quad = new THREE.PlaneGeometry(cells[i].w, cells[i].h)
    const u1 = cw / canvas.width
    const v0 = 1 - (y + ch) / canvas.height
    const v1 = 1 - y / canvas.height
    quad.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, v1, u1, v1, 0, v0, u1, v0]), 2))
    quad.rotateX(-Math.PI / 2)
    quad.translate(m.word[0], 0.026, m.word[1])
    words.push(quad)
    for (const [cx, cz] of m.chevrons) chevrons.push(chevGeo.clone().rotateY(m.angle).translate(cx, 0.024, cz))
    y += ch
  })

  const paint = new THREE.Mesh(mergeGeometries(chevrons), decal(palette.stencil))
  paint.name = 'junction-chevrons'
  paint.renderOrder = 1
  world.addStatic(paint, { reveal: false, cast: false })

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.userData = { text: MOUTHS.flatMap((m) => m.lines).join('\n') }
  const labels = new THREE.Mesh(mergeGeometries(words), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }))
  labels.name = 'junction-words'
  labels.renderOrder = 2
  world.addStatic(labels, { reveal: false, cast: false })
}

/**
 * Concrete kerb strips along both long edges of the north avenue, the south avenue and the runway
 * (spec §1.6), split around the north roundabout and the avenue crossing. One merged mesh, 0.08 m
 * tall with its top at 0.08, receive-only, no physics (under the 0.35 m collision threshold).
 */
export function buildKerbs(world) {
  const parts = []
  const strip = (x0, x1, z) => {
    const g = new THREE.BoxGeometry(x1 - x0, 0.08, 0.35)
    g.translate((x0 + x1) / 2, 0.04, z)
    parts.push(g)
  }
  const stripZ = (z0, z1, x) => {
    const g = new THREE.BoxGeometry(z1 - z0, 0.08, 0.35)
    g.rotateY(Math.PI / 2)
    g.translate(x, 0.04, (z0 + z1) / 2)
    parts.push(g)
  }
  for (const z of [-36, -24]) { strip(-98, -9, z); strip(9, 98, z) } // north avenue, gap for the roundabout
  for (const z of [25, 35]) strip(7, 84, z) // south avenue
  for (const x of [-7, 7]) { stripZ(-112, -38, x); stripZ(-22, 32, x) } // runway, gap for the avenue
  const kerbs = new THREE.Mesh(mergeGeometries(parts), flat(palette.concrete))
  kerbs.name = 'kerbs'
  world.addStatic(kerbs, { reveal: false, cast: false })
  return kerbs
}
