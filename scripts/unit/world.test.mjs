import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { fakeWorld } from './fixture.mjs'
import { flat } from '../../src/world/Materials.js'

test('the floor is white under a sand grain map with the wear map as aoMap, receive-only', () => {
  const { world } = fakeWorld()
  assert.deepEqual(world.floorRect, { x0: -150, x1: 150, z0: -170, z1: 115 })
  const m = world.floor.material
  assert.ok(m.isMeshStandardMaterial)
  assert.equal(m.color.getHexString(), 'ffffff')
  assert.ok(m.map && m.map.isDataTexture)
  assert.ok(Math.abs(m.map.repeat.x - 300 / 24) < 1e-9)
  assert.ok(Math.abs(m.map.repeat.y - 285 / 24) < 1e-9)
  assert.equal(m.aoMap, world.wearMap)
  assert.equal(m.roughness, 1)
  assert.deepEqual([world.floor.castShadow, world.floor.receiveShadow], [false, true])
})

test('the hill ring casts and receives', () => {
  const { scene } = fakeWorld()
  const hills = scene.getObjectByName('hills')
  assert.ok(hills, 'hill ring present')
  assert.deepEqual([hills.castShadow, hills.receiveShadow], [true, true])
})

test('addStatic flags meshes by material; cast:false makes ground pieces receive-only', () => {
  const { world } = fakeWorld()
  const g = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(), flat('#81B29A'))
  const label = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
  g.add(box, label)
  world.addStatic(g, { reveal: false })
  assert.deepEqual([box.castShadow, box.receiveShadow], [true, true])
  assert.deepEqual([label.castShadow, label.receiveShadow], [false, false])
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(), flat('#CDB07E'))
  world.addStatic(slab, { reveal: false, cast: false })
  assert.deepEqual([slab.castShadow, slab.receiveShadow], [false, true])
})

test('addDynamic flags the mesh', () => {
  const { world } = fakeWorld()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), flat('#E07A5F'))
  const body = world.physics.box({ size: [1, 1, 1], mass: 1, position: [0, 3, 0] })
  world.addDynamic(mesh, body, { tag: 'crate' })
  assert.deepEqual([mesh.castShadow, mesh.receiveShadow], [true, true])
})

test('update() aims the sun at the camera focus with the current zoom', () => {
  const { world, aims } = fakeWorld()
  world.update(1 / 60, 0)
  assert.equal(aims.length, 1)
  assert.equal(aims[0].zoom, world.camera.zoom)
  assert.ok(aims[0].focus.distanceTo(world.camera.smoothTarget) < 1e-9)
})

test('blob shadows are faint on desktop and stronger on the low tier', () => {
  assert.equal(fakeWorld().world.shadows.strength, 0.16)
  assert.equal(fakeWorld({ quality: 'low' }).world.shadows.strength, 0.3)
})
