import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { fakeWorld } from './fixture.mjs'
import { Particles } from '../../src/world/Particles.js'

test('emit fills a slot; update integrates position with gravity', () => {
  const { world } = fakeWorld()
  const p = new Particles(world, { max: 8 })
  p.emit(new THREE.Vector3(1, 2, 3), {
    count: 1, color: '#ffffff', size: 0.1, life: 0.5,
    spread: 0, velocity: new THREE.Vector3(0, 4, 0), gravity: -10,
  })
  const slot = p._slots.find((s) => s.active)
  assert.ok(slot, 'a slot is active after emit')
  assert.deepEqual([slot.position.x, slot.position.y, slot.position.z], [1, 2, 3])
  p.update(0.1)
  assert.ok(Math.abs(slot.position.y - (2 + 4 * 0.1)) < 1e-9)
  assert.ok(Math.abs(slot.velocity.y - (4 - 10 * 0.1)) < 1e-9)
})

test('a slot dies exactly at its life and is invisible (zero-scale matrix)', () => {
  const { world } = fakeWorld()
  const p = new Particles(world, { max: 4 })
  p.emit(new THREE.Vector3(), { count: 1, life: 0.2, spread: 0, velocity: new THREE.Vector3() })
  p.update(0.2)
  const m = new THREE.Matrix4()
  p.mesh.getMatrixAt(0, m)
  // Matrix4.decompose() cannot recover a scale of exactly zero (it falls back to 1 when a basis
  // column has zero length), so read the raw column directly instead of trusting decompose.
  const scaleLen = Math.hypot(m.elements[0], m.elements[1], m.elements[2])
  assert.ok(scaleLen < 1e-6, 'dead slot scales to zero')
})

test('emitting into a full pool overwrites the oldest slot instead of throwing', () => {
  const { world } = fakeWorld()
  const p = new Particles(world, { max: 2 })
  assert.doesNotThrow(() => {
    for (let i = 0; i < 5; i++) p.emit(new THREE.Vector3(i, 0, 0), { count: 1, life: 10, spread: 0, velocity: new THREE.Vector3() })
  })
  assert.equal(p._slots.filter((s) => s.active).length, 2)
})

test('quality tier halves the pool size', () => {
  assert.equal(new Particles(fakeWorld().world, {}).max, 120)
  assert.equal(new Particles(fakeWorld({ quality: 'low' }).world, {}).max, 60)
})
