import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { hexBytes, valueNoise, fbm, grain, regolithGrain, basaltGrain, fitGrain, worldToUv, wearMap, craterDecal, skyGradient, environmentScene } from '../../src/world/Textures.js'
import { palette } from '../../src/world/Materials.js'

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

test('regolithGrain and basaltGrain are shared singletons with a metres-per-tile hint', () => {
  assert.equal(regolithGrain(), regolithGrain())
  assert.equal(regolithGrain().userData.metres, 24)
  assert.equal(basaltGrain().userData.metres, 12)
  assert.notEqual(regolithGrain(), basaltGrain())
})

test('grain dots stamp 2×2 pebbles of dotColor at the requested density', () => {
  const size = 64
  const tex = grain({ size, seed: 3, a: '#800000', b: '#800000', speckle: 0, dots: 0.01, dotColor: '#00FF00' })
  const d = tex.image.data
  let green = 0
  for (let i = 0; i < size * size; i++) if (d[i * 4 + 1] === 255 && d[i * 4] === 0) green++
  // round(64²·0.01) = 41 dots × up to 4 texels, minus overlaps and edge clipping
  assert.ok(green >= 41 && green <= 164, `green texels ${green}`)
})

test('grain streak modulates along v without changing the mean much', () => {
  const plain = grain({ size: 64, seed: 5, speckle: 0 }).image.data
  const streaked = grain({ size: 64, seed: 5, speckle: 0, streak: 0.08 }).image.data
  let diff = 0
  for (let i = 0; i < plain.length; i += 4) diff += Math.abs(plain[i] - streaked[i])
  assert.ok(diff > 0, 'streak changes the texture')
  assert.ok(diff / (plain.length / 4) < 12, 'but only subtly')
})

test('fitGrain sets repeat from the surface size and the tile size', () => {
  const tex = fitGrain(regolithGrain(), 300, 285)
  assert.ok(Math.abs(tex.repeat.x - 300 / 24) < 1e-9)
  assert.ok(Math.abs(tex.repeat.y - 285 / 24) < 1e-9)
})

test('fitGrain returns a per-surface view: the shared singleton is never retiled', () => {
  const shared = regolithGrain()
  const before = shared.repeat.clone()
  const a = fitGrain(shared, 300, 285)
  const b = fitGrain(shared, 48, 44)
  assert.notEqual(a, shared, 'the caller gets its own texture object')
  assert.notEqual(a, b, 'each surface gets its own')
  assert.ok(shared.repeat.equals(before), 'the singleton keeps its own repeat')
  assert.ok(Math.abs(a.repeat.x - 300 / 24) < 1e-9 && Math.abs(a.repeat.y - 285 / 24) < 1e-9)
  assert.ok(Math.abs(b.repeat.x - 48 / 24) < 1e-9 && Math.abs(b.repeat.y - 44 / 24) < 1e-9)
  assert.equal(a.image, shared.image, 'the pixel data is shared, not copied')
  assert.equal(a.userData.metres, 24)
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

test('wearMap discs cut a bowl that is darkest at the centre and fades to the rim', () => {
  const rect = { x0: -50, x1: 50, z0: -50, z1: 50 }
  const tex = wearMap(rect, { size: 100, blotch: 0, discs: [{ cx: 0, cz: 0, r: 10, amount: 0.12 }] })
  const d = tex.image.data
  const at = (x, z) => { const px = Math.floor((x - rect.x0) / 100 * 100); const py = Math.floor((rect.z1 - z) / 100 * 100); return d[(py * 100 + px) * 4] }
  assert.ok(at(0, 0) < at(6, 0), 'centre darker than mid-bowl')
  assert.ok(at(6, 0) < at(9.5, 0), 'mid-bowl darker than the rim')
  assert.equal(at(30, 0), 255, 'untouched ground is exactly 1.0')
  assert.ok(at(0, 0) >= Math.round(0.78 * 255), 'clamped at 0.78')
})

test('craterDecal is a transparent 256² RGBA with a dark bowl and a light rim', () => {
  const tex = craterDecal()
  assert.equal(tex.image.width, 256)
  const d = tex.image.data
  const px = (x, y) => Array.from(d.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4))
  const centre = px(128, 128)
  const rim = px(128 + Math.round(0.82 * 128), 128)
  const outside = px(255, 128)
  assert.deepEqual(centre.slice(0, 3), hexBytes(palette.regolithDark))
  assert.ok(centre[3] > 60 && centre[3] <= 90, `centre alpha ${centre[3]}`)
  assert.deepEqual(rim.slice(0, 3), hexBytes(palette.regolithLight))
  assert.ok(rim[3] > 0)
  assert.equal(outside[3], 0)
})

test('the sky and the environment dome are Mars-coloured', () => {
  const sky = skyGradient()
  const d = sky.image.data
  assert.deepEqual(Array.from(d.slice(0, 3)), hexBytes(palette.skyBottom))
  assert.deepEqual(Array.from(d.slice(d.length - 4, d.length - 1)), hexBytes(palette.skyTop))
  const env = environmentScene()
  assert.equal(env.children.length, 2)
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
