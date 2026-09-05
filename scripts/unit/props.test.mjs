import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeWorld } from './fixture.mjs'
import { board } from '../../src/world/Board.js'
import { relayBeacon } from '../../src/world/props/Beacon.js'

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
