import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { hexBytes, valueNoise, fbm, grain, sandGrain, tarmacGrain, fitGrain, worldToUv, wearMap, skyGradient, environmentScene } from '../../src/world/Textures.js'

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

test('worldToUv maps the rectangle corners: south-west → (0,0), north-east → (1,1)', () => {
  const rect = { x0: -150, x1: 150, z0: -170, z1: 115 }
  assert.deepEqual(worldToUv(-150, 115, rect), [0, 0])
  assert.deepEqual(worldToUv(150, -170, rect), [1, 1])
  const [u, v] = worldToUv(0, -27.5, rect)
  assert.ok(Math.abs(u - 0.5) < 1e-9 && Math.abs(v - 0.5) < 1e-9)
})

test('wearMap darkens inside a rect, feathers outside it, and is a linear aoMap on uv channel 0', () => {
  const rect = { x0: -150, x1: 150, z0: -170, z1: 115 }
  const size = 512
  const tex = wearMap(rect, { size, rects: [{ cx: 0, cz: -98, w: 30, d: 20 }], blotch: 0 })
  assert.equal(tex.colorSpace, THREE.NoColorSpace)
  assert.equal(tex.channel, 0)
  assert.equal(tex.wrapS, THREE.ClampToEdgeWrapping)
  const d = tex.image.data
  const at = (x, z) => {
    const [u, v] = worldToUv(x, z, rect)
    const px = Math.min(size - 1, Math.floor(u * size))
    const py = Math.min(size - 1, Math.floor(v * size))
    return d[(py * size + px) * 4]
  }
  const inside = at(0, -98)
  const far = at(100, 60)
  const edge = at(0, -98 - 10 - 1.5) // 1.5 m outside the north edge, inside the 3 m feather
  assert.equal(far, 255, 'with blotch 0, untouched sand is exactly 1.0')
  assert.ok(far - inside >= 17 && far - inside <= 19, `apron darkening ${far - inside} bytes (expected 0.07·255 ≈ 18)`)
  assert.ok(edge > inside && edge < far, `feather ${edge} should sit between ${inside} and ${far}`)
  for (let i = 0; i < d.length; i += 4) assert.ok(d[i] >= 204 && d[i] <= 255)
})

test('wearMap blotching stays within ±4 %', () => {
  const tex = wearMap({ x0: -10, x1: 10, z0: -10, z1: 10 }, { size: 64, rects: [] })
  const d = tex.image.data
  let min = 255
  let max = 0
  for (let i = 0; i < d.length; i += 4) { min = Math.min(min, d[i]); max = Math.max(max, d[i]) }
  assert.ok(min >= Math.round(0.96 * 255) - 1, `min ${min}`)
  assert.ok(max <= 255, `max ${max}`)
  assert.ok(max - min > 2, 'there is some variation')
})

test('skyGradient is a 1×64 sRGB strip: haze from the bottom up to the horizon, then to the sky colour', () => {
  const tex = skyGradient({ bottom: '#F7EFDD', top: '#C9D6E3', horizon: 0.55 })
  assert.equal(tex.image.width, 1)
  assert.equal(tex.image.height, 64)
  assert.equal(tex.colorSpace, THREE.SRGBColorSpace)
  const d = tex.image.data
  assert.deepEqual([d[0], d[1], d[2]], [247, 239, 221], 'row 0 = bottom')
  const mid = Math.floor(0.5 * 63) * 4
  assert.deepEqual([d[mid], d[mid + 1], d[mid + 2]], [247, 239, 221], 'still haze below the horizon')
  const last = 63 * 4
  assert.deepEqual([d[last], d[last + 1], d[last + 2]], [201, 214, 227], 'top row = sky')
})

test('environmentScene has a back-side vertex-coloured dome and an HDR sun disc along sunDir', () => {
  const dir = new THREE.Vector3(1, 2, 1).normalize()
  const scene = environmentScene({ sunDir: dir })
  const meshes = scene.children.filter((o) => o.isMesh)
  assert.equal(meshes.length, 2)
  const dome = meshes.find((m) => m.material.side === THREE.BackSide)
  const sun = meshes.find((m) => m !== dome)
  assert.ok(dome.material.vertexColors)
  assert.ok(dome.geometry.attributes.color, 'dome carries per-vertex colours')
  assert.ok(sun.material.color.r > 1, 'sun is brighter than white')
  assert.ok(sun.position.clone().normalize().distanceTo(dir) < 1e-6)
})
