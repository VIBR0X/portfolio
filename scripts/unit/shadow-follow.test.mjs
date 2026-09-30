import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { ShadowFollow } from '../../src/core/ShadowFollow.js'

function make() {
  const sun = new THREE.DirectionalLight()
  sun.shadow.mapSize.set(2048, 2048)
  return { sun, follow: new ShadowFollow(sun) }
}

const PER_ZOOM = 26
const BASE = 14
// The frustum is centred `AHEAD * zoom` metres north of the focus rather than on it, because the
// camera looks north and down: aiming at the car spent nearly half the map on ground below the bottom
// edge of the frame while the top corners fell outside the frustum and rendered as fully lit.
// Widening it instead would have cost ~40 draw calls of extra shadow-pass geometry.
const AHEAD = 10

test('frustum half-size is perZoom·zoom + base and the camera is symmetric', () => {
  const { sun, follow } = make()
  assert.equal(follow.perZoom, PER_ZOOM)
  assert.equal(follow.base, BASE)
  follow.aim(new THREE.Vector3(0, 0, 0), 1)
  const cam = sun.shadow.camera
  const half = PER_ZOOM + BASE
  assert.equal(cam.right, half)
  assert.equal(cam.left, -half)
  assert.equal(cam.top, half)
  assert.equal(cam.bottom, -half)
  follow.aim(new THREE.Vector3(0, 0, 0), 1.9)
  assert.ok(Math.abs(cam.right - (PER_ZOOM * 1.9 + BASE)) < 1e-9)
  assert.equal(cam.near, 1)
  // distance + 45: with a 23.6° sun every metre of far plane sweeps ~2.3 m of extra ground into
  // the shadow pass, and 130 m of it cost ~50 draw calls at the crossroads for off-screen casters.
  assert.equal(cam.far, 135)
})

test('setDirection rebuilds the light-space basis', () => {
  const { follow } = make()
  const before = follow.toLight.clone()
  follow.setDirection(new THREE.Vector3(2, 0.95, 0.85))
  assert.ok(Math.abs(follow.direction.length() - 1) < 1e-9, 'direction is normalised')
  assert.ok(!follow.toLight.equals(before), 'the basis changed with the direction')
  // Light space must still put "towards the sun" straight down its own +z.
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(follow.toWorld)
  assert.ok(back.distanceTo(follow.direction) < 1e-6, `expected ${follow.direction.toArray()}, got ${back.toArray()}`)
})

test('the sun sits 90 m from the target along (1, 2, 1)', () => {
  const { sun, follow } = make()
  follow.aim(new THREE.Vector3(10, 0.6, -20), 1)
  const d = sun.position.clone().sub(sun.target.position)
  assert.ok(Math.abs(d.length() - 90) < 1e-6)
  assert.ok(d.normalize().distanceTo(new THREE.Vector3(1, 2, 1).normalize()) < 1e-6)
})

test('the target follows the focus, offset north onto the visible ground, to within one texel', () => {
  const { sun, follow } = make()
  const focus = new THREE.Vector3(33.3, 0.6, -71.9)
  follow.aim(focus, 1)
  assert.equal(follow.ahead, AHEAD)
  const wanted = focus.clone()
  wanted.z -= AHEAD
  assert.ok(sun.target.position.distanceTo(wanted) <= follow.texel * Math.SQRT2 + 1e-9,
    `target ${sun.target.position.toArray()} should track ${wanted.toArray()}`)
  // And it must be genuinely north of the car, not on it.
  assert.ok(sun.target.position.z < focus.z - AHEAD / 2, 'the frustum should lead the car up-screen')
  assert.ok(Math.abs(follow.texel - (2 * (PER_ZOOM + BASE)) / 2048) < 1e-9, `texel ${follow.texel}`)
})

test('sub-texel moves do not move the shadow raster (no shimmer); multi-texel moves do', () => {
  const { sun, follow } = make()
  // Only the target's position on the light's raster plane (light-space x/y) decides which texel a
  // fragment samples: the shadow camera is orthographic, so sliding it along the light direction
  // changes depth alone. Snapping is therefore asserted on those two axes, not on world distance.
  // Compare the rasterised TARGET across successive aims at slightly different focus points. Reading
  // the raster of the focus itself would be wrong now that aim() offsets the frustum north of it.
  const raster = (v) => v.clone().applyQuaternion(follow.toLight)
  const focus = new THREE.Vector3(5, 0.6, 5)
  const t = follow.texel
  follow.aim(focus, 1)
  const before = raster(sun.target.position)
  follow.aim(focus.clone().add(new THREE.Vector3(t * 0.2, 0, 0)), 1)
  const small = raster(sun.target.position)
  assert.ok(Math.abs(small.x - before.x) < 1e-9, `a 0.2-texel move must be absorbed (x moved ${Math.abs(small.x - before.x)})`)
  assert.ok(Math.abs(small.y - before.y) < 1e-9, `a 0.2-texel move must be absorbed (y moved ${Math.abs(small.y - before.y)})`)
  follow.aim(focus.clone().add(new THREE.Vector3(t * 3, 0, 0)), 1)
  const big = raster(sun.target.position)
  assert.ok(Math.hypot(big.x - before.x, big.y - before.y) > t, 'a 3-texel move must register')
})
