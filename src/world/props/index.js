import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, palette, shadowed, vary } from '../Materials.js'
import { labelMesh } from '../Text.js'

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
  post: new THREE.CylinderGeometry(0.09, 0.11, 3.2, 7),
  arm: new RoundedBoxGeometry(2.6, 0.55, 0.16, 2, 0.05),
  tip: new THREE.ConeGeometry(0.3, 0.45, 4),
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

/**
 * Signpost with N arms: an ink post, every habitat arm merged into one mesh, and the arrow tips
 * merged per colour, so six arms cost four lit draws rather than thirteen. The labels keep a
 * pivot group each. arms: [{ text, angle (radians, direction the arm points), color }]
 */
export function signpost({ arms = [], height = 3.2 } = {}) {
  const g = new THREE.Group()
  const post = shadowed(new THREE.Mesh(G.post, flat(palette.ink)))
  post.position.y = height / 2
  g.add(post)
  const boards = []
  const tips = new Map() // colour -> geometries
  const placed = (geo, x, rotation, pivot) => {
    const o = new THREE.Object3D()
    o.position.x = x
    if (rotation) o.rotation.copy(rotation)
    o.updateMatrix()
    return geo.clone().applyMatrix4(o.matrix).applyMatrix4(pivot.matrix)
  }
  arms.forEach((arm, i) => {
    const pivot = new THREE.Group()
    pivot.position.y = height - 0.45 - i * 0.7
    pivot.rotation.y = arm.angle
    pivot.updateMatrix()
    boards.push(placed(G.arm, 1.15, null, pivot))
    const colour = arm.color || palette.cream
    if (!tips.has(colour)) tips.set(colour, [])
    tips.get(colour).push(placed(G.tip, 2.65, new THREE.Euler(0, Math.PI / 4, -Math.PI / 2), pivot))
    // The camera never rotates, so only the side of each arm facing +z in the world is ever seen:
    // one label per arm, on that side.
    const label = labelMesh(arm.text, { width: 2.4, height: 0.5, color: palette.ink, fontSize: 0.26, weight: 800 })
    const front = Math.cos(arm.angle) >= 0
    label.position.set(1.15, 0, front ? 0.09 : -0.09)
    if (!front) label.rotation.y = Math.PI
    pivot.add(label)
    g.add(pivot)
  })
  if (boards.length) g.add(shadowed(new THREE.Mesh(mergeGeometries(boards), flat(palette.habitat))))
  for (const [colour, geos] of tips) g.add(shadowed(new THREE.Mesh(mergeGeometries(geos), flat(colour))))
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
