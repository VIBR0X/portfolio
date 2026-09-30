import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, lampMaterial, palette, applyShadowFlags } from './Materials.js'
import { clearOfRoads } from './Roads.js'
import { SECTION_DEFS } from './sections/registry.js'
import { craterPoints } from './Craters.js'

/** Same seeded recurrence the hill ring uses, so scatters are stable across reloads. */
function makeRng(seed) {
  let s = seed % 233280
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
}

function clearOfSections(x, z, margin = 0) {
  for (const s of SECTION_DEFS) {
    const [x0, z0, x1, z1] = s.aabb
    if (x >= x0 - margin && x <= x1 + margin && z >= z0 - margin && z <= z1 + margin) return false
  }
  return true
}

/**
 * Deterministic candidate points across `extents`, clear of every road (inflated by `margin`) and
 * every section's interior (inflated by `sectionMargin`), so clutter dresses the empty ground
 * between stations without ever blocking a board, a pad or a prop a section placed itself.
 */
export function scatterPoints(extents, count, seed = 11, { margin = 2.5, sectionMargin = 0 } = {}) {
  const rng = makeRng(seed)
  const points = []
  let guard = 0
  while (points.length < count && guard < count * 80) {
    guard++
    const x = extents.x0 + 4 + rng() * (extents.x1 - extents.x0 - 8)
    const z = extents.z0 + 4 + rng() * (extents.z1 - extents.z0 - 8)
    if (clearOfRoads(x, z, margin) && clearOfSections(x, z, sectionMargin)) points.push({ x, z, r: rng() })
  }
  return points
}

/* ------------------------------------------------------------------ */
/* Solar arrays (spec §2.8)                                            */
/* ------------------------------------------------------------------ */

const PANEL_TILT = 0.49
const PANEL_Y = 1.15
const PANEL_PITCH = 3.2

/**
 * Every solar row: the Projects south verge (two rows, each split by a driving gap at x 46..52)
 * and one row east of the Skills yard. `yaw` turns a panel so its long edge follows the row; the
 * tilt is about the panel's own long axis, so the Skills row leans toward the yard (−x) and the
 * Projects rows toward the camera (+z).
 */
const SOLAR_ROWS = [
  { x0: 22, z: -16.5, along: 'x', body: [26, 1.6, 2.2], centre: [33.2, 0.8, -16.5] },
  { x0: 54, z: -16.5, along: 'x', body: [26, 1.6, 2.2], centre: [65.2, 0.8, -16.5] },
  { x0: 22, z: -20.5, along: 'x', body: [26, 1.6, 2.2], centre: [33.2, 0.8, -20.5] },
  { x0: 54, z: -20.5, along: 'x', body: [26, 1.6, 2.2], centre: [65.2, 0.8, -20.5] },
  { x: 24, z0: -78, along: 'z', body: [2.2, 1.6, 26], centre: [24, 0.8, -66.8] },
]

/** Panel slots as `{ x, z, yaw }`; the low tier keeps every other panel of each row. */
function solarSlots(low) {
  const slots = []
  for (const row of SOLAR_ROWS) {
    for (let i = 0; i < 8; i++) {
      if (low && i % 2) continue
      if (row.along === 'x') slots.push({ x: row.x0 + i * PANEL_PITCH, z: row.z, yaw: 0 })
      else slots.push({ x: row.x, z: row.z0 + i * PANEL_PITCH, yaw: Math.PI / 2 })
    }
  }
  return slots
}

/** True when (x, z) lies on a solar row (inflated by `margin`), so scatter never buries a panel. */
function clearOfSolar(x, z, margin = 2) {
  for (const row of SOLAR_ROWS) {
    const [w, , d] = row.body
    const [cx, , cz] = row.centre
    if (Math.abs(x - cx) < w / 2 + margin && Math.abs(z - cz) < d / 2 + margin) return false
  }
  return true
}

/**
 * One instanced mesh for every array — navy panel plus concrete legs and rail in one vertex-coloured
 * geometry, since both share the slot's matrix (measured: a separate frame mesh cost two more draws
 * per pass at the crossroads for legs whose shadows the panels already cover) — and one static box
 * per row-half.
 */
function buildSolar(world, low) {
  const slots = solarSlots(low)
  // Panel: tilted about its long (X) axis so the dark face leans toward the viewer side of the row.
  const panelGeo = new THREE.BoxGeometry(3.0, 0.08, 1.8)
  panelGeo.rotateX(PANEL_TILT)
  panelGeo.translate(0, PANEL_Y, 0)
  // Frame: two vertical legs up to the panel's centre line and a top rail tilted with the panel.
  const legA = new THREE.BoxGeometry(0.08, 1.4, 0.08)
  legA.translate(-1.3, 0.45, 0)
  const legB = new THREE.BoxGeometry(0.08, 1.4, 0.08)
  legB.translate(1.3, 0.45, 0)
  const rail = new THREE.BoxGeometry(3.04, 0.06, 0.06)
  rail.rotateX(PANEL_TILT)
  rail.translate(0, PANEL_Y - 0.07, 0)
  const unit = mergeGeometries([tinted(panelGeo, palette.navy), tinted(legA, palette.concrete), tinted(legB, palette.concrete), tinted(rail, palette.concrete)])
  const place = (m, p) => {
    m.compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw, 0)), new THREE.Vector3(1, 1, 1))
  }
  // Roughness 0.65, not the spec's 0.35: at 0.35 the environment's specular lobe is tight enough
  // that the east rows, seen more edge-on from the avenue, went from navy to pale grey (measured
  // from (46, −30): west panel (47, 51, 59), east panel (156, 149, 142)). 0.65 spreads the lobe and
  // holds the two rows within 13 per channel of each other from every avenue position sampled.
  instanced(world, unit, flat('#FFFFFF', { vertexColors: true, roughness: 0.65 }), slots, place, { cast: true, name: 'solar-panels' })
  for (const row of SOLAR_ROWS) {
    const body = world.physics.box({ size: row.body, mass: 0, position: row.centre, sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }
}

/* ------------------------------------------------------------------ */
/* Instanced families                                                  */
/* ------------------------------------------------------------------ */

function instanced(world, geometry, material, points, place, { cast = true, name = '', color = null } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, points.length)
  mesh.frustumCulled = false
  mesh.name = name
  const m = new THREE.Matrix4()
  const c = new THREE.Color()
  points.forEach((p, i) => {
    place(m, p)
    mesh.setMatrixAt(i, m)
    // Every instance is coloured here, before the first render, or the mesh draws black.
    if (color) mesh.setColorAt(i, color(c, p))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  world.addStatic(mesh, { reveal: false, cast })
  return mesh
}

/**
 * Boulder points: pairs on every crater rim first (angle and size from their own seeded rng, still
 * checked against roads and sections), then the scatter fills the count. The rim ones get bodies.
 */
function boulderPoints(world, scatter, count, rimCount) {
  const rng = makeRng(37)
  const rim = []
  for (const c of world.craters) {
    for (let k = 0; k < 2 && rim.length < rimCount; k++) {
      const a = rng() * Math.PI * 2
      const r = rng()
      const x = c.cx + Math.cos(a) * c.r * 1.05
      const z = c.cz + Math.sin(a) * c.r * 1.05
      if (clearOfRoads(x, z) && clearOfSections(x, z) && clearOfSolar(x, z)) rim.push({ x, z, r })
    }
  }
  return rim.concat(scatter.slice(0, count - rim.length))
}

/* ------------------------------------------------------------------ */
/* Cable barriers and Mars ground vehicles                             */
/* ------------------------------------------------------------------ */

/**
 * Stamp one colour on every vertex of `geometry` (linear, as `Color` stores it) so parts of
 * different colours merge into a single vertex-coloured mesh: the barriers and the three rovers
 * each cost one draw call per pass instead of one per colour. De-indexed first, because the
 * polyhedra are non-indexed and mergeGeometries refuses a mix.
 */
function tinted(geometry, hex) {
  if (geometry.index) geometry = geometry.toNonIndexed()
  const c = new THREE.Color(hex)
  const n = geometry.attributes.position.count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

const tintedMaterial = () => flat('#FFFFFF', { vertexColors: true })

/**
 * Cable barriers along a few section aprons: concrete posts with a terracotta band and two cobalt
 * cables, one merged mesh. The two avenue runs sit at z −22.9, a clear metre south of the kerb
 * strip (`BoxGeometry(len, 0.08, 0.35)` centred on z −24, so its south edge is −23.825): at z −24
 * every 0.07 m post grew straight out of the kerb and each run's wall body overlapped the road edge.
 */
function buildBarriers(world, low) {
  const runs = [
    { x0: -74, z0: -22.9, x1: -54, z1: -22.9 },
    { x0: 34, z0: -22.9, x1: 52, z1: -22.9 },
    { x0: -14, z0: 58, x1: 8, z1: 58 },
  ]
  const parts = []
  for (const run of runs) {
    const dx = run.x1 - run.x0
    const dz = run.z1 - run.z0
    const len = Math.hypot(dx, dz)
    const n = Math.max(2, Math.round(len / (low ? 3 : 2)))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const post = new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6)
      post.translate(run.x0 + dx * t, 0.5, run.z0 + dz * t)
      parts.push(tinted(post, palette.concrete))
      const band = new THREE.BoxGeometry(0.2, 0.15, 0.2)
      band.translate(run.x0 + dx * t, 0.8, run.z0 + dz * t)
      parts.push(tinted(band, palette.terracotta))
    }
    for (const y of [0.42, 0.66]) {
      const cable = new THREE.BoxGeometry(len, 0.05, 0.05)
      cable.rotateY(-Math.atan2(dz, dx))
      cable.translate((run.x0 + run.x1) / 2, y, (run.z0 + run.z1) / 2)
      parts.push(tinted(cable, palette.cobalt))
    }
    const body = world.physics.box({
      size: [Math.max(Math.abs(dx), 0.4), 1.2, Math.max(Math.abs(dz), 0.4)],
      mass: 0, position: [(run.x0 + run.x1) / 2, 0.6, (run.z0 + run.z1) / 2], sleepy: false,
    })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), tintedMaterial())
  mesh.name = 'barriers'
  world.addStatic(mesh, { reveal: false })
}

/** Ink wheel geometries at the given (x, z) pairs, all on 0.3 m axles. */
function wheels(pairs) {
  return pairs.map(([wx, wz]) => {
    const wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 10)
    wheel.rotateZ(Math.PI / 2)
    wheel.translate(wx, 0.3, wz)
    return tinted(wheel, palette.ink)
  })
}

/** A part in vehicle-local coordinates: geometry, colour, position, optional scale. */
function part(geometry, hex, [x, y, z], scale = null) {
  if (scale) geometry.scale(scale[0], scale[1], scale[2])
  geometry.translate(x, y, z)
  return tinted(geometry, hex)
}

/**
 * Tanker rover, regolith hauler and a utility rover (spec §2.7), parked where they read as
 * deliberate set dressing. Every part is baked into one vertex-coloured mesh; only the utility
 * rover's mast lamp is its own mesh, because it glows.
 *
 * The two avenue rovers park on the south verge (z −19.5), not on the hangar aprons: measured, a
 * rover at (−52, −33.5) put its [1.7, 1.4, 2.6] wall body inside the EPIK pad (x ±2.75, z −34.5..
 * −31.5) and stopped a car driving north at z −30.6 with `areas.current` null, so the pad could
 * only be opened by clicking. z −19.5 clears the avenue kerb (z −23.825), the barrier run at
 * z −22.9 and the Projects solar rows (z −21.6 at the nearest).
 */
function buildVehicles(world) {
  const spots = [
    { x: -58, z: -19.5, kind: 'tanker', yaw: 0 },
    { x: -82, z: -19.5, kind: 'hauler', yaw: 0.3 },
    { x: 8, z: 37, kind: 'utility', yaw: -0.4 },
  ]
  const six = [[-0.62, -0.9], [-0.62, 0], [-0.62, 0.9], [0.62, -0.9], [0.62, 0], [0.62, 0.9]]
  const four = [[-0.62, -0.8], [-0.62, 0.8], [0.62, -0.8], [0.62, 0.8]]
  const rotX = (g) => { g.rotateX(Math.PI / 2); return g }
  const all = []
  for (const s of spots) {
    let parts
    if (s.kind === 'tanker') {
      parts = [
        part(new RoundedBoxGeometry(1.5, 1.2, 1.5, 2, 0.1), palette.habitat, [0, 0.95, -1]),
        part(rotX(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 10)), palette.steel, [0, 0.95, 0.7]),
        part(rotX(new THREE.CylinderGeometry(0.63, 0.63, 0.2, 10)), palette.terracotta, [0, 0.95, 0.7]),
        ...wheels(six),
      ]
    } else if (s.kind === 'hauler') {
      parts = [
        part(new RoundedBoxGeometry(1.2, 0.5, 2.0, 2, 0.08), palette.cobalt, [0, 0.62, 0]),
        part(new THREE.DodecahedronGeometry(0.5, 0), palette.regolithDark, [0, 0.95, 0.2], [1, 0.7, 1.4]),
        part(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 5), palette.ink, [-0.5, 1.2, -0.85]),
        part(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 5), palette.ink, [0.5, 1.2, -0.85]),
        part(new THREE.BoxGeometry(1.1, 0.06, 0.06), palette.ink, [0, 1.58, -0.85]),
        ...wheels(four),
      ]
    } else {
      parts = [
        part(new RoundedBoxGeometry(1.5, 0.8, 2.4, 2, 0.1), palette.habitat, [0, 0.72, 0]),
        part(new RoundedBoxGeometry(1.2, 0.5, 1.0, 2, 0.1), palette.ink, [0, 1.25, 0.2]),
        part(new THREE.BoxGeometry(1.1, 0.2, 0.06), palette.glass, [0, 1.3, -0.3]),
        part(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), palette.ink, [-0.5, 1.7, -0.9]),
        ...wheels(six),
      ]
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lampMaterial())
      bead.position.set(-0.5, 2.32, -0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw).add(new THREE.Vector3(s.x, 0, s.z))
      world.addStatic(bead, { reveal: false, cast: false })
    }
    const m = new THREE.Matrix4().makeRotationY(s.yaw).setPosition(s.x, 0, s.z)
    for (const g of parts) all.push(g.applyMatrix4(m))

    const body = world.physics.box({ size: [1.7, 1.4, 2.6], mass: 0, position: [s.x, 0.7, s.z], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }
  const mesh = new THREE.Mesh(mergeGeometries(all), tintedMaterial())
  mesh.name = 'rovers'
  applyShadowFlags(mesh)
  world.addStatic(mesh, { reveal: false })
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

/**
 * Dresses the empty regolith between sections: boulders (pairs on every crater rim, the rest
 * scattered), ankle-high pebbles and wind drifts, all deterministic and one InstancedMesh each,
 * plus cable barriers, parked Mars rovers and the solar rows. Built after the sections so it can
 * see their pads. Only the rim boulders carry bodies (spec §2.4); pebbles and drifts are driven over.
 */
export function buildClutter(world) {
  const low = world.experience.quality === 'low'
  // Each family is a single InstancedMesh, so the count barely affects the draw-call budget;
  // it is chosen for how inhabited the range reads, not for cost.
  const counts = { boulder: low ? 22 : 45, pebble: low ? 20 : 40, drift: low ? 34 : 70 }
  const rimCount = low ? 12 : 24
  const total = counts.boulder + counts.pebble + counts.drift
  const points = scatterPoints(world.extents, total + 24, 11).filter((p) => clearOfSolar(p.x, p.z))
  let i = 0

  const boulderPts = boulderPoints(world, points.slice(0, counts.boulder), counts.boulder, rimCount)
  i = counts.boulder
  if (boulderPts.length) {
    const rock = new THREE.Color(palette.rock)
    const rockLight = new THREE.Color(palette.rockLight)
    const size = (p) => 1.1 + p.r * 1.3
    instanced(world, new THREE.DodecahedronGeometry(1, 0), flat('#FFFFFF', { roughness: 1 }), boulderPts, (m, p) => {
      const s = size(p)
      m.compose(new THREE.Vector3(p.x, 0.55 * s, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.r * 2, p.r * 5, p.r * 1.3)), new THREE.Vector3(s * (1 + p.r * 0.4), s * 0.8, s))
    }, { cast: true, name: 'boulders', color: (c, p) => c.lerpColors(rock, rockLight, p.r) })
    // Every boulder is solid (spec §5): the smallest is 1.1 m across, well above the car's bumper.
    for (const p of boulderPts) {
      const s = size(p)
      const body = world.physics.sphere({ radius: 0.8 * s, mass: 0, position: [p.x, 0.5 * s, p.z], sleepy: false })
      body.userData = { kind: 'wall', tag: 'wall' }
      world.physics.add(body)
    }
  }

  const pebblePts = points.slice(i, (i += counts.pebble))
  if (pebblePts.length) {
    const a = new THREE.Color(palette.regolithLight)
    const b = new THREE.Color('#A8674A')
    instanced(world, new THREE.DodecahedronGeometry(0.6, 0), flat('#FFFFFF', { roughness: 1 }), pebblePts, (m, p) => {
      const s = 0.5 + p.r * 0.4
      m.compose(new THREE.Vector3(p.x, 0.22, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.r * 2, p.r * 5, 0)), new THREE.Vector3(s, s * 0.7, s))
    }, { cast: false, name: 'pebbles', color: (c, p) => c.lerpColors(a, b, p.r) })
  }

  const driftPts = points.slice(i, (i += counts.drift))
  if (driftPts.length) {
    // 16×6 rather than the spec's 8×5, y 0.12 rather than 0.22, and the colour range pulled down to
    // the ground: measured from 43° above, an 8-segment sphere flattened to 0.22 m read as a
    // hard-edged pale octagon sticker with a facet line across it. The finer silhouette and the
    // lower, darker tail let the drift blend into the regolith it is made of.
    const a = new THREE.Color(palette.regolith)
    const b = new THREE.Color('#C9825A')
    instanced(world, new THREE.SphereGeometry(1, 16, 6), flat('#FFFFFF', { roughness: 1 }), driftPts, (m, p) => {
      m.compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.r * 0.6 - 0.3, 0)), new THREE.Vector3(2.4 + p.r * 1.2, 0.12, 1.0 + p.r * 0.6))
    }, { cast: false, name: 'drifts', color: (c, p) => c.lerpColors(a, b, p.r) }) // low ground dressing: a shadow map entry each frame buys nothing readable
  }

  buildBarriers(world, low)
  buildVehicles(world)
  buildSolar(world, low)
}
