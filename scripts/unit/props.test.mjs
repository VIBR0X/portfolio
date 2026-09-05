import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeWorld } from './fixture.mjs'
import { board } from '../../src/world/Board.js'
import { relayBeacon } from '../../src/world/props/Beacon.js'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { setFont } from '../../src/world/Text.js'
import { palette } from '../../src/world/Materials.js'
import { hangar, hangarTrim } from '../../src/world/props/Hangar.js'
import { signpost } from '../../src/world/props/index.js'
import { buildSections } from '../../src/world/sections/index.js'
import { SECTION_DEFS } from '../../src/world/sections/registry.js'

test('the car has glossier paint; solid parts cast and receive, glazing only receives', () => {
  const { world } = fakeWorld()
  const car = world.car
  assert.equal(car.body.material.roughness, 0.55)
  assert.deepEqual([car.body.castShadow, car.body.receiveShadow], [true, true])
  let solid = 0
  let glazing = 0
  car.group.traverse((o) => {
    if (!o.isMesh) return
    if (o.material.transparent) {
      // Same rule as the control tower's glazing: receives, never casts.
      glazing++
      assert.deepEqual([o.castShadow, o.receiveShadow], [false, true], 'car glazing receives only')
    } else {
      solid++
      assert.ok(o.castShadow && o.receiveShadow, `${o.name || 'car part'} flagged`)
    }
  })
  assert.ok(solid >= 8, `solid car parts ${solid}`)
  assert.equal(glazing, 1, 'the windshield is the only transparent part')
  for (const wheel of car.wheels) wheel.traverse((o) => { if (o.isMesh) assert.ok(o.castShadow && o.receiveShadow, 'wheel part flagged') })
})

test('board panels are satin (roughness 0.9) and cast; the face stays unlit', () => {
  const { world } = fakeWorld()
  const { group, face } = board(world, { x: 0, z: 0, title: 'T', body: ['b'] })
  const panel = []
  group.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && o !== face && o.geometry.type !== 'CylinderGeometry') panel.push(o) })
  assert.equal(panel.length, 1)
  assert.equal(panel[0].material.roughness, 0.9)
  assert.deepEqual([panel[0].castShadow, panel[0].receiveShadow], [true, true])
  assert.equal(panel[0].castShadow, true, 'the panel casts a shadow')
  assert.ok(face.material.isMeshBasicMaterial, 'the face stays an unlit canvas so its colours are exact')
})

test('printed faces and counter signs never cast; the lit panel behind the board still does', () => {
  const { world } = fakeWorld()
  const { group, face } = board(world, { x: 0, z: 0, title: 'T', body: ['b'] })
  assert.deepEqual([face.castShadow, face.receiveShadow], [false, false], 'the printed face casts nothing')
  const panel = []
  group.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && o.geometry.type === 'RoundedBoxGeometry') panel.push(o) })
  assert.equal(panel.length, 1)
  assert.ok(panel[0].castShadow, 'the board still casts, from its lit panel')
})

test('a pad follows the shadow rule: ground parts receive only, the floating key cap casts', () => {
  const { world } = fakeWorld()
  const area = world.addArea({ x: 0, z: 0, label: 'PAD' })
  // The ring and the fill lie on the floor, so casting onto it would only be self-shadowing.
  assert.deepEqual([area.ring.castShadow, area.ring.receiveShadow], [false, true], 'the ring receives, never casts')
  assert.equal(area.fill.material.transparent, true, 'the fill is the transparent-lit case the rule covers')
  assert.deepEqual([area.fill.castShadow, area.fill.receiveShadow], [false, true], 'the transparent fill receives, never casts')
  // The key cap floats ~2.2 m up, so it is the one part of a pad with a shadow worth casting.
  assert.equal(area.keyCap.castShadow, true, 'the floating key cap casts')
})

test('a relay beacon blinks 0.15 s on every 2 s from its phase, on its own cloned material', () => {
  const { world } = fakeWorld()
  const a = relayBeacon(world, { x: 0, y: 22, z: -104, phase: 0 })
  const b = relayBeacon(world, { x: -5, y: 10.1, z: 34, phase: 0.7 })
  assert.notEqual(a.material, b.material, 'each beacon owns its material')
  assert.equal(a.material.emissive.getHexString(), 'e07a5f')
  const beacon = world.updatables.at(-1)
  beacon.update(0, 0)
  assert.equal(b.material.emissiveIntensity, 0.15, 'phase 0.7 is off at t 0')
  beacon.update(0, 1.3)
  assert.equal(b.material.emissiveIntensity, 1.6, 'phase 0.7 is on at t 1.3')
  const first = world.updatables.at(-2)
  first.update(0, 0)
  assert.equal(a.material.emissiveIntensity, 1.6)
  first.update(0, 1)
  assert.equal(a.material.emissiveIntensity, 0.15)
  first.update(0, 2.05)
  assert.equal(a.material.emissiveIntensity, 1.6)
  assert.deepEqual([a.castShadow, a.receiveShadow], [false, true])
})

/* ---- Mars recolour, missing bodies, allow-list names, relay beacons ---- */

const hex = (m) => m.color.getHexString()

test('hangars are habitat shells; the airlock collars and cobalt bands merge into one mesh each across the row', () => {
  const { world, scene } = fakeWorld()
  const a = hangar(world, { x: -40, z: -42, number: 1 })
  const b = hangar(world, { x: -52, z: -42, number: 2 })
  const shell = a.group.children.find((o) => o.isMesh && o.material.side === THREE.DoubleSide)
  assert.equal(hex(shell.material), 'efeae0', 'shell is habitat')
  assert.ok(a.trim.collar.isBufferGeometry && a.trim.band.isBufferGeometry, 'each hangar hands back its trim geometry')
  // Per hangar only the shell, the ink parts and the number remain as meshes of their own.
  assert.equal(a.group.children.filter((o) => o.isMesh).length, 3)
  const { collar, band, concrete, lamps } = hangarTrim(world, [a, b])
  assert.equal(hex(collar.material), 'e07a5f', 'collar is terracotta')
  assert.equal(hex(band.material), '2f5d8a', 'band and lintels are cobalt')
  assert.equal(hex(concrete.material), 'b9b0a2', 'vent bodies are concrete')
  assert.ok(lamps.material.emissive.getHex() > 0, 'wall lamps glow')
  for (const m of [collar, band, concrete, lamps]) assert.ok(scene.children.includes(m), 'four row meshes on the scene')
  collar.geometry.computeBoundingBox()
  const cb = collar.geometry.boundingBox
  assert.ok(cb.min.x < -52 && cb.max.x > -40, 'one collar mesh spans both hangars')
  assert.ok(Math.abs(cb.max.z - (-42 + 4.5 + 0.05 + 0.08)) < 0.01, `collar sits at the mouth (max z ${cb.max.z})`)
  assert.ok(cb.max.y > 4.6 && cb.min.y > -0.1, 'collar arches over the mouth, not under the floor')
  a.trim.band.computeBoundingBox()
  const bb = a.trim.band.boundingBox
  assert.ok(Math.abs((bb.min.z + bb.max.z) / 2 - (-42 - 9 / 4)) < 0.01, 'band at z = -depth/4')
  assert.ok(bb.max.y > 4.6 && bb.min.y > -0.1, 'band wraps the top half of the shell')
  band.geometry.computeBoundingBox()
  const lb = band.geometry.boundingBox
  assert.ok(Math.abs(lb.min.z - (-42 - 9 / 4 - 0.15)) < 0.01 && Math.abs(lb.max.z - (-42 + 4.5 + 0.16)) < 0.01, 'the cobalt mesh runs from the bands to the lintels')
})

test('the signpost has an ink post, one merged habitat mesh for every arm, and tips merged per section colour', () => {
  const g = signpost({ height: 4.6, arms: [
    { text: 'A', angle: 0, color: '#123456' },
    { text: 'B', angle: Math.PI / 2, color: '#123456' },
    { text: 'C', angle: Math.PI, color: '#654321' },
  ] })
  const lit = []
  g.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial) lit.push(o) })
  const byColour = (h) => lit.filter((o) => hex(o.material) === h)
  assert.equal(byColour('2b2d42').length, 1, 'one ink post')
  assert.equal(byColour('efeae0').length, 1, 'all arms in one habitat mesh')
  assert.equal(byColour('123456').length, 1, 'two same-coloured tips share a mesh')
  assert.equal(byColour('654321').length, 1)
  assert.equal(lit.length, 4, 'four lit draws for three arms')
  // The merged arms still point where the pivots did: arm A along +x, arm C along -x, at their heights.
  const arms = byColour('efeae0')[0].geometry
  arms.computeBoundingBox()
  assert.ok(arms.boundingBox.max.x > 2.3 && arms.boundingBox.min.x < -2.3, 'arms reach both ways')
  assert.ok(Math.abs(arms.boundingBox.max.y - (4.6 - 0.45 + 0.275)) < 0.01, 'top arm at its pivot height')
  const labels = []
  g.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) labels.push(o) })
  assert.equal(labels.length, 6, 'a front and back label per arm')
})

test('the car is the rover blue by default with an ink skirt and cabin', () => {
  const { world } = fakeWorld()
  assert.equal(hex(world.car.body.material), '2e6da4')
  const inks = []
  world.car.shell.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && hex(o.material) === '2b2d42') inks.push(o) })
  assert.ok(inks.length >= 3, `skirt, cabin and mirrors in ink (${inks.length})`)
})

test('the Skills registry colour is steel', () => {
  assert.equal(SECTION_DEFS.find((d) => d.id === 'skills').color, palette.steel)
})

function fullWorld() {
  setFont(new FontLoader().parse(JSON.parse(readFileSync(new URL('../../public/fonts/helvetiker_bold.typeface.json', import.meta.url), 'utf8'))))
  const { world, scene } = fakeWorld()
  world.build(buildSections)
  world.reveal.finish()
  scene.updateMatrixWorld(true)
  const statics = world.physics.world.bodies.filter((b) => b.mass === 0 && b.shapes.length && b !== world.physics.ground)
  for (const b of statics) b.updateAABB()
  const covered = (x, y, z) => statics.some((b) => {
    const a = b.aabb
    return a.lowerBound.x <= x && a.upperBound.x >= x && a.lowerBound.y <= y && a.upperBound.y >= y && a.lowerBound.z <= z && a.upperBound.z >= z
  })
  return { world, scene, statics, covered }
}

test('every prop the audit found now has a static body under it', () => {
  const { covered, statics, world } = fullWorld()
  const points = {
    'Epik warehouse': [-52, 1.1, -45.2],
    'Epik tank': [-52, 0.9, -39.2],
    'DevCom building': [-76, 1.1, -45.6],
    'DevCom podium': [-79.4, 0.35, -45.4],
    'telephone desk': [9, 0.45, 44],
    'hoop foot south': [84, 0.6, 55.6],
    'hoop foot north': [84, 0.6, 52.4],
  }
  for (const [name, [x, y, z]] of Object.entries(points)) assert.ok(covered(x, y, z), `${name} at ${x},${y},${z}`)
  // Every tyre stack of the ring: the top tyre of each stack is solid.
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2
    const stack = i % 3
    const x = 52 + Math.cos(a) * 25
    const z = 40 + Math.sin(a) * 20
    assert.ok(covered(x, 0.25 + stack * 0.4, z), `tyre stack ${i} at ${x.toFixed(1)},${z.toFixed(1)}`)
  }
  // The five Skills tank boards carry a body each.
  const skillBoards = statics.filter((b) => b.userData?.tag === 'board' && Math.abs(Math.abs(b.position.x) - 12) < 0.01 && b.position.z < -50 && b.position.z > -80)
  assert.equal(skillBoards.length, 5)
  assert.ok(world.physics.world.bodies.length <= 300, `bodies ${world.physics.world.bodies.length}`)
})

test('the allow-listed objects are named so the audit can exempt them, and the mast beacons blink', () => {
  const { scene, world } = fullWorld()
  assert.ok(scene.getObjectByName('signpost'), 'signpost named')
  assert.ok(scene.getObjectByName('epik-pipes'), 'epik pipes named')
  assert.ok(scene.getObjectByName('tanks-ink'), 'tank ladders named')
  let cubes = 0
  scene.traverse((o) => { if (o.name === 'totem-cube') cubes++ })
  assert.equal(cubes, 4)
  const beacons = []
  scene.traverse((o) => {
    if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius === 0.16 && o.material.emissive?.getHexString() === 'e07a5f') beacons.push(o)
  })
  const at = (x, y, z) => beacons.some((b) => { const p = b.getWorldPosition(new THREE.Vector3()); return Math.hypot(p.x - x, p.y - y, p.z - z) < 0.01 })
  assert.ok(at(0, 22, -104), 'tower relay beacon')
  assert.ok(at(-5, 10.1, 34), 'contact relay beacon')
  assert.ok(world.updatables.length > 0)
})

test('no lit surface in the world is green, and no floor stencil is the old grey', () => {
  const { scene } = fullWorld()
  const offenders = []
  const c = new THREE.Color()
  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (!m.color) continue
      const { r, g, b } = m.color
      if (g > r + 0.06 && g > b + 0.06) offenders.push(`${o.name || o.geometry.type} ${m.color.getHexString()}`)
      if (['9c8b63', '8e8778', '7a768a'].includes(m.color.getHexString())) offenders.push(`${o.name || o.geometry.type} old grey ${m.color.getHexString()}`)
    }
    if (o.isInstancedMesh && o.instanceColor) {
      for (let i = 0; i < o.count; i++) {
        o.getColorAt(i, c)
        if (c.g > c.r + 0.06 && c.g > c.b + 0.06) offenders.push(`${o.name || o.geometry.type}[${i}] ${c.getHexString()}`)
      }
    }
  })
  assert.deepEqual(offenders, [])
})
