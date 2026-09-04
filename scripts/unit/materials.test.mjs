import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import * as M from '../../src/world/Materials.js'

const { flat, applyShadowFlags, shadowed, decal, lampMaterial } = M

test('flat() returns a shared standard material with flat shading and the default roughness', () => {
  const a = flat('#E07A5F')
  assert.ok(a.isMeshStandardMaterial)
  assert.equal(a.flatShading, true)
  assert.equal(a.roughness, 0.85)
  assert.equal(a.metalness, 0)
  assert.equal(a.envMapIntensity, M.ENV_INTENSITY)
  assert.equal(flat('#E07A5F'), a, 'same colour and options → same instance')
})

test('roughness, map and aoMap are part of the cache key', () => {
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1)
  const plain = flat('#3D5A80')
  const glossy = flat('#3D5A80', { roughness: 0.2 })
  const mapped = flat('#3D5A80', { map: tex, aoMap: tex, aoMapIntensity: 0.8 })
  assert.notEqual(plain, glossy)
  assert.equal(glossy.roughness, 0.2)
  assert.notEqual(plain, mapped)
  assert.equal(mapped.map, tex)
  assert.equal(mapped.aoMap, tex)
  assert.equal(mapped.aoMapIntensity, 0.8)
  assert.equal(flat('#3D5A80', { map: tex, aoMap: tex, aoMapIntensity: 0.8 }), mapped)
})

test('emissive, transparency, side and vertex colours carry over', () => {
  const m = flat('#FFD166', { emissive: '#FFD166', emissiveIntensity: 0.9, transparent: true, opacity: 0.6, side: THREE.DoubleSide, vertexColors: true })
  assert.equal(m.transparent, true)
  assert.equal(m.opacity, 0.6)
  assert.equal(m.side, THREE.DoubleSide)
  assert.equal(m.vertexColors, true)
  assert.equal(m.emissiveIntensity, 0.9)
  assert.equal(m.emissive.getHexString(), 'ffd166')
  assert.ok(lampMaterial().isMeshStandardMaterial)
})

test('the toon gradient is gone; decals stay unlit', () => {
  assert.equal(M.toonGradient, undefined)
  assert.ok(decal('#FFF8EA').isMeshBasicMaterial)
})

test('applyShadowFlags: opaque casts and receives, labels neither, glazing receives only', () => {
  const g = new THREE.Group()
  const opaque = new THREE.Mesh(new THREE.BoxGeometry(), flat('#81B29A'))
  const label = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
  const glass = new THREE.Mesh(new THREE.BoxGeometry(), flat('#A8DADC', { transparent: true, opacity: 0.6 }))
  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(), flat('#2B2D42'), 3)
  const inner = new THREE.Group()
  inner.add(crowd)
  g.add(opaque, label, glass, inner)
  assert.equal(applyShadowFlags(g), g)
  assert.deepEqual([opaque.castShadow, opaque.receiveShadow], [true, true])
  assert.deepEqual([label.castShadow, label.receiveShadow], [false, false])
  assert.deepEqual([glass.castShadow, glass.receiveShadow], [false, true])
  assert.deepEqual([crowd.castShadow, crowd.receiveShadow], [true, true], 'nested instanced meshes are flagged too')
})

test('unlit materials neither cast nor receive: they are decals, labels and printed faces', () => {
  const g = new THREE.Group()
  const printedFace = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ toneMapped: false }))
  const litPanel = new THREE.Mesh(new THREE.BoxGeometry(), flat('#FFF8EA'))
  g.add(printedFace, litPanel)
  applyShadowFlags(g)
  assert.deepEqual([printedFace.castShadow, printedFace.receiveShadow], [false, false], 'an opaque unlit panel is a printed face, not a caster')
  assert.deepEqual([litPanel.castShadow, litPanel.receiveShadow], [true, true])
})

test('applyShadowFlags with cast:false makes flat ground pieces receive only', () => {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(), flat('#CDB07E'))
  applyShadowFlags(road, { cast: false })
  assert.deepEqual([road.castShadow, road.receiveShadow], [false, true])
})

test('shadowed() sets both flags and returns the mesh', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), flat('#2B2D42'))
  assert.equal(shadowed(mesh), mesh)
  assert.deepEqual([mesh.castShadow, mesh.receiveShadow], [true, true])
})
