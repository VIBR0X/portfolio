import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeWorld } from './fixture.mjs'

test('world starts in car mode with a parked plane', () => {
  const { world } = fakeWorld()
  assert.equal(world.mode, 'car')
  assert.ok(world.plane)
  assert.ok(world.plane.grounded)
})

test('boardPlane switches mode and hides the car; exitPlane reverses it', () => {
  const { world } = fakeWorld()
  world.boardPlane()
  assert.equal(world.mode, 'plane')
  assert.equal(world.car.group.visible, false)
  world.plane.physics.airborne = false
  world.plane.physics.speed = 0
  world.exitPlane()
  assert.equal(world.mode, 'car')
  assert.equal(world.car.group.visible, true)
})

test('exitPlane is refused while airborne', () => {
  const { world } = fakeWorld()
  world.boardPlane()
  world.plane.physics.airborne = true
  world.exitPlane()
  assert.equal(world.mode, 'plane', 'still flying: exit refused')
})

test('exitPlane is refused while still rolling fast', () => {
  const { world } = fakeWorld()
  world.boardPlane()
  world.plane.physics.airborne = false
  world.plane.physics.speed = 10
  world.exitPlane()
  assert.equal(world.mode, 'plane', 'still rolling: exit refused')
})

test('staticSolids collects every wall/board body in the physics world', () => {
  const { world } = fakeWorld()
  const before = world.staticSolids.length
  const b = world.physics.box({ size: [1, 1, 1], mass: 0, position: [0, 0, 0] })
  b.userData = { kind: 'wall' }
  world.physics.add(b)
  assert.equal(world.staticSolids.length, before + 1)
})

test('boarding widens the camera zoom range and exiting restores it', () => {
  const { world } = fakeWorld()
  assert.equal(world.camera.maxZoom, 1.9)
  world.boardPlane()
  assert.equal(world.camera.maxZoom, 3.2)
  world.plane.physics.airborne = false
  world.plane.physics.speed = 0
  world.exitPlane()
  assert.equal(world.camera.maxZoom, 1.9)
})

test('a plane update in plane mode moves the plane, not the car', () => {
  const { world } = fakeWorld()
  world.boardPlane()
  const carZ = world.car.physics.position.z
  world.controls.keys.add('ArrowUp')
  for (let i = 0; i < 120; i++) world.update(1 / 60, i / 60)
  world.controls.keys.delete('ArrowUp')
  assert.ok(world.plane.speed > 1, `plane accelerated (speed ${world.plane.speed})`)
  assert.ok(Math.abs(world.car.physics.position.z - carZ) < 0.5, 'car stayed put')
})

test('Enter while still rolling brakes to a stop and then hops out', () => {
  const { world } = fakeWorld()
  world.boardPlane()
  world.plane.physics.airborne = false
  world.plane.physics.speed = 12
  world.exitPlane()
  assert.equal(world.mode, 'plane', 'not out yet, still rolling')
  assert.equal(world._exitWhenStopped, true, 'braking was armed instead of refusing the keypress')
  // Let the frame loop brake it to a halt.
  for (let i = 0; i < 600 && world.mode === 'plane'; i++) world.update(1 / 60, i / 60)
  assert.equal(world.mode, 'car', 'hopped out once stopped')
  assert.equal(world.car.group.visible, true)
})
