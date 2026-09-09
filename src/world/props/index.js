import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, palette, shadowed, vary } from '../Materials.js'
import { FONT_STACK, labelMesh } from '../Text.js'

/* Shared geometries (allocated once). */
const G = {
  trunk: new THREE.CylinderGeometry(0.16, 0.22, 1.1, 6),
  coneA: new THREE.ConeGeometry(1.1, 1.8, 7),
  coneB: new THREE.ConeGeometry(0.85, 1.5, 7),
  coneC: new THREE.ConeGeometry(0.6, 1.2, 7),
  blob: new THREE.IcosahedronGeometry(0.8, 0),
  rock: new THREE.DodecahedronGeometry(0.6, 0),
  trafficCone: new THREE.ConeGeometry(0.34, 0.9, 8),
  coneBase: new THREE.BoxGeometry(0.8, 0.08, 0.8),
  crate: new RoundedBoxGeometry(1, 1, 1, 2, 0.06),
}

/** Pine-style tree: trunk + stacked cones. Static decoration. */
export function tree({ scale = 1, color = palette.leaf, seed = Math.random() } = {}) {
  const g = new THREE.Group()
  const trunk = shadowed(new THREE.Mesh(G.trunk, flat(palette.woodDark)))
  trunk.position.y = 0.55
  g.add(trunk)
  const shade = vary(color, 0.1, seed)
  const layers = [
    [G.coneA, 1.6],
    [G.coneB, 2.5],
    [G.coneC, 3.3],
  ]
  for (const [geo, y] of layers) {
    const m = shadowed(new THREE.Mesh(geo, flat(shade)))
    m.position.y = y
    m.rotation.y = seed * 3
    g.add(m)
  }
  g.scale.setScalar(scale)
  return g
}

/** Round bush: a couple of icosahedra. */
export function bush({ scale = 1, color = palette.grass, seed = Math.random() } = {}) {
  const g = new THREE.Group()
  const a = shadowed(new THREE.Mesh(G.blob, flat(vary(color, 0.12, seed))))
  a.position.y = 0.6
  g.add(a)
  const b = shadowed(new THREE.Mesh(G.blob, flat(vary(color, 0.12, (seed + 0.4) % 1))))
  b.position.set(0.55, 0.45, 0.2)
  b.scale.setScalar(0.65)
  g.add(b)
  g.rotation.y = seed * 6
  g.scale.setScalar(scale)
  return g
}

/** Low-poly rock. */
export function rock({ scale = 1, seed = Math.random() } = {}) {
  const m = shadowed(new THREE.Mesh(G.rock, flat(vary(palette.slate, 0.15, seed))))
  m.position.y = 0.35 * scale
  m.rotation.set(seed * 2, seed * 5, 0)
  m.scale.set(scale, scale * 0.7, scale)
  return m
}

/** Traffic cone mesh + matching physics body factory. */
export function trafficCone(physics, { position = [0, 0, 0] } = {}) {
  const g = new THREE.Group()
  const cone = shadowed(new THREE.Mesh(G.trafficCone, flat(palette.amber)))
  cone.position.y = 0.45 + 0.04
  g.add(cone)
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.14, 8), flat(palette.white))
  stripe.position.y = 0.62
  g.add(stripe)
  const base = shadowed(new THREE.Mesh(G.coneBase, flat(palette.charcoal)))
  base.position.y = 0.04
  g.add(base)
  g.position.set(position[0], position[1], position[2])
  const body = physics.cylinder({ radiusTop: 0.15, radiusBottom: 0.38, height: 0.94, segments: 8, mass: 1.2, position: [position[0], position[1] + 0.47, position[2]] })
  // Mesh origin is at the ground; offset the geometry so it matches the body centre.
  g.children.forEach((c) => { c.position.y -= 0.47 })
  return { mesh: g, body }
}

/** Wooden crate with an optional label on all four sides. Returns { mesh, body }. */
export function crate(physics, { size = 1, position = [0, 0.5, 0], label = '', color = palette.wood, labelColor = palette.ink, mass = 2.5 } = {}) {
  const g = new THREE.Group()
  const box = shadowed(new THREE.Mesh(G.crate, flat(color)))
  g.add(box)
  if (label) {
    const tex = labelMesh(label, { width: 0.9, height: 0.36, color: labelColor, fontSize: 0.22, weight: 800 })
    for (let i = 0; i < 4; i++) {
      const l = i === 0 ? tex : tex.clone()
      l.position.set(0, 0, 0.505)
      l.rotation.y = 0
      const pivot = new THREE.Group()
      pivot.add(l)
      pivot.rotation.y = (Math.PI / 2) * i
      g.add(pivot)
    }
  }
  g.scale.setScalar(size)
  g.position.set(position[0], position[1], position[2])
  const body = physics.box({ size: [size, size, size], mass: mass * size, position })
  return { mesh: g, body }
}

/* ---------------------------------------------------------------------- */
/* Wayfinding: one arrow profile, used two ways                           */
/* ---------------------------------------------------------------------- */

/**
 * The only arrow outline in the world: points along +x, centred on its own box. `head` is the
 * head's length, `span` its full width, `shaft`/`tail` the bar's thickness at the neck and at the
 * back — `tail < shaft` is the taper the old rotated cone tip never had. Extruded on the signpost
 * plates, flattened by Roads.js into floor paint, so plate and paint speak the same language.
 */
export function arrowShape({ length = 0.36, span = 0.27, head = 0.17, shaft = 0.095, tail = 0.055 } = {}) {
  const x1 = length / 2
  const x0 = -length / 2
  const xh = x1 - head
  const s = new THREE.Shape()
  s.moveTo(x1, 0)
  s.lineTo(xh, span / 2)
  s.lineTo(xh, shaft / 2)
  s.lineTo(x0, tail / 2)
  s.lineTo(x0, -tail / 2)
  s.lineTo(xh, -shaft / 2)
  s.lineTo(xh, -span / 2)
  s.closePath()
  return s
}

/** The same taper with the shaft removed: road paint that still reads from 30 m up. */
export function chevronShape({ length = 1.4, span = 1.8, stroke = 0.52 } = {}) {
  const x1 = length / 2
  const x0 = -length / 2
  const h = span / 2
  const s = new THREE.Shape()
  s.moveTo(x1, 0)
  s.lineTo(x0, h)
  s.lineTo(x0 + stroke, h)
  s.lineTo(x1 - stroke, 0)
  s.lineTo(x0 + stroke, -h)
  s.lineTo(x0, -h)
  s.closePath()
  return s
}

/**
 * Screen bearing of a world bearing. The camera never rotates — it looks down the fixed
 * (0, −26, −28) axis — so world +x maps to screen right 1:1 and world north maps to screen up at
 * 26/38.21 = 0.6805. An arrow drawn at this angle points at where the place actually is on the
 * screen: drive the way it points and you arrive. A plate yawed to the true world bearing cannot
 * do that — at ±90° its face is edge-on to this camera and its label projects to zero width.
 */
export const screenBearing = (angle) => Math.atan2(0.6805 * Math.sin(angle), Math.cos(angle))

/** Type scale and spacing for every fingerboard, in metres. One table, so plates cannot drift. */
const PLATE = {
  cap: 0.34,       // destination cap height → 21.0 px at zoom 0.55, 11.1 at 1.0, 5.8 at 1.9
  dist: 0.19,      // the distance, on the same baseline as the name
  edge: 0.06,      // routed border: the frame stands proud of the printed field
  padY: 0.09,
  padX: 0.16,
  capZone: 0.60,   // accent end-cap, carries the arrow
  gutter: 0.18,
  distGap: 0.20,
  depth: 0.10,
  tilt: -Math.PI / 6, // the same 30° lean as every Board.js billboard: 97.5 % of face-on here
  ppu: 128,
}
PLATE.height = PLATE.edge * 2 + PLATE.padY * 2 + PLATE.cap // 0.64

const measure = (ctx, text, capH, weight) => {
  ctx.letterSpacing = `${capH * PLATE.ppu * 0.04}px`
  ctx.font = `${weight} ${(capH / 0.7) * PLATE.ppu}px ${FONT_STACK}` // cap height is 0.70 em
  return ctx.measureText(text).width / PLATE.ppu
}

/**
 * Fingerpost: an ink mast standing on the plinth, carrying six fingerboards on three tiers.
 *
 * Why this shape. The camera never rotates, so a plate yawed to its destination's true bearing is
 * unreadable: at ±90° (Skills, Education, Contact) its label plane is exactly edge-on and projects
 * to zero width, which is why three of the six old arms showed nothing but a cone. Here every plate
 * is broadside and leans back 30°, and the bearing is carried by an extruded arrow rotated to the
 * destination's screen bearing. The tiers are the map: south low, the east/west cross-arm in the
 * middle, north on top; within a tier the nearer destination hangs left, and left and right plates
 * can never overlap because they hang off opposite sides of the mast.
 *
 *   tiers: [[plate, …], …]  bottom tier first; a plate is
 *          { text, angle (true world bearing), dist (metres), color, align: 'left' | 'right' }
 *   base:  y of the BOTTOM tier's plate centre; `gap` is the clear air between tiers.
 *
 * Cost: five draw calls and 364 triangles for six destinations (mast, frames, printed fields,
 * accent caps, arrows), against thirteen draws and ~1880 triangles for the old six arms — the
 * frames, caps and arrows merge per colour and all six printed fields share one canvas atlas.
 */
export function signpost({ height = 4.45, base = 2.10, gap = 0.40, tiers = [] } = {}) {
  const g = new THREE.Group()

  // Mast: built to `height`, so it starts on the plinth. The old shared 3.2 m cylinder ignored the
  // argument and left the post floating 0.70 m above its plinth, with the top arm 0.53 m above the
  // post and the bottom arm 0.33 m below it.
  const mast = new THREE.CylinderGeometry(0.10, 0.15, height, 8).translate(0, height / 2, 0)
  const collar = new THREE.CylinderGeometry(0.20, 0.20, 0.10, 8).translate(0, height - 0.05, 0)
  g.add(shadowed(new THREE.Mesh(mergeGeometries([mast, collar]), flat(palette.ink))))

  // Lay the plates out and cut each plank to its own word, the way a real fingerpost is made.
  const atlas = document.createElement('canvas')
  const actx = atlas.getContext('2d')
  const plates = []
  tiers.forEach((tier, i) => {
    for (const p of tier) {
      const nameW = measure(actx, p.text, PLATE.cap, 800)
      const distW = measure(actx, `${p.dist} m`, PLATE.dist, 700)
      plates.push({
        ...p,
        y: base + i * (PLATE.height + gap),
        len: PLATE.edge * 2 + PLATE.capZone + PLATE.gutter + nameW + PLATE.distGap + distW + PLATE.padX,
        nameW, distW, dir: p.align === 'left' ? -1 : 1,
      })
    }
  })

  // One canvas for every printed field: six labels, one draw call, one texture.
  const fieldH = PLATE.height - PLATE.edge * 2
  const maxLen = Math.max(...plates.map((p) => p.len)) - PLATE.edge * 2
  atlas.width = Math.ceil(maxLen * PLATE.ppu)
  atlas.height = Math.ceil(fieldH * plates.length * PLATE.ppu)
  plates.forEach((p, i) => {
    const w = (p.len - PLATE.edge * 2) * PLATE.ppu
    const h = fieldH * PLATE.ppu
    const y0 = i * h
    actx.fillStyle = palette.cream
    actx.fillRect(0, y0, w, h)
    // The accent cap sits at the pointing end, so the text runs away from it.
    const nameX = (p.dir < 0 ? PLATE.capZone + PLATE.gutter : PLATE.padX + p.distW + PLATE.distGap) * PLATE.ppu
    const baseline = y0 + (PLATE.padY + PLATE.cap) * PLATE.ppu
    actx.textAlign = 'left'
    actx.textBaseline = 'alphabetic'
    measure(actx, p.text, PLATE.cap, 800)
    actx.fillStyle = palette.ink
    actx.fillText(p.text, nameX, baseline)
    actx.fillStyle = p.color // the section colour survives as a printed rule, not another mesh
    actx.fillRect(nameX, baseline + 0.055 * PLATE.ppu, p.nameW * PLATE.ppu, 0.04 * PLATE.ppu)
    measure(actx, `${p.dist} m`, PLATE.dist, 700)
    actx.fillStyle = palette.inkSoft
    actx.fillText(`${p.dist} m`, p.dir < 0 ? nameX + (p.nameW + PLATE.distGap) * PLATE.ppu : PLATE.padX * PLATE.ppu, baseline)
    p.uv = [0, 1 - (y0 + h) / atlas.height, w / atlas.width, 1 - y0 / atlas.height]
  })
  const tex = new THREE.CanvasTexture(atlas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.userData = { text: plates.map((p) => `${p.text} ${p.dist} m`).join('\n') }

  const frames = []
  const fields = []
  const caps = []
  const arrows = []
  const arrowGeo = new THREE.ExtrudeGeometry(arrowShape(), { depth: 0.05, bevelEnabled: false }).translate(0, 0, -0.025)
  for (const p of plates) {
    const pivot = new THREE.Object3D()
    pivot.position.set(p.dir * (0.12 + p.len / 2), p.y, 0)
    pivot.rotation.x = PLATE.tilt
    pivot.updateMatrix()
    const put = (geo, x, y, z, rz = 0) => {
      const o = new THREE.Object3D()
      o.position.set(x, y, z)
      o.rotation.z = rz
      o.updateMatrix()
      return geo.clone().applyMatrix4(o.matrix).applyMatrix4(pivot.matrix)
    }
    const fw = p.len - PLATE.edge * 2
    frames.push(put(new THREE.BoxGeometry(p.len, PLATE.height, PLATE.depth), 0, 0, 0))
    const field = new THREE.PlaneGeometry(fw, fieldH)
    const [u0, v0, u1, v1] = p.uv
    field.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([u0, v1, u1, v1, u0, v0, u1, v0]), 2))
    fields.push(put(field, 0, 0, PLATE.depth / 2 + 0.004))
    const capX = p.dir * (fw / 2 - PLATE.capZone / 2)
    caps.push(put(new THREE.BoxGeometry(PLATE.capZone, fieldH, 0.03), capX, 0, PLATE.depth / 2 + 0.012))
    arrows.push(put(arrowGeo, capX, 0, PLATE.depth / 2 + 0.028, screenBearing(p.angle)))
  }
  g.add(shadowed(new THREE.Mesh(mergeGeometries(frames), flat(palette.habitat))))
  const printed = new THREE.Mesh(mergeGeometries(fields), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
  printed.name = 'signpost-fields'
  g.add(printed)
  g.add(shadowed(new THREE.Mesh(mergeGeometries(caps), flat(palette.cobalt))))
  g.add(shadowed(new THREE.Mesh(mergeGeometries(arrows), flat(palette.cream))))
  return g
}

/** Flat road / path tile: slightly darker sand strip, no physics. */
export function pathStrip({ width = 5, length = 20, color = palette.road } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, length), flat(color))
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.01
  m.receiveShadow = true
  return m
}

/** Rounded platform slab: a tinted floor patch that marks a section. */
export function slab({ width = 20, depth = 20, color = palette.sandDark, radius = 2 } = {}) {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -depth / 2
  const r = radius
  shape.moveTo(x + r, y)
  shape.lineTo(x + width - r, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + r)
  shape.lineTo(x + width, y + depth - r)
  shape.quadraticCurveTo(x + width, y + depth, x + width - r, y + depth)
  shape.lineTo(x + r, y + depth)
  shape.quadraticCurveTo(x, y + depth, x, y + depth - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  const geo = new THREE.ShapeGeometry(shape, 4)
  geo.rotateX(-Math.PI / 2)
  const m = new THREE.Mesh(geo, flat(color))
  m.position.y = 0.008
  m.receiveShadow = true
  return m
}

/** A simple lamp post to light corners (decorative only). */
export function lampPost() {
  const g = new THREE.Group()
  const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 6), flat(palette.charcoal)))
  post.position.y = 1.7
  g.add(post)
  const head = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.35, 0.5, 2, 0.08), flat(palette.charcoal)))
  head.position.y = 3.5
  g.add(head)
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), flat(palette.cream, { emissive: '#ffe1a1', emissiveIntensity: 0.9 }))
  bulb.position.y = 3.3
  g.add(bulb)
  return g
}

export const geometries = G
