import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { ShadowFollow } from '../../src/core/ShadowFollow.js'

function make() {
  const sun = new THREE.DirectionalLight()
  sun.shadow.mapSize.set(2048, 2048)
  return { sun, follow: new ShadowFollow(sun) }
}

test('frustum half-size is 26·zoom + 14 and the camera is symmetric', () => {
  const { sun, follow } = make()
  follow.aim(new THREE.Vector3(0, 0, 0), 1)
  const cam = sun.shadow.camera
  assert.equal(cam.right, 40)
  assert.equal(cam.left, -40)
  assert.equal(cam.top, 40)
  assert.equal(cam.bottom, -40)
  follow.aim(new THREE.Vector3(0, 0, 0), 1.9)
  assert.ok(Math.abs(cam.right - (26 * 1.9 + 14)) < 1e-9)
  assert.equal(cam.near, 1)
  assert.equal(cam.far, 220)
})

test('the sun sits 90 m from the target along (1, 2, 1)', () => {
  const { sun, follow } = make()
  follow.aim(new THREE.Vector3(10, 0.6, -20), 1)
  const d = sun.position.clone().sub(sun.target.position)
  assert.ok(Math.abs(d.length() - 90) < 1e-6)
  assert.ok(d.normalize().distanceTo(new THREE.Vector3(1, 2, 1).normalize()) < 1e-6)
})

test('the target follows the focus to within one texel', () => {
  const { sun, follow } = make()
  const focus = new THREE.Vector3(33.3, 0.6, -71.9)
  follow.aim(focus, 1)
  assert.ok(sun.target.position.distanceTo(focus) <= follow.texel * Math.SQRT2 + 1e-9)
  assert.ok(Math.abs(follow.texel - 80 / 2048) < 1e-9)
})

test('sub-texel moves do not move the shadow raster (no shimmer); multi-texel moves do', () => {
  const { sun, follow } = make()
  // Only the target's position on the light's raster plane (light-space x/y) decides which texel a
  // fragment samples: the shadow camera is orthographic, so sliding it along the light direction
  // changes depth alone. Snapping is therefore asserted on those two axes, not on world distance.
  const raster = (v) => v.clone().applyQuaternion(follow.toLight)
  follow.aim(new THREE.Vector3(5, 0.6, 5), 1)
  const base = sun.target.position.clone()
  const before = raster(base)
  const t = follow.texel
  follow.aim(base.clone().add(new THREE.Vector3(t * 0.2, 0, 0)), 1)
  const small = raster(sun.target.position)
  assert.ok(Math.abs(small.x - before.x) < 1e-9, `a 0.2-texel move must be absorbed (x moved ${Math.abs(small.x - before.x)})`)
  assert.ok(Math.abs(small.y - before.y) < 1e-9, `a 0.2-texel move must be absorbed (y moved ${Math.abs(small.y - before.y)})`)
  follow.aim(base.clone().add(new THREE.Vector3(t * 3, 0, 0)), 1)
  const big = raster(sun.target.position)
  assert.ok(Math.hypot(big.x - before.x, big.y - before.y) > t, 'a 3-texel move must register')
})
