import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { fakeWorld } from './fixture.mjs'
import { buildPlaneMesh } from '../../src/world/props/PlaneModel.js'
import { PLANE } from '../../src/world/PlanePhysics.js'
import { BlobShadows } from '../../src/world/Shadows.js'

test('the plane model spans the wing along X and the fuselage along Z with the nose at −Z', () => {
  const { group, propHub } = buildPlaneMesh()
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())
  assert.ok(size.x >= 8.4 && size.x <= 8.8, `wingspan ${size.x}`)
  assert.ok(size.z >= 6.0 && size.z <= 7.2, `length ${size.z}`)
  assert.ok(size.y >= 2.5 && size.y <= 2.8, `height ${size.y}`)
  assert.ok(propHub.position.z < -2.5, 'the propeller is at the nose end')
  assert.ok(Math.abs(box.min.y + 1.05) < 0.02, `tyres rest on the ground: min y ${box.min.y}`)
})

test('the plane in the world keeps the collider box and draws in at most 10 calls', () => {
  const { world } = fakeWorld()
  const meshes = []
  world.plane.group.traverse((o) => { if (o.isMesh) meshes.push(o) })
  assert.ok(meshes.length <= 12, `${meshes.length} meshes`)
  assert.equal(world.plane.body.shapes[0].halfExtents.z, 3.2)
})

test('the builder returns the shell, the prop, the disc and the lamps, and the shell holds every part', () => {
  const m = buildPlaneMesh()
  assert.ok(m.shell.parent === m.group, 'shell is a child of the root')
  assert.equal(m.group.children.length, 1, 'the root holds only the shell')
  assert.ok(m.propHub.parent === m.shell && m.propDisc.parent === m.shell && m.lamps.parent === m.shell)
  assert.equal(m.propDisc.visible, false, 'the disc starts hidden')
  assert.ok(Math.abs(m.propDisc.position.z + 2.95) < 1e-9)
})

test('above 8 m/s the blade prop hides and the disc shows; the shell banks 20% more than the body', () => {
  const { world } = fakeWorld()
  const plane = world.plane
  plane.physics.speed = 5
  plane.update(1 / 60, { throttle: 0, steer: 0, boost: false, brake: false })
  assert.equal(plane.propHub.visible, true)
  assert.equal(plane.propDisc.visible, false)
  plane.physics.speed = 20
  plane.physics.airborne = true
  plane.physics.bank = 0.5
  plane.physics.pitch = 0.3
  plane.update(1 / 60, { throttle: 1, steer: 0, boost: false, brake: false })
  assert.equal(plane.propHub.visible, false)
  assert.equal(plane.propDisc.visible, true)
  assert.ok(Math.abs(plane.shell.rotation.z - plane.physics.bank * 0.2) < 1e-9, `shell bank ${plane.shell.rotation.z}`)
  assert.ok(plane.physics.vy > 1, `climbing (vy ${plane.physics.vy})`)
  assert.ok(Math.abs(plane.shell.rotation.x - 0.15) < 1e-9, `shell pitch ${plane.shell.rotation.x}`)
  assert.equal(PLANE.ceiling, 34)
})

test('the altitude shadow cue keeps the plane disc large as it climbs instead of shrinking it', () => {
  const shadows = new BlobShadows(new THREE.Scene(), { max: 4 })
  const generic = { position: new THREE.Vector3(0, 0, 0) }
  const cued = { position: new THREE.Vector3(5, 0, 0) }
  shadows.add(generic, { rx: 2, rz: 2 })
  shadows.add(cued, { rx: 2, rz: 2, altitudeCue: true })
  const scaleOf = (i) => { const m = new THREE.Matrix4(); shadows.mesh.getMatrixAt(i, m); return new THREE.Vector3().setFromMatrixScale(m).x }
  shadows.update()
  assert.ok(Math.abs(scaleOf(0) - 2) < 1e-9 && Math.abs(scaleOf(1) - 2) < 1e-9, 'both full size on the ground')
  generic.position.y = 20
  cued.position.y = 20
  shadows.update()
  assert.ok(Math.abs(scaleOf(0) - 2 * 0.66) < 1e-6, `generic shrinks to 0.66: ${scaleOf(0)}`)
  assert.ok(scaleOf(1) > 1.7 && scaleOf(1) < 2, `cued stays large: ${scaleOf(1)}`)
  cued.position.y = 34
  shadows.update()
  assert.ok(scaleOf(1) > 1.5, `still readable at the ceiling: ${scaleOf(1)}`)
})
