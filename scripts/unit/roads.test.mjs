import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { fakeWorld } from './fixture.mjs'
import { planarUv, ROAD_RECTS } from '../../src/world/Roads.js'
import { worldToUv } from '../../src/world/Textures.js'

test('ROAD_RECTS lists the eleven tarmac pieces', () => {
  assert.equal(ROAD_RECTS.length, 11)
  assert.equal(ROAD_RECTS.filter((r) => r.disc).length, 2)
  assert.ok(ROAD_RECTS.some((r) => r.name === 'education apron' && r.cx === 0 && r.cz === -98))
})

test('planarUv rewrites uv from world x/z over the floor rectangle', () => {
  const rect = { x0: -150, x1: 150, z0: -170, z1: 115 }
  const g = new THREE.PlaneGeometry(10, 10)
  g.rotateX(-Math.PI / 2)
  g.translate(-145, 0.01, 110) // south-west corner piece: x −150..−140, z 105..115
  planarUv(g, rect)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = worldToUv(pos.getX(i), pos.getZ(i), rect)
    assert.ok(Math.abs(uv.getX(i) - u) < 1e-6 && Math.abs(uv.getY(i) - v) < 1e-6)
    assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1)
  }
  const sw = [...Array(pos.count).keys()].find((i) => pos.getX(i) < -149 && pos.getZ(i) > 114)
  assert.ok(Math.abs(uv.getX(sw)) < 1e-6 && Math.abs(uv.getY(sw)) < 1e-6, 'south-west corner is uv (0,0)')
})

test('the tarmac shares the wear map and grain with the floor and never casts', () => {
  const { world, scene } = fakeWorld()
  const roads = scene.getObjectByName('roads')
  const markings = scene.getObjectByName('road-markings')
  assert.ok(roads && markings)
  const m = roads.material
  assert.equal(m.color.getHexString(), 'ffffff')
  assert.equal(m.aoMap, world.wearMap)
  assert.ok(m.map && m.map.userData.metres === 12)
  assert.ok(Math.abs(m.map.repeat.x - 300 / 12) < 1e-9)
  assert.deepEqual([roads.castShadow, roads.receiveShadow], [false, true])
  assert.deepEqual([markings.castShadow, markings.receiveShadow], [false, true])
  const uv = roads.geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1)
})
