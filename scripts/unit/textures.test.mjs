import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { hexBytes, valueNoise, fbm, grain, sandGrain, tarmacGrain, fitGrain } from '../../src/world/Textures.js'

test('hexBytes parses palette colours', () => {
  assert.deepEqual(hexBytes('#E9D4A6'), [233, 212, 166])
  assert.deepEqual(hexBytes('#000000'), [0, 0, 0])
})

test('valueNoise is deterministic and in 0..1', () => {
  const a = valueNoise(32, 4, 7)
  const b = valueNoise(32, 4, 7)
  assert.deepEqual(Array.from(a), Array.from(b))
  for (const v of a) assert.ok(v >= 0 && v <= 1)
  assert.notDeepEqual(Array.from(valueNoise(32, 4, 8)), Array.from(a), 'a different seed gives different noise')
})

test('valueNoise tiles: the wrap step is no bigger than the largest interior step', () => {
  const size = 64
  const n = valueNoise(size, 8, 3)
  let maxInterior = 0
  let maxWrap = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size - 1; x++) maxInterior = Math.max(maxInterior, Math.abs(n[y * size + x + 1] - n[y * size + x]))
    maxWrap = Math.max(maxWrap, Math.abs(n[y * size] - n[y * size + size - 1]))
  }
  assert.ok(maxWrap <= maxInterior + 1e-6, `wrap step ${maxWrap} exceeds interior ${maxInterior}`)
})

test('fbm stays in 0..1 with a mid-grey mean', () => {
  const n = fbm(64, { octaves: 3, baseCells: 4, seed: 2 })
  let sum = 0
  for (const v of n) { assert.ok(v >= 0 && v <= 1); sum += v }
  const mean = sum / n.length
  assert.ok(mean > 0.35 && mean < 0.65, `mean ${mean}`)
})

test('grain is a repeating sRGB RGBA texture whose pixels sit between its two colours', () => {
  const tex = grain({ size: 64, seed: 1, a: '#E9D4A6', b: '#DCC08F' })
  assert.ok(tex.isDataTexture)
  assert.equal(tex.image.width, 64)
  assert.equal(tex.image.height, 64)
  assert.equal(tex.wrapS, THREE.RepeatWrapping)
  assert.equal(tex.wrapT, THREE.RepeatWrapping)
  assert.equal(tex.colorSpace, THREE.SRGBColorSpace)
  assert.equal(tex.anisotropy, 8)
  const d = tex.image.data
  assert.equal(d.length, 64 * 64 * 4)
  for (let i = 0; i < d.length; i += 4) {
    assert.ok(d[i] >= 220 - 1 && d[i] <= 233 + 1, `r ${d[i]}`)
    assert.ok(d[i + 1] >= 192 - 1 && d[i + 1] <= 212 + 1, `g ${d[i + 1]}`)
    assert.ok(d[i + 2] >= 143 - 1 && d[i + 2] <= 166 + 1, `b ${d[i + 2]}`)
    assert.equal(d[i + 3], 255)
  }
})

test('sandGrain and tarmacGrain are shared singletons with a metres-per-tile hint', () => {
  assert.equal(sandGrain(), sandGrain())
  assert.equal(sandGrain().userData.metres, 24)
  assert.equal(tarmacGrain(), tarmacGrain())
  assert.equal(tarmacGrain().userData.metres, 12)
  assert.notEqual(sandGrain(), tarmacGrain())
})

test('fitGrain sets repeat from the surface size and the tile size', () => {
  const tex = fitGrain(sandGrain(), 300, 285)
  assert.ok(Math.abs(tex.repeat.x - 300 / 24) < 1e-9)
  assert.ok(Math.abs(tex.repeat.y - 285 / 24) < 1e-9)
})
