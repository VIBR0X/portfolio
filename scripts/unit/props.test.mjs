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
import { signpost, screenBearing } from '../../src/world/props/index.js'
import { clearOfRoutes } from '../../src/world/Roads.js'
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
  assert.ok(solid >= 6 && solid <= 10, `solid car parts ${solid}`)
  assert.equal(glazing, 1, 'the windshield is the only transparent part')
  assert.ok(car.wheels.isInstancedMesh && car.wheels.count === 4, 'the four wheels are one instanced mesh')
  assert.ok(car.wheels.castShadow && car.wheels.receiveShadow, 'wheels flagged')
})

test('board panels are satin (roughness 0.9) and cast; the face stays unlit', () => {
  const { world } = fakeWorld()
  const { group, face } = board(world, { x: 0, z: 0, title: 'T', body: ['b'] })
  const panel = []
  group.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && o !== face && o.name !== 'board-posts') panel.push(o) })
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

test('the signpost is one mast, one frame mesh, one printed atlas, one cap mesh and one arrow mesh', () => {
  const g = signpost({ height: 4.45, base: 2.10, gap: 0.40, tiers: [
    [{ text: 'A', angle: -Math.PI / 2, dist: 74, color: '#123456', align: 'left' },
     { text: 'B', angle: 0, dist: 60, color: '#654321', align: 'right' }],
    [{ text: 'C', angle: Math.PI / 2, dist: 40, color: '#123456', align: 'left' }],
  ] })
  const lit = []
  const printed = []
  g.traverse((o) => { if (o.isMesh) (o.material.isMeshStandardMaterial ? lit : printed).push(o) })
  assert.equal(lit.length, 4, 'mast + frames + caps + arrows: four lit draws for any number of plates')
  assert.equal(printed.length, 1, 'every plate label shares one canvas atlas')
  const byColour = (h) => lit.filter((o) => hex(o.material) === h)
  assert.equal(byColour('2b2d42').length, 1, 'one ink mast')
  assert.equal(byColour('efeae0').length, 1, 'all plate frames in one habitat mesh')
  assert.equal(byColour('2f5d8a').length, 1, 'all accent end-caps in one cobalt mesh')
  assert.equal(byColour('fff8ea').length, 1, 'all arrows in one cream mesh')
  // The mast is built to `height` so it stands on the plinth: the old shared 3.2 m cylinder
  // ignored the argument and left a 0.70 m gap under the post.
  const mast = byColour('2b2d42')[0].geometry
  mast.computeBoundingBox()
  assert.ok(mast.boundingBox.min.y <= 0.001, 'the mast starts at the group origin')
  // 1e-3 tolerance: positions are float32, so a mast built to exactly 4.45 measures 4.4499998.
  assert.ok(mast.boundingBox.max.y >= 4.45 - 1e-3, 'the mast is built to `height`')
  const frames = byColour('efeae0')[0].geometry
  frames.computeBoundingBox()
  assert.ok(frames.boundingBox.min.x < -1 && frames.boundingBox.max.x > 1, 'plates hang both ways')
  // Crossroads mounts the group at y = 0.6, so this local 1.798 is 2.398 m in world terms —
  // 0.67 m over the rover's 1.73 m roll bar. The old lowest arm sat at 0.97 m and the car
  // drove straight through it.
  assert.ok(frames.boundingBox.min.y + 0.6 > 2.0, 'the lowest plate clears the rover')
  assert.ok(frames.boundingBox.max.y < 4.45, 'no plate rises above the mast')
})

test('signpost arrows point where a place is on screen, not where it is in the world', () => {
  // The camera looks down the fixed (0, −26, −28) axis, so world north maps to screen up at 0.6805.
  const deg = (a) => screenBearing(a) * 180 / Math.PI
  assert.ok(Math.abs(deg(0)) < 0.01, 'east → screen right')
  assert.ok(Math.abs(Math.abs(deg(Math.PI)) - 180) < 0.01, 'west → screen left')
  assert.ok(Math.abs(deg(Math.PI / 2) - 90) < 0.01, 'north → screen up')
  assert.ok(Math.abs(deg(Math.atan2(-70, 52)) + 42.5) < 0.5, 'the playground bearing lands at −42.5°')
})

test('the car is the rover blue by default with an ink skirt and cabin', () => {
  const { world } = fakeWorld()
  assert.equal(hex(world.car.body.material), '2e6da4')
  const inks = []
  world.car.shell.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && hex(o.material) === '2b2d42') inks.push(o) })
  assert.equal(inks.length, 1, `skirt, cabin, mirrors and antenna merged into one ink mesh (${inks.length})`)
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
  const { covered, statics, world, scene } = fullWorld()
  const points = {
    'Epik warehouse': [-54, 0.9, -44.6],
    'Tark west jaw': [-39.65, 0.55, -42.8],
    'Tark east jaw': [-36.35, 0.55, -42.8],
    'Tark LLM post': [-34.0, 1.1, -45.0],
    'DevCom release pylon west': [-88.9, 1.2, -44.8],
    'DevCom release pylon east': [-83.1, 1.2, -44.8],
    'telephone desk': [9, 0.45, 44],
    'hoop foot south': [84, 0.6, 55.6],
    'hoop foot north': [84, 0.6, 52.4],
    // The outer rails of the nine-source screen. The nine flaps between them deliberately carry no
    // bodies (0.16 m thick, exempt by rule) and swing clear instead, so the rails are the only
    // thing holding the lanes: if these ever lose their bodies the car drives through the cage.
    'consulting lane rail west': [-75.1, 1.2, -43.6],
    'consulting lane rail east': [-64.9, 1.2, -43.6],
  }
  for (const [name, [x, y, z]] of Object.entries(points)) assert.ok(covered(x, y, z), `${name} at ${x},${y},${z}`)
  // The tyre ring must never wall the range in. Rather than restate the exclusion rectangles —
  // which is how this regressed twice — this asserts the property they exist to guarantee, read
  // off the ring's own instance matrices and checked against ROAD_RECTS.
  let tyres = null
  scene.traverse((o) => { if (o.name === 'tyres') tyres = o })
  assert.ok(tyres, 'tyre ring present')
  assert.ok(tyres.count > 20, `the ring still reads as a boundary (${tyres.count} tyres)`)
  const p = new THREE.Vector3()
  const m = new THREE.Matrix4()
  const stacks = []
  for (let i = 0; i < tyres.count; i++) {
    tyres.getMatrixAt(i, m)
    p.setFromMatrixPosition(m)
    // No stack on a through route: the rover must be able to use the full carriageway. 1.83 m is
    // the tyre's radius plus half its 1.96 m wheel track.
    assert.ok(clearOfRoutes(p.x, p.z, 1.83), `tyre at ${p.x.toFixed(1)},${p.z.toFixed(1)} blocks a through route`)
    // Nor inside the jump ramp, which a buried stack made unclimbable.
    const inRamp = Math.abs(p.x - 70) < 3 + 0.85 && Math.abs(p.z - 54) < 2.25 + 0.85
    assert.ok(!inRamp, `tyre at ${p.x.toFixed(1)},${p.z.toFixed(1)} is inside the ramp`)
    if (!stacks.some((s) => Math.abs(s.x - p.x) < 0.01 && Math.abs(s.z - p.z) < 0.01)) stacks.push({ x: p.x, z: p.z })
  }
  // Every stack that survives is solid, so the ring is still a barrier where it exists.
  for (const s of stacks) assert.ok(covered(s.x, 0.3, s.z), `tyre stack at ${s.x.toFixed(1)},${s.z.toFixed(1)} has no body`)
  // And the south avenue actually gets through: a gateway at least a lane wide at each crossing.
  for (const gx of [30, 73]) {
    const blocking = stacks.filter((s) => Math.abs(s.x - gx) < 9 && s.z > 25 - 1.83 && s.z < 35 + 1.83)
    assert.equal(blocking.length, 0, `the south avenue crossing at x=${gx} is blocked`)
  }
  // No tyre stands on the south avenue (x −6…84, z 25…35) or within a tyre radius of it. This is
  // the way into the test range; seven stacks used to sit on the carriageway.
  for (let i = 0; i < tyres.count; i++) {
    tyres.getMatrixAt(i, m)
    p.setFromMatrixPosition(m)
    const onRoad = p.x > -6 && p.x < 84 && p.z > 25 - 0.85 && p.z < 35 + 0.85
    assert.ok(!onRoad, `tyre instance ${i} at ${p.x.toFixed(1)},${p.z.toFixed(1)} blocks the south avenue`)
  }
  // The five Skills tank boards carry a body each.
  const skillBoards = statics.filter((b) => b.userData?.tag === 'board' && Math.abs(Math.abs(b.position.x) - 12) < 0.01 && b.position.z < -50 && b.position.z > -80)
  assert.equal(skillBoards.length, 5)
  assert.ok(world.physics.world.bodies.length <= 300, `bodies ${world.physics.world.bodies.length}`)
})

test('the allow-listed objects are named so the audit can exempt them, and the mast beacons blink', () => {
  const { scene, world } = fullWorld()
  assert.ok(scene.getObjectByName('signpost'), 'signpost named')
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
