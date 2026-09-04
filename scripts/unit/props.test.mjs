import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeWorld } from './fixture.mjs'
import { board } from '../../src/world/Board.js'

test('the car has glossier paint and every part casts and receives', () => {
  const { world } = fakeWorld()
  const car = world.car
  assert.equal(car.body.material.roughness, 0.55)
  assert.deepEqual([car.body.castShadow, car.body.receiveShadow], [true, true])
  let meshes = 0
  car.group.traverse((o) => { if (o.isMesh) { meshes++; assert.ok(o.castShadow && o.receiveShadow, `${o.name || 'car part'} flagged`) } })
  assert.ok(meshes >= 8)
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
