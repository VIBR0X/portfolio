import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { fakeWorld } from './fixture.mjs'
import { AirRace, RING_COURSE } from '../../src/world/props/AirRace.js'

test('the course has 10 rings, all inside the world and clear of the tower and rocket', () => {
  assert.equal(RING_COURSE.length, 10)
  const tower = { x: 0, z: -104, top: 21.5 }
  const rocket = { x: 96, z: -30, top: 14 }
  for (const r of RING_COURSE) {
    assert.ok(r.x >= -110 && r.x <= 110 && r.z >= -130 && r.z <= 75, `ring at ${r.x},${r.z} is inside the world`)
    if (Math.hypot(r.x - tower.x, r.z - tower.z) < 10) assert.ok(r.alt > tower.top + 4, `ring near the tower clears it: ${r.alt}`)
    if (Math.hypot(r.x - rocket.x, r.z - rocket.z) < 10) assert.ok(r.alt > rocket.top + 4, `ring near the rocket clears it: ${r.alt}`)
  }
})

test('rings must be passed in order: passing ring 2 first does not advance', () => {
  const { world } = fakeWorld()
  const race = new AirRace(world)
  const r2 = RING_COURSE[1]
  race._tryPass(new THREE.Vector3(r2.x, r2.alt, r2.z + 10), new THREE.Vector3(r2.x, r2.alt, r2.z - 10))
  assert.equal(race.nextIndex, 0, 'still waiting for ring 1')
})

test('a path through a ring centre registers; a path that misses it does not', () => {
  const { world } = fakeWorld()
  const race = new AirRace(world)
  const r = RING_COURSE[0]
  const miss = race._tryPass(new THREE.Vector3(r.x + 20, r.alt, r.z - 3), new THREE.Vector3(r.x + 20, r.alt, r.z + 3))
  assert.equal(miss, false, 'a pass 20 m to the side does not count')
  assert.equal(race.nextIndex, 0)
  const hit = race._tryPass(new THREE.Vector3(r.x, r.alt, r.z - 3), new THREE.Vector3(r.x, r.alt, r.z + 3))
  assert.equal(hit, true, 'straight through the centre counts')
  assert.equal(race.nextIndex, 1)
})

test('landing score grades by descent speed', () => {
  const { world } = fakeWorld()
  const race = new AirRace(world)
  assert.equal(race._grade(0.5), 'Butter landing')
  assert.equal(race._grade(2), 'Smooth landing')
  assert.equal(race._grade(4), 'Landed')
})

test('completing every ring in order finishes the lap and rearms it', () => {
  const { world } = fakeWorld()
  const race = new AirRace(world)
  race.lapActive = true
  for (let i = 0; i < RING_COURSE.length; i++) {
    const r = RING_COURSE[race.nextIndex]
    const n = race._ringNormal(race.nextIndex)
    const before = new THREE.Vector3(r.x, r.alt, r.z).addScaledVector(n, -3)
    const after = new THREE.Vector3(r.x, r.alt, r.z).addScaledVector(n, 3)
    assert.equal(race._tryPass(before, after), true, `ring ${i + 1} registers`)
  }
  assert.equal(race.nextIndex, 0, 'wraps back to the first ring for the next lap')
})

test('the lap timer only runs while a lap is active', () => {
  const { world } = fakeWorld()
  const race = new AirRace(world)
  race.lapActive = false
  race.update(1)
  assert.equal(race.lapT, 0)
  race.lapActive = true
  race.update(1)
  assert.equal(race.lapT, 1)
})

test('rings are hidden while driving and appear once flying', () => {
  const { world } = fakeWorld()
  const race = new AirRace(world)
  assert.equal(race.rings.visible, false, 'hidden at construction, since the world starts in car mode')
  race.update(1 / 60)
  assert.equal(race.rings.visible, false, 'still hidden while driving')
  world.mode = 'plane'
  race.update(1 / 60)
  assert.equal(race.rings.visible, true, 'visible once flying')
  assert.equal(race.discs.visible, true)
})
