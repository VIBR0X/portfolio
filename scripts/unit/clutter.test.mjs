import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { scatterPoints, buildClutter } from '../../src/world/Clutter.js'
import { craterPoints } from '../../src/world/Craters.js'
import { ROAD_RECTS } from '../../src/world/Roads.js'
import { SECTION_DEFS } from '../../src/world/sections/registry.js'
import { CANNON } from '../../src/core/Physics.js'
import { fakeWorld } from './fixture.mjs'
import { readFileSync } from 'node:fs'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { setFont } from '../../src/world/Text.js'
import { buildSections } from '../../src/world/sections/index.js'

const EXTENTS = { x0: -110, x1: 110, z0: -130, z1: 75 }

function insideRect(x, z, r) {
  if (r.disc) return Math.hypot(x - r.cx, z - r.cz) < r.w / 2
  return Math.abs(x - r.cx) < r.w / 2 && Math.abs(z - r.cz) < r.d / 2
}

test('every scattered point avoids roads and section interiors', () => {
  const points = scatterPoints(EXTENTS, 72)
  assert.equal(points.length, 72, 'the sampler finds enough clear ground')
  for (const p of points) {
    for (const r of ROAD_RECTS) assert.ok(!insideRect(p.x, p.z, r), `${p.x.toFixed(1)},${p.z.toFixed(1)} clear of ${r.name}`)
    for (const s of SECTION_DEFS) {
      const [x0, z0, x1, z1] = s.aabb
      assert.ok(!(p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1), `${p.x.toFixed(1)},${p.z.toFixed(1)} clear of ${s.id}`)
    }
  }
})

test('every scattered point stays inside the world', () => {
  for (const p of scatterPoints(EXTENTS, 72)) {
    assert.ok(p.x > EXTENTS.x0 && p.x < EXTENTS.x1 && p.z > EXTENTS.z0 && p.z < EXTENTS.z1)
  }
})

test('the scatter is deterministic across runs', () => {
  assert.deepEqual(scatterPoints(EXTENTS, 40), scatterPoints(EXTENTS, 40))
})

test('a different seed gives a different scatter', () => {
  assert.notDeepEqual(scatterPoints(EXTENTS, 40, 11), scatterPoints(EXTENTS, 40, 12))
})

test('twelve craters, 3–8 m, seeded, clear of roads and sections by their own radius plus 2 m', () => {
  const craters = craterPoints(EXTENTS)
  assert.equal(craters.length, 12)
  assert.deepEqual(craters, craterPoints(EXTENTS), 'deterministic')
  for (const c of craters) {
    assert.ok(c.r >= 3 && c.r <= 8, `r ${c.r}`)
    for (const rd of ROAD_RECTS) {
      const dx = Math.max(0, Math.abs(c.cx - rd.cx) - rd.w / 2)
      const dz = rd.disc ? 0 : Math.max(0, Math.abs(c.cz - rd.cz) - rd.d / 2)
      const d = rd.disc ? Math.max(0, Math.hypot(c.cx - rd.cx, c.cz - rd.cz) - rd.w / 2) : Math.hypot(dx, dz)
      assert.ok(d >= c.r + 2 - 1e-6, `crater at ${c.cx},${c.cz} r ${c.r} touches ${rd.name}`)
    }
    for (const s of SECTION_DEFS) {
      const [x0, z0, x1, z1] = s.aabb
      const inside = c.cx > x0 - c.r && c.cx < x1 + c.r && c.cz > z0 - c.r && c.cz < z1 + c.r
      assert.ok(!inside, `crater at ${c.cx},${c.cz} overlaps ${s.id}`)
    }
  }
  assert.equal(craterPoints(EXTENTS, { low: true }).length, 6)
})

test('scatterPoints honours a road margin and a section margin', () => {
  const pts = scatterPoints(EXTENTS, 40, 11, { margin: 8, sectionMargin: 8 })
  for (const p of pts) {
    for (const rd of ROAD_RECTS) {
      if (rd.disc) assert.ok(Math.hypot(p.x - rd.cx, p.z - rd.cz) >= rd.w / 2 + 8 - 1e-6)
      else assert.ok(Math.abs(p.x - rd.cx) >= rd.w / 2 + 8 - 1e-6 || Math.abs(p.z - rd.cz) >= rd.d / 2 + 8 - 1e-6)
    }
    for (const s of SECTION_DEFS) {
      const [x0, z0, x1, z1] = s.aabb
      assert.ok(p.x < x0 - 8 || p.x > x1 + 8 || p.z < z0 - 8 || p.z > z1 + 8)
    }
  }
})

/* --------------------------------- built clutter --------------------------------- */

const staticSpheres = (world) => world.physics.world.bodies.filter((b) => b.shapes[0] instanceof CANNON.Sphere && b.mass === 0)

test('boulders: 45 instances, every one with a sphere body, all coloured', () => {
  const { world, scene } = fakeWorld()
  const before = staticSpheres(world).length
  buildClutter(world)
  assert.equal(staticSpheres(world).length - before, 45)
  const boulders = scene.getObjectByName('boulders')
  assert.ok(boulders?.isInstancedMesh)
  assert.equal(boulders.count, 45)
  assert.ok(boulders.instanceColor, 'every boulder is coloured before the first render')
  assert.equal(boulders.castShadow, true)
  for (const [name, count, cast] of [['pebbles', 40, false], ['drifts', 70, false]]) {
    const mesh = scene.getObjectByName(name)
    assert.ok(mesh?.isInstancedMesh, name)
    assert.equal(mesh.count, count, `${name} count`)
    assert.equal(mesh.castShadow, cast, `${name} cast`)
    assert.ok(mesh.instanceColor, `${name} coloured`)
  }
  for (const name of ['boulders', 'pebbles', 'drifts']) {
    const mesh = scene.getObjectByName(name)
    const c = mesh.instanceColor.array
    // Linear-space sums: the darkest rock (#6B4636) comes to ~0.25, an unset instance to exactly 0.
    for (let i = 0; i < mesh.count; i++) assert.ok(c[i * 3] + c[i * 3 + 1] + c[i * 3 + 2] > 0.05, `${name}[${i}] is not black`)
  }
})

test('solar rows: 40 panels on the high tier, 5 row bodies', () => {
  const { world, scene } = fakeWorld()
  const before = new Set(world.physics.world.bodies)
  buildClutter(world)
  const panels = scene.getObjectByName('solar-panels')
  assert.ok(panels?.isInstancedMesh)
  assert.equal(panels.count, 40)
  assert.equal(panels.castShadow, true)
  assert.ok(panels.geometry.attributes.color, 'panel and frame colours ride on the vertices: one draw per pass')
  assert.equal(scene.getObjectByName('solar-frames'), undefined, 'no separate frame mesh')
  const rows = world.physics.world.bodies.filter((b) => !before.has(b) && b.mass === 0 && b.shapes[0] instanceof CANNON.Box).filter((b) => {
    const h = b.shapes[0].halfExtents
    return Math.abs(h.y - 0.8) < 1e-6 && ((Math.abs(h.x - 13) < 1e-6 && Math.abs(h.z - 1.1) < 1e-6) || (Math.abs(h.x - 1.1) < 1e-6 && Math.abs(h.z - 13) < 1e-6))
  })
  assert.equal(rows.length, 5)
  for (const b of rows) assert.equal(b.userData.kind, 'wall')
})

test('the low tier halves the solar rows and boulder bodies and keeps the row bodies', () => {
  const { world, scene } = fakeWorld({ quality: 'low' })
  const before = staticSpheres(world).length
  buildClutter(world)
  assert.equal(scene.getObjectByName('solar-panels').count, 20)
  assert.equal(scene.getObjectByName('boulders').count, 22)
  assert.equal(scene.getObjectByName('drifts').count, 34)
  assert.equal(staticSpheres(world).length - before, 22)
})

test('the drifts are soft wind tails, not hard pale octagons', () => {
  const { world, scene } = fakeWorld()
  buildClutter(world)
  const drifts = scene.getObjectByName('drifts')
  const p = drifts.geometry.parameters
  // 8×5 read as a visible octagon silhouette with a facet line from 43° above; 16×6 does not.
  assert.ok(p.widthSegments >= 16 && p.heightSegments >= 6, `drift sphere ${p.widthSegments}×${p.heightSegments}`)
  const m = new THREE.Matrix4()
  const s = new THREE.Vector3()
  for (let i = 0; i < drifts.count; i++) {
    drifts.getMatrixAt(i, m)
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s)
    assert.ok(Math.abs(s.y - 0.12) < 1e-6, `drift ${i} height ${s.y}`)
  }
  // The colour range sits between the ground tone and a shade just above it, never up at the old
  // pale #DA9068 sticker end.
  const c = drifts.instanceColor.array
  const hi = new THREE.Color('#C9825A')
  for (let i = 0; i < drifts.count; i++) {
    assert.ok(c[i * 3] <= hi.r + 1e-3, `drift ${i} red ${c[i * 3]} above the ground range`)
  }
})

test('the cable-barrier posts stand clear of the avenue kerb strips', () => {
  const { world, scene } = fakeWorld()
  buildClutter(world)
  const p = scene.getObjectByName('barriers').geometry.attributes.position
  // Kerbs are BoxGeometry(len, 0.08, 0.35) centred on z −36 and z −24 (Roads.buildKerbs).
  const KERBS = [-36, -24]
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i)
    for (const k of KERBS) assert.ok(Math.abs(z - k) > 0.175, `barrier vertex at z ${z.toFixed(3)} pierces the kerb at z ${k}`)
  }
})

/* --------------------------- pads stay drivable --------------------------- */

/** Every section built, then clutter on top of it, with the bodies clutter itself added. */
function clutterOnSections() {
  setFont(new FontLoader().parse(JSON.parse(readFileSync(new URL('../../public/fonts/helvetiker_bold.typeface.json', import.meta.url), 'utf8'))))
  const { world } = fakeWorld()
  buildSections(world)
  const before = new Set(world.physics.world.bodies)
  buildClutter(world)
  const added = world.physics.world.bodies.filter((b) => !before.has(b) && b.shapes.length)
  for (const b of added) b.updateAABB()
  return { world, added }
}

test('nothing clutter parks reaches into an interaction pad: every pad can still be driven onto', () => {
  // Regression for the measured blocker: the tanker rover parked at (−52, −33.5) and the hauler at
  // (−76, −33.5) put [1.7, 1.4, 2.6] wall bodies inside the EPIK and DEVCOM pads, so a car driving
  // north from (−52, −27) stopped at z −30.6 with areas.current still null and the resume panels
  // could only be opened by clicking.
  const { world, added } = clutterOnSections()
  assert.ok(world.areas.areas.length > 10, 'the sections placed their pads')
  for (const area of world.areas.areas) {
    const x0 = area.x - area.width / 2
    const x1 = area.x + area.width / 2
    const z0 = area.z - area.depth / 2
    const z1 = area.z + area.depth / 2
    for (const b of added) {
      const a = b.aabb
      if (a.lowerBound.y > 0.4) continue // above the car's bumper: nothing it would meet
      const hit = a.lowerBound.x < x1 && a.upperBound.x > x0 && a.lowerBound.z < z1 && a.upperBound.z > z0
      assert.ok(!hit, `clutter body at (${b.position.x.toFixed(1)}, ${b.position.z.toFixed(1)}) blocks the ${area.label} pad`)
    }
  }
})

test('the parked rovers keep off the driving routes', () => {
  const { world } = fakeWorld()
  buildClutter(world)
  const rovers = world.physics.world.bodies.filter((b) => b.mass === 0 && b.shapes[0]?.halfExtents
    && Math.abs(b.shapes[0].halfExtents.x - 0.85) < 1e-6 && Math.abs(b.shapes[0].halfExtents.z - 1.3) < 1e-6)
  assert.equal(rovers.length, 3, 'three parked rovers')
  // The through-routes only: the aprons are open hardstanding a rover is allowed to park on.
  const routes = ROAD_RECTS.filter((r) => ['runway', 'north avenue', 'south avenue', 'north roundabout', 'south roundabout'].includes(r.name))
  for (const b of rovers) {
    for (const r of routes) {
      if (r.disc) { assert.ok(Math.hypot(b.position.x - r.cx, b.position.z - r.cz) > r.w / 2 + 1.3, `rover parked on ${r.name}`); continue }
      const on = Math.abs(b.position.x - r.cx) < r.w / 2 + 0.85 && Math.abs(b.position.z - r.cz) < r.d / 2 + 1.3
      assert.ok(!on, `rover at (${b.position.x}, ${b.position.z}) sits on ${r.name}`)
    }
  }
})
