import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, palette, applyShadowFlags } from './Materials.js'
import { ROAD_RECTS } from './Roads.js'
import { SECTION_DEFS } from './sections/registry.js'

/** Same seeded recurrence the hill ring uses, so scatters are stable across reloads. */
function makeRng(seed) {
  let s = seed % 233280
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
}

function clearOfRoads(x, z, margin = 2.5) {
  for (const r of ROAD_RECTS) {
    if (r.disc) { if (Math.hypot(x - r.cx, z - r.cz) < r.w / 2 + margin) return false; continue }
    if (Math.abs(x - r.cx) < r.w / 2 + margin && Math.abs(z - r.cz) < r.d / 2 + margin) return false
  }
  return true
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

/** Saguaro: a trunk with two raised arms, merged so each cactus is one instance. */
function cactusGeometry() {
  const parts = []
  const trunk = new THREE.CylinderGeometry(0.24, 0.3, 2.6, 7)
  trunk.translate(0, 1.3, 0)
  parts.push(trunk)
  for (const [sx, h, y] of [[-1, 0.9, 1.5], [1, 0.7, 1.9]]) {
    const upper = new THREE.CylinderGeometry(0.14, 0.16, h, 6)
    upper.translate(sx * 0.42, y + h / 2, 0)
    parts.push(upper)
    const elbow = new THREE.CylinderGeometry(0.14, 0.15, 0.5, 6)
    elbow.rotateZ(Math.PI / 2)
    elbow.translate(sx * 0.22, y, 0)
    parts.push(elbow)
  }
  return mergeGeometries(parts)
}

function instanced(world, geometry, material, points, place, { cast = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, points.length)
  mesh.frustumCulled = false
  const m = new THREE.Matrix4()
  points.forEach((p, i) => { place(m, p); mesh.setMatrixAt(i, m) })
  mesh.instanceMatrix.needsUpdate = true
  world.addStatic(mesh, { reveal: false, cast })
  return mesh
}

/** Fence runs along a few section aprons, plus a handful of parked service vehicles. */
function buildFences(world, low) {
  const runs = [
    { x0: -74, z0: -24, x1: -54, z1: -24 },
    { x0: 34, z0: -24, x1: 52, z1: -24 },
    { x0: -14, z0: 58, x1: 8, z1: 58 },
  ]
  const postParts = []
  const railParts = []
  for (const run of runs) {
    const dx = run.x1 - run.x0
    const dz = run.z1 - run.z0
    const len = Math.hypot(dx, dz)
    const n = Math.max(2, Math.round(len / (low ? 3 : 2)))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const post = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6)
      post.translate(run.x0 + dx * t, 0.6, run.z0 + dz * t)
      postParts.push(post)
    }
    for (const y of [0.5, 0.95]) {
      const rail = new THREE.BoxGeometry(len, 0.07, 0.07)
      rail.rotateY(-Math.atan2(dz, dx))
      rail.translate((run.x0 + run.x1) / 2, y, (run.z0 + run.z1) / 2)
      railParts.push(rail)
    }
    const body = world.physics.box({
      size: [Math.max(Math.abs(dx), 0.4), 1.2, Math.max(Math.abs(dz), 0.4)],
      mass: 0, position: [(run.x0 + run.x1) / 2, 0.6, (run.z0 + run.z1) / 2], sleepy: false,
    })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }
  world.addStatic(new THREE.Mesh(mergeGeometries(postParts), flat(palette.woodDark)), { reveal: false })
  world.addStatic(new THREE.Mesh(mergeGeometries(railParts), flat(palette.mesa)), { reveal: false })
}

/** Fuel truck, baggage cart and a jeep, parked where they read as deliberate set dressing. */
function buildVehicles(world) {
  const spots = [
    { x: -52, z: -33.5, kind: 'truck', yaw: 0 },
    { x: -76, z: -33.5, kind: 'cart', yaw: 0.3 },
    { x: 8, z: 37, kind: 'jeep', yaw: -0.4 },
  ]
  for (const s of spots) {
    const g = new THREE.Group()
    g.position.set(s.x, 0, s.z)
    g.rotation.y = s.yaw
    if (s.kind === 'truck') {
      const cab = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.2, 1.5, 2, 0.1), flat(palette.cream))
      cab.position.set(0, 0.95, -1)
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 12), flat(palette.sage))
      tank.rotation.x = Math.PI / 2
      tank.position.set(0, 0.95, 0.7)
      g.add(cab, tank)
    } else if (s.kind === 'cart') {
      const bed = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.5, 2, 2, 0.08), flat(palette.terracotta))
      bed.position.y = 0.62
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 1), flat(palette.cream))
      canopy.position.set(0, 1.35, -0.4)
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 5), flat(palette.ink))
        post.position.set(sx * 0.5, 0.98, -0.4)
        g.add(post)
      }
      g.add(bed, canopy)
    } else {
      const body = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.8, 2.4, 2, 0.1), flat(palette.cobalt))
      body.position.y = 0.72
      const cab = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.5, 1, 2, 0.08), flat(palette.ink))
      cab.position.set(0, 1.25, 0.2)
      g.add(body, cab)
    }
    const wheelParts = []
    for (const [wx, wz] of [[-0.62, -0.8], [-0.62, 0.8], [0.62, -0.8], [0.62, 0.8]]) {
      const wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 10)
      wheel.rotateZ(Math.PI / 2)
      wheel.translate(wx, 0.3, wz)
      wheelParts.push(wheel)
    }
    g.add(new THREE.Mesh(mergeGeometries(wheelParts), flat(palette.ink)))
    applyShadowFlags(g)
    world.addStatic(g, { reveal: false })

    const body = world.physics.box({ size: [1.7, 1.4, 2.6], mass: 0, position: [s.x, 0.7, s.z], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }
}

/**
 * Dresses the empty desert between sections: cacti, rocks and scrub scattered deterministically,
 * plus fence runs and parked service vehicles. Built after the sections so it can see their pads.
 */
export function buildClutter(world) {
  const low = world.experience.quality === 'low'
  // Each family is a single InstancedMesh, so the count barely affects the draw-call budget;
  // it is chosen for how inhabited the desert reads, not for cost.
  const counts = { cactus: low ? 22 : 45, rock: low ? 20 : 40, scrub: low ? 34 : 70 }
  const total = counts.cactus + counts.rock + counts.scrub
  const points = scatterPoints(world.extents, total, 11)
  let i = 0

  const cactusPts = points.slice(i, (i += counts.cactus))
  if (cactusPts.length) {
    instanced(world, cactusGeometry(), flat(palette.sage), cactusPts, (m, p) => {
      m.compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.r * 6, 0)), new THREE.Vector3(1, 0.85 + p.r * 0.4, 1))
    })
    for (const p of cactusPts) {
      const body = world.physics.cylinder({ radiusTop: 0.3, radiusBottom: 0.3, height: 2.6, segments: 6, mass: 0, position: [p.x, 1.3, p.z], sleepy: false })
      body.userData = { kind: 'wall', tag: 'wall' }
      world.physics.add(body)
    }
  }

  const rockPts = points.slice(i, (i += counts.rock))
  if (rockPts.length) {
    instanced(world, new THREE.DodecahedronGeometry(0.6, 0), flat(palette.concrete), rockPts, (m, p) => {
      m.compose(new THREE.Vector3(p.x, 0.3, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.r * 2, p.r * 5, 0)), new THREE.Vector3(1 + p.r, 0.7, 1 + p.r * 0.6))
    }, { cast: false })
  }

  const scrubPts = points.slice(i, (i += counts.scrub))
  if (scrubPts.length) {
    instanced(world, new THREE.IcosahedronGeometry(0.7, 0), flat(palette.sageDark), scrubPts, (m, p) => {
      m.compose(new THREE.Vector3(p.x, 0.35, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.r * 6, 0)), new THREE.Vector3(0.9 + p.r * 0.5, 0.55, 0.9 + p.r * 0.4))
    }, { cast: false }) // low ground dressing: a shadow map entry each frame buys nothing readable
  }

  buildFences(world, low)
  buildVehicles(world)
}
