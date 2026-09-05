import test from 'node:test'
import assert from 'node:assert/strict'
import { wrapTumbleweed } from '../../src/world/props/Tumbleweed.js'
import { birdPose } from '../../src/world/props/Birds.js'
import { turbinePositions } from '../../src/world/props/Turbines.js'

/* ---------------------------------- tumbleweeds --------------------------------- */

test('a tumbleweed past the west wall wraps to the east strip, keeping its velocity', () => {
  const body = { position: { x: -115, y: 0.6, z: 10 }, velocity: { x: -3, y: 0, z: 0 } }
  const wrapped = wrapTumbleweed(body, { x0: -110, x1: 110, z0: -130, z1: 75 }, () => 0.5)
  assert.equal(wrapped, true)
  assert.ok(body.position.x > 90, `wrapped to the east strip (x=${body.position.x})`)
  assert.equal(body.velocity.x, -3, 'velocity preserved, so it keeps rolling')
})

test('a tumbleweed inside the world is left alone', () => {
  const body = { position: { x: 0, y: 0.6, z: 0 }, velocity: { x: -3, y: 0, z: 0 } }
  assert.equal(wrapTumbleweed(body, { x0: -110, x1: 110, z0: -130, z1: 75 }, () => 0.5), false)
  assert.equal(body.position.x, 0)
})

/* ------------------------------ birds and turbines ------------------------------ */

test('a bird orbits the tower well clear of it, and a scatter eases back', () => {
  const bird = { i: 0, scatter: 3, elapsed: 0 }
  const p1 = birdPose(bird, 0)
  assert.ok(Math.hypot(p1.x - 0, p1.z + 104) > 10, 'orbits clear of the tower shaft')
  assert.ok(p1.y > 21.5, 'flies above the tower beacon')
  const scattered = bird.scatter
  birdPose(bird, 3)
  assert.ok(bird.scatter < scattered * 0.2, `scatter decays (${scattered} -> ${bird.scatter})`)
})

test('all eight turbines sit outside the drivable extents, among the hills', () => {
  const extents = { x0: -110, x1: 110, z0: -130, z1: 75 }
  const positions = turbinePositions(extents)
  assert.equal(positions.length, 8)
  for (const p of positions) {
    const outside = p.x < extents.x0 || p.x > extents.x1 || p.z < extents.z0 || p.z > extents.z1
    assert.ok(outside, `turbine at ${p.x},${p.z} is outside the walls`)
  }
})
