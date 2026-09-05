import test from 'node:test'
import assert from 'node:assert/strict'
import { dishPositions, Dishes } from '../../src/world/props/Dishes.js'
import { fakeWorld } from './fixture.mjs'

const EXTENTS = { x0: -110, x1: 110, z0: -130, z1: 75 }

test('all eight dishes sit outside the drivable extents, among the hills', () => {
  const positions = dishPositions(EXTENTS)
  assert.equal(positions.length, 8)
  for (const p of positions) {
    const outside = p.x < EXTENTS.x0 || p.x > EXTENTS.x1 || p.z < EXTENTS.z0 || p.z > EXTENTS.z1
    assert.ok(outside, `dish at ${p.x},${p.z} is outside the walls`)
  }
})

test('the dishes are eight slewing reflector instances and the lamp beads blink together', () => {
  const { world, scene } = fakeWorld()
  const dishes = scene.getObjectByName('dishes')
  assert.ok(dishes?.isInstancedMesh, 'one InstancedMesh of reflectors')
  assert.equal(dishes.count, 8)
  assert.ok(world.dishes instanceof Dishes)
  const beads = scene.getObjectByName('dish-lamps')
  assert.ok(beads, 'one merged lamp-bead mesh')
  world.dishes.update(1 / 60, 0)
  const a = beads.material.emissiveIntensity
  world.dishes.update(1 / 60, 1)
  const b = beads.material.emissiveIntensity
  assert.notEqual(a, b, 'the beads blink at 0.5 Hz')
  // The reflectors slew: the matrices change between two far-apart times.
  const m0 = new Float32Array(dishes.instanceMatrix.array)
  world.dishes.update(1 / 60, 40)
  let diff = 0
  for (let i = 0; i < m0.length; i++) diff += Math.abs(m0[i] - dishes.instanceMatrix.array[i])
  assert.ok(diff > 0.1, 'reflectors slewed')
})
