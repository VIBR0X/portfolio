# Scene Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat toon look with real-time lit materials, a following shadow map, generated sand and tarmac textures, a sky gradient and a half-resolution ambient-occlusion pass, tiered so phones get the same art direction with cheaper settings.

**Architecture:** All textures are generated as `DataTexture`s in a new `src/world/Textures.js` (no canvas, no image files, runs under Node). `Materials.flat()` keeps its signature but returns a `MeshStandardMaterial`, so the ~170 prop call sites do not change; shadow flags are applied by a traversal in `World.addStatic/addDynamic`. A new pure `src/core/ShadowFollow.js` keeps the sun's shadow frustum centred on the camera focus with texel snapping. `Experience.js` owns lights, the PMREM environment, the composer (`RenderPass → GTAOPass at half res → OutputPass`) and a two-step auto-quality sampler (drop AO, then drop resolution).

**Tech Stack:** Vite 8, three 0.185 (MeshStandardMaterial, PMREMGenerator, DirectionalLight shadows, EffectComposer/GTAOPass/OutputPass from `three/examples/jsm`), cannon-es, Node 22 `node:test` for unit tests, playwright-core + headless Chrome for e2e.

**Spec:** `docs/superpowers/specs/2026-09-04-scene-finish-design.md`. Branch: `scene-finish` (already created from `main`).

**Conventions used below**
- Run everything from `/home/vedant/kriv/portfolio`.
- Unit tests: `node --test scripts/unit/*.test.mjs` (Node 22 built-in runner, no dependency).
- Node harness gates (no browser): `node scripts/smoke-sections.mjs && node scripts/check-rest.mjs && node scripts/check-boards-clear.mjs && node scripts/check-boards.mjs`.
- Browser gates need a dev server on port 5179: `npx vite --port 5179 --strictPort &` (leave it running; it hot-reloads).
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Existing code style: ES modules, 2-space indent, no semicolons, single quotes, `/** */` doc comments on exports.

---

## File map

| File | Responsibility after this plan |
| --- | --- |
| `src/world/Textures.js` (new) | Deterministic noise; `grain()`/`sandGrain()`/`tarmacGrain()`/`fitGrain()`; `wearMap()`; `worldToUv()`; `skyGradient()`; `environmentScene()` |
| `src/world/Materials.js` | `flat()` → standard material (+ `roughness`, `map`, `aoMap`, `aoMapIntensity` options); `applyShadowFlags()`; real `shadowed()`; `toonGradient()` removed |
| `src/world/Shadows.js` | `strength` option on `BlobShadows` |
| `src/core/ShadowFollow.js` (new) | Sun target/position/frustum from focus + zoom, texel snapping |
| `src/world/World.js` | Textured floor, `floorRect`, `wearMap`, shadow flags in add helpers, hills flags, blob strength by tier, `shadowFollow.aim` per frame |
| `src/world/Roads.js` | `ROAD_RECTS` export, `planarUv()`, textured tarmac sharing the wear map, no casting |
| `src/world/Car.js`, `Board.js`, `Area.js`, `sections/Education.js` | Roughness overrides, shadow flags, pad ring receives |
| `src/core/Experience.js` | Lights, environment, shadow settings, composer/AO, `effects` flag, two-step sampler, `rendered` event, `readPixel()` |
| `src/ui/DebugHud.js` | Frame time and effects readout |
| `scripts/unit/fixture.mjs` + `scripts/unit/*.test.mjs` (new) | Node unit tests |
| `scripts/e2e.mjs` | `--no-effects` flag, effects state in output |
| `scripts/e2e-finish.mjs` (new) | Pixel checks in headless Chrome |
| `README.md`, `docs/superpowers/specs/2026-09-03-portfolio-design.md`, `package.json` | Docs and `test:unit` script |

---

### Task 1: Textures.js — deterministic noise and tiling grain

**Files:**
- Create: `src/world/Textures.js`
- Create: `scripts/unit/textures.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `scripts/unit/textures.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/unit/textures.test.mjs`
Expected: FAIL — `Cannot find module '.../src/world/Textures.js'`.

- [ ] **Step 3: Create Textures.js with noise and grain**

Create `src/world/Textures.js`:

```js
import * as THREE from 'three'
import { palette } from './Materials.js'

/**
 * Every texture in the scene is generated here as a DataTexture from plain typed arrays.
 * No canvas, no image files: this module runs unchanged under the Node smoke harness.
 */

/** Deterministic LCG in [0, 1) (same recurrence as the hill ring in World.js). */
export function rng(seed = 1) {
  let s = seed % 233280
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

/** '#RRGGBB' → [r, g, b] bytes. Lerps are done on sRGB bytes on purpose: the colour textures are sRGB. */
export function hexBytes(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const smooth = (t) => t * t * (3 - 2 * t)

/** Tileable value noise: `size`×`size` samples of a `cells`×`cells` random lattice, bilinear with smoothstep. */
export function valueNoise(size, cells, seed) {
  const r = rng(seed)
  const lattice = new Float32Array(cells * cells)
  for (let i = 0; i < lattice.length; i++) lattice[i] = r()
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells
    const y0 = Math.floor(fy)
    const y1 = (y0 + 1) % cells
    const ty = smooth(fy - y0)
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells
      const x0 = Math.floor(fx)
      const x1 = (x0 + 1) % cells
      const tx = smooth(fx - x0)
      const top = lattice[y0 * cells + x0] + (lattice[y0 * cells + x1] - lattice[y0 * cells + x0]) * tx
      const bot = lattice[y1 * cells + x0] + (lattice[y1 * cells + x1] - lattice[y1 * cells + x0]) * tx
      out[y * size + x] = top + (bot - top) * ty
    }
  }
  return out
}

/** Fractal sum of value-noise octaves, normalised to 0..1 (still tileable). */
export function fbm(size, { octaves = 3, baseCells = 8, seed = 1 } = {}) {
  const out = new Float32Array(size * size)
  let amp = 1
  let total = 0
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, baseCells * 2 ** o, seed + o * 17)
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp
    total += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

function rgbaTexture(data, width, height, { srgb = true, repeat = false, anisotropy = 1 } = {}) {
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = anisotropy
  tex.needsUpdate = true
  return tex
}

/**
 * Tiling grain between two colours: fbm for the body, a sparse speckle on top.
 * The caller sets `repeat` (see fitGrain) so one tile spans `userData.metres` in the world.
 */
export function grain({ size = 1024, seed = 3, a = palette.dune, b = '#DCC08F', baseCells = 6, octaves = 3, speckle = 0.03, speckleStrength = 0.25 } = {}) {
  const n = fbm(size, { octaves, baseCells, seed })
  const r = rng(seed + 99)
  const ca = hexBytes(a)
  const cb = hexBytes(b)
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    let t = n[i]
    const s = r()
    if (s > 1 - speckle) t += speckleStrength
    else if (s < speckle) t -= speckleStrength
    t = Math.min(1, Math.max(0, t))
    data[i * 4] = Math.round(ca[0] + (cb[0] - ca[0]) * t)
    data[i * 4 + 1] = Math.round(ca[1] + (cb[1] - ca[1]) * t)
    data[i * 4 + 2] = Math.round(ca[2] + (cb[2] - ca[2]) * t)
    data[i * 4 + 3] = 255
  }
  return rgbaTexture(data, size, size, { repeat: true, anisotropy: 8 })
}

let sand = null
/** Shared sand grain, one tile per 24 m. */
export function sandGrain() {
  if (!sand) {
    sand = grain()
    sand.userData.metres = 24
  }
  return sand
}

let tarmac = null
/** Shared tarmac grain: finer, darker, one tile per 12 m. */
export function tarmacGrain() {
  if (!tarmac) {
    tarmac = grain({ size: 512, seed: 11, a: palette.tarmac, b: '#C2A470', baseCells: 12, octaves: 2, speckle: 0.015, speckleStrength: 0.2 })
    tarmac.userData.metres = 12
  }
  return tarmac
}

/** Set a grain texture's repeat so one tile spans `texture.userData.metres` on a w×d surface. */
export function fitGrain(texture, w, d) {
  const m = texture.userData.metres || 24
  texture.repeat.set(w / m, d / m)
  return texture
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/unit/textures.test.mjs`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/world/Textures.js scripts/unit/textures.test.mjs
git commit -m "Add generated noise and tiling grain textures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Textures.js — world-mapped wear map and UV helper

**Files:**
- Modify: `src/world/Textures.js`
- Modify: `scripts/unit/textures.test.mjs`

- [ ] **Step 1: Add the failing tests**

Append to `scripts/unit/textures.test.mjs` (and add `worldToUv, wearMap` to the import list at the top):

```js
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
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test scripts/unit/textures.test.mjs`
Expected: 3 failures, `worldToUv is not a function` / `wearMap is not a function`.

- [ ] **Step 3: Implement worldToUv and wearMap**

Append to `src/world/Textures.js`:

```js
/**
 * World rectangle ↔ UV. `rect` = { x0, x1, z0, z1 }. Matches a PlaneGeometry rotated -90° about X:
 * u runs west→east, v runs south→north (v = 1 at the north edge, z = z0).
 */
export function worldToUv(x, z, rect) {
  return [(x - rect.x0) / (rect.x1 - rect.x0), (rect.z1 - z) / (rect.z1 - rect.z0)]
}

/**
 * Single-use "wear" map covering `rect` once, meant for `aoMap` (linear, uv channel 0):
 * ±`blotch`/2 low-frequency variation, plus `amount` darkening inside each of `rects`
 * ({ cx, cz, w, d, amount? }) feathered to nothing over `feather` metres outside the rectangle.
 * Values are clamped to 0.80..1.0.
 */
export function wearMap(rect, { size = 512, seed = 5, rects = [], feather = 3, amount = 0.07, blotch = 0.08 } = {}) {
  const n = fbm(size, { octaves: 2, baseCells: 4, seed })
  const W = rect.x1 - rect.x0
  const D = rect.z1 - rect.z0
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    const wz = rect.z1 - ((y + 0.5) / size) * D
    for (let x = 0; x < size; x++) {
      const wx = rect.x0 + ((x + 0.5) / size) * W
      const i = y * size + x
      let v = 1 - (n[i] - 0.5) * blotch
      for (const r of rects) {
        const dx = Math.max(0, Math.abs(wx - r.cx) - r.w / 2)
        const dz = Math.max(0, Math.abs(wz - r.cz) - r.d / 2)
        const dist = Math.hypot(dx, dz)
        if (dist >= feather) continue
        v -= (r.amount ?? amount) * (1 - smooth(dist / feather))
      }
      const b = Math.round(Math.min(1, Math.max(0.8, v)) * 255)
      data[i * 4] = b
      data[i * 4 + 1] = b
      data[i * 4 + 2] = b
      data[i * 4 + 3] = 255
    }
  }
  const tex = rgbaTexture(data, size, size, { srgb: false })
  tex.channel = 0
  return tex
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/unit/textures.test.mjs`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/world/Textures.js scripts/unit/textures.test.mjs
git commit -m "Add world-mapped wear map and UV helper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Textures.js — sky gradient and environment scene

**Files:**
- Modify: `src/world/Textures.js`
- Modify: `scripts/unit/textures.test.mjs`

- [ ] **Step 1: Add the failing tests**

Append to `scripts/unit/textures.test.mjs` (add `skyGradient, environmentScene` to the import):

```js
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
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test scripts/unit/textures.test.mjs`
Expected: 2 failures, `skyGradient is not a function`.

- [ ] **Step 3: Implement skyGradient and environmentScene**

Append to `src/world/Textures.js`:

```js
/**
 * 1×`size` vertical strip for `scene.background` (three stretches it across the screen).
 * Flat `bottom` colour up to `horizon` (fraction of screen height), then eases to `top`.
 * The visible sky is only the top band above the fogged floor edge, so the flat part hides behind the ground.
 */
export function skyGradient({ bottom = palette.haze, top = '#C9D6E3', horizon = 0.55, size = 64 } = {}) {
  const cb = hexBytes(bottom)
  const ct = hexBytes(top)
  const data = new Uint8Array(size * 4)
  for (let i = 0; i < size; i++) {
    const f = i / (size - 1)
    const t = smooth(Math.min(1, Math.max(0, (f - horizon) / (1 - horizon))))
    data[i * 4] = Math.round(cb[0] + (ct[0] - cb[0]) * t)
    data[i * 4 + 1] = Math.round(cb[1] + (ct[1] - cb[1]) * t)
    data[i * 4 + 2] = Math.round(cb[2] + (ct[2] - cb[2]) * t)
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, 1, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

/**
 * Tiny scene for PMREMGenerator.fromScene(): a colour-graded dome (sand bounce below the horizon,
 * haze at it, pale blue above) plus an HDR sun disc along `sunDir`. Dispose it after prefiltering.
 */
export function environmentScene({ sunDir = new THREE.Vector3(1, 2, 1).normalize(), radius = 40 } = {}) {
  const scene = new THREE.Scene()
  const geo = new THREE.SphereGeometry(radius, 24, 16)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const below = new THREE.Color(palette.dune)
  const horizon = new THREE.Color(palette.haze)
  const above = new THREE.Color('#B7C9DC')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / radius
    if (t < 0) c.lerpColors(below, horizon, smooth(t + 1))
    else c.lerpColors(horizon, above, smooth(t))
    c.toArray(colors, i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }))
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.7, 4.2) }))
  sun.position.copy(sunDir).multiplyScalar(radius * 0.75)
  scene.add(dome, sun)
  return scene
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/unit/textures.test.mjs`
Expected: `# pass 12`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/world/Textures.js scripts/unit/textures.test.mjs
git commit -m "Add sky gradient strip and environment dome scene

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Materials.js — lit materials and shadow flags

**Files:**
- Modify: `src/world/Materials.js` (replace lines 50–99: `toonGradient`, `flat`, `shadowed`)
- Create: `scripts/unit/materials.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `scripts/unit/materials.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/unit/materials.test.mjs`
Expected: failures on `isMeshStandardMaterial`, `M.toonGradient` defined, `applyShadowFlags is not a function`.

- [ ] **Step 3: Replace the toon factory with the standard one**

In `src/world/Materials.js`, delete everything from the comment `/* Three-step toon gradient: ... */` through the end of the `shadowed` function (lines 50–99 of the current file: `toonGradient`, `cache`, `flat`, `lampMaterial`, `decal`, `shadowed`) and put this in its place. `vary()` at the bottom stays as it is.

```js
/** Environment-map contribution for every lit material (Experience sets scene.environment). */
export const ENV_INTENSITY = 0.4

const cache = new Map()

/**
 * Lit material shared per colour/options. Standard PBR with flat shading: facets still read as
 * facets, but the surface now takes sun, sky, environment and shadows.
 * Options: emissive, emissiveIntensity, transparent, opacity, side, vertexColors,
 *          roughness (default 0.85), map, aoMap, aoMapIntensity.
 */
export function flat(color, opts = {}) {
  const key = [
    color, opts.emissive || '', opts.emissiveIntensity ?? '', opts.transparent ? 1 : 0, opts.opacity ?? 1,
    opts.side ?? '', opts.vertexColors ? 1 : 0, opts.roughness ?? '', opts.map?.uuid || '', opts.aoMap?.uuid || '', opts.aoMapIntensity ?? '',
  ].join('|')
  if (cache.has(key)) return cache.get(key)
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.85,
    metalness: 0,
    envMapIntensity: ENV_INTENSITY,
    flatShading: true,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color('#000000'),
    emissiveIntensity: opts.emissiveIntensity ?? 0.6,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
    map: opts.map || null,
    aoMap: opts.aoMap || null,
    aoMapIntensity: opts.aoMapIntensity ?? 1,
  })
  cache.set(key, mat)
  return mat
}

/** Shared emissive "lamp" material for beacons, lights, trophies. */
export function lampMaterial() {
  return flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.6 })
}

/** Unlit material for decals lying on the floor (roads, arrows, pads). */
export function decal(color, { opacity = 1 } = {}) {
  const key = `decal|${color}|${opacity}`
  if (cache.has(key)) return cache.get(key)
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity < 1, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, toneMapped: false })
  cache.set(key, mat)
  return mat
}

/**
 * Shadow flags for every mesh under `root`, decided by material:
 *  - transparent with no depth write (labels, floor decals, blob discs): neither cast nor receive;
 *  - other transparent (glazing, pad fills): receive only;
 *  - opaque: cast and receive, unless `cast` is false (flat ground pieces such as roads and markings).
 */
export function applyShadowFlags(root, { cast = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const m = o.material
    if (m.transparent && m.depthWrite === false) { o.castShadow = false; o.receiveShadow = false; return }
    if (m.transparent) { o.castShadow = false; o.receiveShadow = true; return }
    o.castShadow = cast
    o.receiveShadow = true
  })
  return root
}

/** Mark one mesh as a shadow caster and receiver (kept for the props that call it explicitly). */
export function shadowed(mesh) {
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
```

Also update the file's header comment above `palette` if it mentions toon shading; the palette object itself is untouched.

- [ ] **Step 4: Run the unit tests and the Node harness**

Run: `node --test scripts/unit/*.test.mjs`
Expected: all pass (`# fail 0`).

Run: `node scripts/smoke-sections.mjs`
Expected: JSON report ending in `"errors": []`, exit code 0 (`echo $?` → `0`). The material swap must not break any section.

- [ ] **Step 5: Commit**

```bash
git add src/world/Materials.js scripts/unit/materials.test.mjs
git commit -m "Switch the shared material factory to lit standard materials and add shadow flag helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Shadows.js — blob strength option

**Files:**
- Modify: `src/world/Shadows.js:9-16`
- Create: `scripts/unit/shadows.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/unit/shadows.test.mjs`:

```js
import '../dom-stub.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { BlobShadows } from '../../src/world/Shadows.js'

test('BlobShadows takes a strength (peak alpha) and defaults to the old 0.34', () => {
  assert.equal(new BlobShadows(new THREE.Scene()).strength, 0.34)
  const faint = new BlobShadows(new THREE.Scene(), { max: 10, strength: 0.16 })
  assert.equal(faint.strength, 0.16)
  assert.equal(faint.max, 10)
  assert.equal(faint.mesh.castShadow, false)
  assert.equal(faint.mesh.receiveShadow, false)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/unit/shadows.test.mjs`
Expected: FAIL — `strength` is `undefined`.

- [ ] **Step 3: Thread strength through the gradient**

In `src/world/Shadows.js` change the constructor head and gradient (current lines 9–16):

```js
  constructor(scene, { max = 200, strength = 0.34 } = {}) {
    this.strength = strength
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64)
    g.addColorStop(0, `rgba(107,78,46,${strength})`)
    g.addColorStop(0.55, `rgba(107,78,46,${+(strength * 0.53).toFixed(3)})`)
    g.addColorStop(1, 'rgba(107,78,46,0)')
```

Update the class doc comment to: `Cheap contact shadow under moving bodies; the real shadow map does the rest. Fades as the object rises.`

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/unit/shadows.test.mjs`
Expected: `# pass 1`.

- [ ] **Step 5: Commit**

```bash
git add src/world/Shadows.js scripts/unit/shadows.test.mjs
git commit -m "Make blob shadow strength configurable

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: ShadowFollow.js — sun frustum that follows the camera

**Files:**
- Create: `src/core/ShadowFollow.js`
- Create: `scripts/unit/shadow-follow.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `scripts/unit/shadow-follow.test.mjs`:

```js
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

test('sub-texel moves do not move the target (no shimmer); multi-texel moves do', () => {
  const { sun, follow } = make()
  follow.aim(new THREE.Vector3(5, 0.6, 5), 1)
  const snapped = sun.target.position.clone()
  const texel = follow.texel
  follow.aim(snapped.clone().add(new THREE.Vector3(texel * 0.2, 0, 0)), 1)
  assert.ok(sun.target.position.distanceTo(snapped) < 1e-9, 'a 0.2-texel move must be absorbed')
  follow.aim(snapped.clone().add(new THREE.Vector3(texel * 3, 0, 0)), 1)
  assert.ok(sun.target.position.distanceTo(snapped) > texel, 'a 3-texel move must register')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/unit/shadow-follow.test.mjs`
Expected: FAIL — `Cannot find module '.../src/core/ShadowFollow.js'`.

- [ ] **Step 3: Implement ShadowFollow**

Create `src/core/ShadowFollow.js`:

```js
import * as THREE from 'three'

/**
 * Keeps a directional light's shadow frustum centred on the camera focus.
 * The frustum grows with zoom so the visible ground is always covered, and the target is snapped
 * to the shadow texel grid in light space so panning does not make shadow edges shimmer.
 * Pure three.js maths: no renderer needed, so it runs (and is tested) in Node.
 */
export class ShadowFollow {
  constructor(sun, { direction = new THREE.Vector3(1, 2, 1), distance = 90, base = 14, perZoom = 26 } = {}) {
    this.sun = sun
    this.direction = direction.clone().normalize()
    this.distance = distance
    this.base = base
    this.perZoom = perZoom
    this.half = 0
    // Same basis three builds for the shadow camera: looking from the light toward the target, up = +y.
    const m = new THREE.Matrix4().lookAt(this.direction, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0))
    this.toWorld = new THREE.Quaternion().setFromRotationMatrix(m)
    this.toLight = this.toWorld.clone().invert()
    this._p = new THREE.Vector3()
    this.setExtent(this.extentFor(1))
  }

  extentFor(zoom) {
    return this.perZoom * zoom + this.base
  }

  setExtent(half) {
    this.half = half
    const cam = this.sun.shadow.camera
    cam.left = -half
    cam.right = half
    cam.top = half
    cam.bottom = -half
    cam.near = 1
    cam.far = this.distance + 130
    cam.updateProjectionMatrix()
  }

  /** World-space size of one shadow texel across the current frustum. */
  get texel() {
    return (2 * this.half) / this.sun.shadow.mapSize.x
  }

  /** Centre the frustum on `focus` for the given camera zoom. Call once per frame. */
  aim(focus, zoom = 1) {
    const half = this.extentFor(zoom)
    if (Math.abs(half - this.half) > 0.5) this.setExtent(half)
    const t = this.texel
    this._p.copy(focus).applyQuaternion(this.toLight)
    this._p.x = Math.round(this._p.x / t) * t
    this._p.y = Math.round(this._p.y / t) * t
    this._p.applyQuaternion(this.toWorld)
    this.sun.target.position.copy(this._p)
    this.sun.position.copy(this._p).addScaledVector(this.direction, this.distance)
    this.sun.target.updateMatrixWorld()
    this.sun.updateMatrixWorld()
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/unit/shadow-follow.test.mjs`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/core/ShadowFollow.js scripts/unit/shadow-follow.test.mjs
git commit -m "Add ShadowFollow: sun frustum that tracks the camera focus with texel snapping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: World.js — textured floor, wear map, shadow flags, sun follow

**Files:**
- Modify: `src/world/Roads.js` (export `ROAD_RECTS`, build strips from it)
- Modify: `src/world/World.js` (imports, constructor, `setFloor`, `setBoundary`, `addStatic`, `addDynamic`, `update`)
- Create: `scripts/unit/fixture.mjs`
- Create: `scripts/unit/world.test.mjs`

- [ ] **Step 1: Create the shared test fixture**

Create `scripts/unit/fixture.mjs`:

```js
import '../dom-stub.mjs'
import * as THREE from 'three'
import { World } from '../../src/world/World.js'
import { Controls } from '../../src/core/Controls.js'
import { Sounds } from '../../src/core/Sounds.js'

/**
 * A World with no sections, a recording fake experience and a no-op UI.
 * Same shape as the fake in scripts/smoke-sections.mjs, plus a fake shadowFollow that records aim() calls.
 */
export function fakeWorld({ quality = 'high' } = {}) {
  const scene = new THREE.Scene()
  const aims = []
  const experience = {
    scene,
    camera: new THREE.PerspectiveCamera(40, 16 / 9, 1, 260),
    canvas: { addEventListener() {}, focus() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) },
    isTouch: false, isSmall: false, quality, sizes: { width: 1280, height: 720, pixelRatio: 1 },
    on() { return () => {} }, emit() {},
    renderer: { info: { render: { calls: 0 } } },
    shadowFollow: { aim(focus, zoom) { aims.push({ focus: focus.clone(), zoom }) } },
  }
  const ui = new Proxy({ anyOpen: false, panelOpen: false, isTouch: false, el: {} }, { get(t, k) { return k in t ? t[k] : () => {} } })
  const world = new World({ experience, controls: new Controls({ isTouch: false }), sounds: new Sounds(), ui, strict: true })
  return { world, scene, experience, aims }
}
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/unit/world.test.mjs`:

```js
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
  const hills = scene.children.find((o) => o.isInstancedMesh && o.count >= 50)
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test scripts/unit/world.test.mjs`
Expected: failures — `floorRect` undefined, floor colour is `e9d4a6`, no `aoMap`, `aims.length` is 0, strength is 0.34.

- [ ] **Step 4: Export the tarmac footprint from Roads.js**

In `src/world/Roads.js`, add the export above `buildRoads` and replace the eleven `strips.push(...)` lines (currently lines 27–37) with a loop:

```js
/**
 * Tarmac footprint in metres. `disc` entries are roundabouts (w = d = diameter); the rest are rectangles.
 * Shared with the wear map so traffic darkening lines up with the tarmac.
 */
export const ROAD_RECTS = [
  { cx: 0, cz: -40, w: 14, d: 144, name: 'runway' },
  { cx: 0, cz: -30, w: 196, d: 12, name: 'north avenue' },
  { cx: 39, cz: 30, w: 90, d: 10, name: 'south avenue' },
  { cx: -58, cz: -40, w: 52, d: 12, name: 'experience apron' },
  { cx: 0, cz: -68, w: 40, d: 46, name: 'skills yard' },
  { cx: 0, cz: -98, w: 30, d: 20, name: 'education apron' },
  { cx: 0, cz: 46, w: 34, d: 22, name: 'contact apron' },
  { cx: 52, cz: 40, w: 48, d: 44, name: 'playground apron' },
  { cx: 86, cz: 54, w: 24, d: 6, name: 'landing strip' },
  { cx: 0, cz: -30, w: 16, d: 16, disc: true, name: 'north roundabout' },
  { cx: 0, cz: 30, w: 12, d: 12, disc: true, name: 'south roundabout' },
]
```

and inside `buildRoads`, replace the block from `// Runway N–S, avenues, aprons` through `strips.push(disc(0, 30, 6))` with:

```js
  // Runway, avenues, aprons and roundabouts, all from the shared footprint
  for (const r of ROAD_RECTS) strips.push(r.disc ? disc(r.cx, r.cz, r.w / 2) : rect(r.cx, r.cz, r.w, r.d))
```

- [ ] **Step 5: Update World.js**

In `src/world/World.js`:

Imports (replace the `Materials` and `Roads` import lines and add Textures):

```js
import { flat, palette, vary, applyShadowFlags } from './Materials.js'
import { buildRoads, ROAD_RECTS } from './Roads.js'
import { sandGrain, fitGrain, wearMap } from './Textures.js'
```

Constructor: change the blob shadow line to

```js
    this.shadows = new BlobShadows(this.scene, { max: 220, strength: experience.quality === 'low' ? 0.3 : 0.16 })
```

Replace `setFloor()` entirely:

```js
  setFloor() {
    const { x0, x1, z0, z1 } = this.extents
    const w = x1 - x0 + 80
    const d = z1 - z0 + 80
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    // The floor rectangle is the UV space shared by the sand, the tarmac and the wear map.
    this.floorRect = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }
    this.wearMap = wearMap(this.floorRect, { rects: ROAD_RECTS })
    // White base: a standard material multiplies colour by map, and the grain already carries the dune colour.
    const material = flat('#FFFFFF', { map: fitGrain(sandGrain(), w, d), aoMap: this.wearMap, roughness: 1 })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(cx, 0, cz)
    floor.name = 'floor'
    floor.receiveShadow = true
    this.scene.add(floor)
    this.floor = floor
  }
```

In `setBoundary()`, after `hills.frustumCulled = false` add:

```js
    hills.castShadow = true
    hills.receiveShadow = true
```

Replace `addStatic` and the first lines of `addDynamic`:

```js
  addStatic(object, { delay = 0, reveal = true, cast = true } = {}) {
    applyShadowFlags(object, { cast })
    this.scene.add(object)
    if (reveal) this.reveal.registerByDistance(object, { delay })
    return object
  }

  addDynamic(mesh, body, { delay = 0, impact = true, minImpact = 1.5, tag = 'default', shadow = true, shadowRadius = null } = {}) {
    applyShadowFlags(mesh)
    this.scene.add(mesh)
```

In `update()`, directly after `this.camera.update(dt, car.group.position, car.physics.velocity)` add:

```js
    // Keep the sun's shadow frustum on the visible ground (no-op under the Node harnesses).
    this.experience.shadowFollow?.aim(this.camera.smoothTarget, this.camera.zoom)
```

Update the Section API comment block at the top: `world.addStatic(object3D, { delay, reveal, cast })`.

- [ ] **Step 6: Run the unit tests and the Node harness**

Run: `node --test scripts/unit/*.test.mjs`
Expected: `# fail 0`.

Run: `node scripts/smoke-sections.mjs && node scripts/check-rest.mjs && node scripts/check-boards-clear.mjs && node scripts/check-boards.mjs`
Expected: each prints its JSON report and exits 0. If `check-boards-clear` reports a new blocker, nothing in this task moved geometry — investigate before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/world/World.js src/world/Roads.js scripts/unit/fixture.mjs scripts/unit/world.test.mjs
git commit -m "Textured floor with shared wear map, shadow flags on world objects, sun follows the camera

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Roads.js — planar UVs and textured tarmac

**Files:**
- Modify: `src/world/Roads.js`
- Create: `scripts/unit/roads.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `scripts/unit/roads.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/unit/roads.test.mjs`
Expected: `planarUv is not a function`; tarmac colour is `cdb07e`; `castShadow` true.

- [ ] **Step 3: Implement planarUv and the textured tarmac**

In `src/world/Roads.js`, add the import and the helper, and change the tarmac and markings construction:

```js
import { tarmacGrain, fitGrain, worldToUv } from './Textures.js'
```

Above `buildRoads`:

```js
/** Rewrite `uv` so the geometry maps the floor rectangle once (u west→east, v south→north). */
export function planarUv(geometry, rect) {
  const pos = geometry.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = worldToUv(pos.getX(i), pos.getZ(i), rect)
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geometry
}
```

Replace the two lines that build and add the tarmac mesh:

```js
  const { floorRect } = world
  const tarmacGeo = planarUv(mergeGeometries(strips), floorRect)
  const grainTex = fitGrain(tarmacGrain(), floorRect.x1 - floorRect.x0, floorRect.z1 - floorRect.z0)
  const tarmac = new THREE.Mesh(tarmacGeo, flat('#FFFFFF', { map: grainTex, aoMap: world.wearMap, roughness: 1 }))
  tarmac.name = 'roads'
  world.addStatic(tarmac, { reveal: false, cast: false })
```

and the markings line:

```js
  world.addStatic(markings, { reveal: false, cast: false })
```

Update the file's doc comment: `Everything is visual only (no physics), merged into a handful of draw calls, and shares the floor's wear map through world-planar UVs.`

- [ ] **Step 4: Run the tests and the Node harness**

Run: `node --test scripts/unit/*.test.mjs`
Expected: `# fail 0`.

Run: `node scripts/smoke-sections.mjs`
Expected: exit 0, `"errors": []`.

- [ ] **Step 5: Commit**

```bash
git add src/world/Roads.js scripts/unit/roads.test.mjs
git commit -m "Give the tarmac world-planar UVs, its own grain and the shared wear map

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Car, Board, Area, Education — roughness overrides and shadow flags

**Files:**
- Modify: `src/world/Car.js:4,28,38,96`
- Modify: `src/world/Board.js:44`
- Modify: `src/world/Area.js:62`
- Modify: `src/world/sections/Education.js:39`
- Create: `scripts/unit/props.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `scripts/unit/props.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeWorld } from './fixture.mjs'
import { board } from '../../src/world/Board.js'

test('the car has glossier paint and every part casts and receives', () => {
  const { world } = fakeWorld()
  const car = world.car
  assert.equal(car.body.material.roughness, 0.55)
  assert.deepEqual([car.body.castShadow, car.body.receiveShadow], [true, true])
  let meshes = 0
  car.group.traverse((o) => { if (o.isMesh) { meshes++; assert.ok(o.castShadow && o.receiveShadow, `${o.name || 'car part'} flagged`) } })
  assert.ok(meshes >= 8)
  for (const wheel of car.wheels) wheel.traverse((o) => { if (o.isMesh) assert.ok(o.castShadow && o.receiveShadow, 'wheel part flagged') })
})

test('board panels are satin (roughness 0.9) and cast; the face stays unlit', () => {
  const { world } = fakeWorld()
  const { group, face } = board(world, { x: 0, z: 0, title: 'T', body: ['b'] })
  const panel = []
  group.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && o !== face && o.geometry.type !== 'CylinderGeometry') panel.push(o) })
  assert.equal(panel.length, 1)
  assert.equal(panel[0].material.roughness, 0.9)
  assert.deepEqual([panel[0].castShadow, panel[0].receiveShadow], [true, true])
  assert.ok(face.material.isMeshBasicMaterial, 'the face stays an unlit canvas so its colours are exact')
})

test('pad rings receive shadows', () => {
  const { world } = fakeWorld()
  const area = world.addArea({ x: 0, z: 0, label: 'PAD' })
  assert.equal(area.ring.receiveShadow, true)
  assert.equal(area.keyCap.castShadow, true)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/unit/props.test.mjs`
Expected: car roughness is 0.85; car parts not flagged; panel roughness 0.85; ring `receiveShadow` false.

- [ ] **Step 3: Apply the overrides and flags**

`src/world/Car.js`:
- line 4: `import { flat, palette, shadowed, applyShadowFlags } from './Materials.js'`
- line 28 (body): `const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, l, 3, 0.14), flat(this.color, { roughness: 0.55 })))`
- line 38 (roof): `const roof = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w * 0.7, 0.08, l * 0.36, 2, 0.03), flat(this.color, { roughness: 0.55 })))`
- at the end of `_build()`, after the wheels loop:

```js
    applyShadowFlags(this.group)
    for (const wheel of this.wheels) applyShadowFlags(wheel)
```

`src/world/Board.js` line 44: `const panel = new THREE.Mesh(new RoundedBoxGeometry(width + 0.4, height + 0.4, 0.25, 2, 0.06), flat(palette.cream, { roughness: 0.9 }))`

`src/world/Area.js` line 62: `this.ring.receiveShadow = true` (was `false`).

`src/world/sections/Education.js` line 39: `flat(palette.glass, { transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 0.2 }),`

- [ ] **Step 4: Run the tests and the Node harness**

Run: `node --test scripts/unit/*.test.mjs`
Expected: `# fail 0`.

Run: `node scripts/smoke-sections.mjs`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/world/Car.js src/world/Board.js src/world/Area.js src/world/sections/Education.js scripts/unit/props.test.mjs
git commit -m "Roughness overrides for car paint, board panels and tower glazing; pad rings receive shadows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Experience.js — lights, environment, shadows, composer, tiers

This task is browser-only; its verification is the headless e2e run plus screenshots. Write the whole file, then check in Chrome.

**Files:**
- Modify: `src/core/Experience.js` (full replacement)

- [ ] **Step 1: Make sure the dev server is up**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5179/`
Expected: `200`. If not: `npx vite --port 5179 --strictPort > /tmp/vite.log 2>&1 &` and re-check after a second.

- [ ] **Step 2: Record the baseline**

Run: `node scripts/e2e.mjs --out /tmp/shots-before`
Expected: `errors: none`, `fps: 60` per section (this is the pre-change baseline to compare against).

- [ ] **Step 3: Replace Experience.js**

Overwrite `src/core/Experience.js` with:

```js
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { EventEmitter } from './EventEmitter.js'
import { ShadowFollow } from './ShadowFollow.js'
import { palette } from '../world/Materials.js'
import { skyGradient, environmentScene } from '../world/Textures.js'

/**
 * Light budget. three divides light intensities by π in the shader, so a white surface facing the sun
 * receives ≈ sun·0.82/π + hemi/π + env. Tuned so lit sand ≈ its own albedo (no clipping, no tone
 * mapping) and shadowed sand ≈ 60–70 % of that. Tuning knobs live here and in Materials.ENV_INTENSITY.
 */
export const LIGHTING = { sun: 1.2, hemi: 1.0, sunColor: '#FFF4E0', skyColor: '#FFF3DC', groundColor: '#D9B27A', direction: [1, 2, 1] }
export const SHADOW = { high: { size: 2048, soft: true }, low: { size: 1024, soft: false }, bias: -0.0004, normalBias: 0.03 }
export const AO = { radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1.5, samples: 16, blendIntensity: 0.9 }
/** Auto-quality: an average frame above `effectsMs` drops AO; above `lowMs` on the re-sample drops resolution. */
export const QUALITY = { delay: 2.5, window: 3, effectsMs: 18, lowMs: 22 }

/**
 * Owns the renderer, scene, camera, lights, environment, post-processing and the frame loop.
 * Emits 'update' (dt, elapsed) before rendering, 'rendered' after, 'resize' on viewport change,
 * 'effects' (bool) when the AO pass is toggled and 'quality' ('low') when resolution drops.
 */
export class Experience extends EventEmitter {
  constructor({ canvas }) {
    super()
    this.canvas = canvas
    this.isTouch = window.matchMedia('(pointer: coarse)').matches
    this.isSmall = window.innerWidth < 768
    this.quality = this.isTouch || this.isSmall ? 'low' : 'high'
    this.sizes = { width: window.innerWidth, height: window.innerHeight, pixelRatio: Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1.5 : 2) }

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false })
    this.renderer.setPixelRatio(this.sizes.pixelRatio)
    this.renderer.setSize(this.sizes.width, this.sizes.height)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = SHADOW[this.quality].soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    this.renderer.setClearColor(new THREE.Color(palette.haze))

    this.scene = new THREE.Scene()
    this.scene.background = skyGradient()
    const low = this.quality === 'low'
    this.scene.fog = new THREE.Fog(palette.haze, low ? 70 : 90, low ? 130 : 170)

    this.camera = new THREE.PerspectiveCamera(40, this.sizes.width / this.sizes.height, 1, 260)
    this.camera.position.set(0, 26, 28)
    this.camera.lookAt(0, 0, 0)
    this.scene.add(this.camera)

    this.setLights()
    this.setEnvironment()
    this.effects = false
    this.composer = null
    this.ao = null
    this.setComposer()

    this.timer = new THREE.Timer()
    this.elapsed = 0
    this.running = false
    this.lowQuality = false
    this._sample = null
    this._frame = this._frame.bind(this)

    window.addEventListener('resize', () => this.resize())
    document.addEventListener('visibilitychange', () => {
      // Timer clamps the next delta after a hidden tab; nothing else needed.
      if (!document.hidden && this.running) this.timer.reset()
    })
  }

  setLights() {
    this.hemi = new THREE.HemisphereLight(LIGHTING.skyColor, LIGHTING.groundColor, LIGHTING.hemi)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(LIGHTING.sunColor, LIGHTING.sun)
    this.sun.castShadow = true
    const s = SHADOW[this.quality]
    this.sun.shadow.mapSize.set(s.size, s.size)
    this.sun.shadow.bias = SHADOW.bias
    this.sun.shadow.normalBias = SHADOW.normalBias
    this.scene.add(this.sun, this.sun.target)
    this.shadowFollow = new ShadowFollow(this.sun, { direction: new THREE.Vector3(...LIGHTING.direction) })
    this.shadowFollow.aim(new THREE.Vector3(0, 0, 0), 1)
  }

  /** Soft sky/ground light from a generated dome, prefiltered once; the source scene is thrown away. */
  setEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const env = environmentScene({ sunDir: new THREE.Vector3(...LIGHTING.direction).normalize() })
    this.scene.environment = pmrem.fromScene(env, 0.04).texture
    pmrem.dispose()
    env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose() })
  }

  /** Multisampled composer: render → half-resolution GTAO → output (sRGB). Effects start on for every tier. */
  setComposer() {
    const { width, height, pixelRatio } = this.sizes
    const target = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(width, height)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    const ao = new GTAOPass(this.scene, this.camera, Math.ceil((width * pixelRatio) / 2), Math.ceil((height * pixelRatio) / 2))
    const setSize = ao.setSize.bind(ao)
    ao.setSize = (w, h) => setSize(Math.ceil(w / 2), Math.ceil(h / 2)) // AO buffers at half resolution, blended at full
    const render = ao.render.bind(ao)
    ao.render = (...args) => {
      // The AO pass re-renders the scene for normals and depth; keep the sky out of that buffer.
      const bg = this.scene.background
      this.scene.background = null
      render(...args)
      this.scene.background = bg
    }
    ao.updateGtaoMaterial({ radius: AO.radius, distanceExponent: AO.distanceExponent, thickness: AO.thickness, scale: AO.scale, samples: AO.samples })
    ao.blendIntensity = AO.blendIntensity
    this.composer.addPass(ao)
    this.composer.addPass(new OutputPass())
    this.ao = ao
    this.effects = true
  }

  /** Toggle the post-processing chain (AO). Off = plain renderer.render, as before this pass existed. */
  setEffects(on) {
    if (this.effects === on) return
    this.effects = on
    this.emit('effects', on)
  }

  resize() {
    this.sizes.width = window.innerWidth
    this.sizes.height = window.innerHeight
    this.isSmall = this.sizes.width < 768
    this.camera.aspect = this.sizes.width / this.sizes.height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.sizes.width, this.sizes.height)
    this.composer?.setSize(this.sizes.width, this.sizes.height)
    this.emit('resize', this.sizes)
  }

  /**
   * Auto-quality: after `delay` s, average frame time over `window` s.
   * Step 1: above `effectsMs` with AO on → AO off, sample again. Step 2: above `lowMs` → pixel ratio 1,
   * 1024 shadow map, nearer fog. Never re-raised (spec §11).
   */
  sampleQuality({ delay = QUALITY.delay, window = QUALITY.window, effectsMs = QUALITY.effectsMs, lowMs = QUALITY.lowMs } = {}) {
    this._sample = { delay, window, effectsMs, lowMs, t: 0, frames: 0, acc: 0, step: 0 }
  }

  setLowQuality() {
    if (this.lowQuality) return
    this.lowQuality = true
    this.sizes.pixelRatio = 1
    this.renderer.setPixelRatio(1)
    this.composer?.setPixelRatio(1)
    this.composer?.setSize(this.sizes.width, this.sizes.height)
    if (this.sun.shadow.mapSize.x > 1024) {
      this.sun.shadow.mapSize.set(1024, 1024)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
    this.scene.fog.near = 60
    this.scene.fog.far = 110
    this.emit('quality', 'low')
  }

  /** RGB bytes of the last frame at CSS pixel (x, y) from the top-left. Call from a 'rendered' listener. */
  readPixel(x, y) {
    const gl = this.renderer.getContext()
    const pr = this.renderer.getPixelRatio()
    const out = new Uint8Array(4)
    gl.readPixels(Math.round(x * pr), Math.round((this.sizes.height - y) * pr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
    return [out[0], out[1], out[2]]
  }

  start() {
    if (this.running) return
    this.running = true
    this.timer.reset()
    requestAnimationFrame(this._frame)
  }

  stop() {
    this.running = false
  }

  _frame() {
    if (!this.running) return
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), 1 / 20)
    this.elapsed += dt
    this.emit('update', dt, this.elapsed)
    if (this.effects && this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
    this.emit('rendered')
    if (this._sample) {
      const q = this._sample
      q.t += dt
      if (q.t > q.delay) {
        q.frames++
        q.acc += dt
        if (q.acc >= q.window) {
          const avgMs = (q.acc / q.frames) * 1000
          if (q.step === 0 && avgMs > q.effectsMs && this.effects) {
            this.setEffects(false)
            q.step = 1
            q.frames = 0
            q.acc = 0
          } else {
            if (avgMs > q.lowMs) this.setLowQuality()
            this._sample = null
          }
        }
      }
    }
    requestAnimationFrame(this._frame)
  }
}
```

- [ ] **Step 4: Run the e2e gate and look at the pictures**

Run: `node scripts/e2e.mjs --out /tmp/shots-after`
Expected: `errors: none`, `fps: 60` for every section, exit 0. Draw calls may rise slightly (the AO pass adds fixed full-screen passes, not scene draws).

Open `/tmp/shots-after/01-intro.png`, `03-experience.png`, `05-skills.png`, `06-education.png` and check, in this order:
1. Sand has visible grain and is no longer one flat colour; tarmac is darker and grainier; aprons read slightly worn.
2. Every prop has a soft shadow falling north-west (up-left on screen). Board posts have shadows that touch their bases (no gap = no peter-panning).
3. No moiré or striping on open sand (acne). If present: raise `SHADOW.normalBias` in 0.01 steps up to 0.06; if striping persists, make `SHADOW.bias` more negative in steps of 0.0002 down to -0.001.
4. Corners of hangars and the bases of tanks are darker than their surroundings (AO), but open sand shows no grey haze. If hazy: lower `AO.blendIntensity` to 0.7 or `AO.radius` to 0.45.
5. The top edge of the frame shows a faint blue-lilac band above the haze; no hard seam at the floor edge.
6. Board faces are still exact cream with crisp text.

If a step fails, adjust the named constant, save (Vite hot-reloads), re-run the e2e and re-check. Do not touch anything outside `LIGHTING`, `SHADOW`, `AO` and `Materials.ENV_INTENSITY`.

- [ ] **Step 5: Run the low tier and the stability suite**

Run: `node scripts/e2e.mjs --mobile --out /tmp/shots-mobile`
Expected: `errors: none`, 60 fps, screenshots show the same look at phone size.

Run: `node scripts/e2e-stability.mjs`
Expected: every result `true`/within bounds and `errors: none` as before this change.

- [ ] **Step 6: Commit**

```bash
git add src/core/Experience.js
git commit -m "Lit scene: sun with following shadow map, PMREM environment, sky gradient, half-res GTAO, two-step auto-quality

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Debug HUD, e2e flags and the pixel-check script

**Files:**
- Modify: `src/ui/DebugHud.js`
- Modify: `scripts/e2e.mjs`
- Create: `scripts/e2e-finish.mjs`
- Modify: `package.json` (add `test:unit`)

- [ ] **Step 1: Frame time and effects in the HUD**

Replace the body of the `if (acc >= 0.5)` block in `src/ui/DebugHud.js` so the first three entries read:

```js
      fps = Math.round(frames / acc)
      const ms = ((acc / frames) * 1000).toFixed(1)
      frames = 0
      acc = 0
      const r = experience.renderer.info.render
      const bodies = world.physics.world.bodies
      let awake = 0
      for (const b of bodies) if (b.sleepState !== 2 && b.mass > 0) awake++
      const p = world.car.physics
      el.textContent = [
        `${fps} fps · ${ms} ms`,
        `${experience.quality}${experience.lowQuality ? '→low' : ''} · AO ${experience.effects ? 'on' : 'off'}`,
        `${r.calls} calls`,
```

(the rest of the array stays as it is).

- [ ] **Step 2: `--no-effects` flag and effects state in e2e.mjs**

In `scripts/e2e.mjs`:
- line 2 usage comment: add `[--no-effects] [--mobile]`.
- after `const mobile = ...` add: `const noEffects = process.argv.includes('--no-effects')`
- after `await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })` add:

```js
if (noEffects) await page.evaluate(() => window.__world.experience.setEffects(false))
```

- in the `stats` evaluate, extend the returned object: `return { calls: info.calls, triangles: info.triangles, bodies: w.physics.world.bodies.length, effects: w.experience.effects, quality: w.experience.quality, sections: w.sections.map((s) => s.id) }`

- [ ] **Step 3: Write the pixel-check script**

Create `scripts/e2e-finish.mjs`:

```js
// Finish checks in headless Chrome: lit sand keeps its palette colour, the tower's shadow darkens sand
// to 50–80 %, a board face stays exact cream, and open sand shows no shadow acne.
// Needs `npx vite --port 5179` running. Usage: node scripts/e2e-finish.mjs [--url http://localhost:5179/] [--no-effects]
import { chromium } from 'playwright-core'
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def }
const url = arg('--url', 'http://localhost:5179/')
const noEffects = process.argv.includes('--no-effects')

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
if (noEffects) await page.evaluate(() => window.__world.experience.setEffects(false))
await page.click('#start-btn')
await page.waitForTimeout(3000)

/** Put the car at (carX, carZ), settle, then read the pixel under each world point (y ≈ ground) in the next frame. */
async function sample(carX, carZ, points) {
  return page.evaluate(async ([cx, cz, pts]) => {
    const w = window.__world
    w.car.teleport(cx, cz, 0)
    w.camera.snap(w.car.physics.position)
    w.ui.hideCard?.()
    w.ui.closePanel?.()
    await new Promise((r) => setTimeout(r, 1500))
    return new Promise((resolve) => {
      const off = w.experience.on('rendered', () => {
        off()
        const cam = w.experience.camera
        const V = cam.position.constructor
        const out = {}
        for (const [name, x, y, z] of pts) {
          const v = new V(x, y, z).project(cam)
          const sx = ((v.x + 1) / 2) * w.experience.sizes.width
          const sy = ((1 - v.y) / 2) * w.experience.sizes.height
          out[name] = { rgb: w.experience.readPixel(sx, sy), screen: [Math.round(sx), Math.round(sy)] }
        }
        resolve(out)
      })
    })
  }, [carX, carZ, points])
}

const bright = (rgb) => (rgb[0] + rgb[1] + rgb[2]) / 3
const results = []
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }

// 1. Lit open sand east of the runway, plus a 5×5 grid for the acne guard.
{
  const grid = []
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) grid.push([`g${i}_${j}`, 30 + i * 0.6, 0.02, 10 + j * 0.6])
  const s = await sample(22, 8, grid)
  const samples = Object.values(s).map((v) => v.rgb)
  // Mean of 25 samples, so the grain's speckle averages out; compared with the grain's own mean colour
  // (midway between Dune #E9D4A6 and #DCC08F). Lighting is budgeted to leave albedo ≈ unchanged.
  const mean = [0, 1, 2].map((k) => samples.reduce((acc, rgb) => acc + rgb[k], 0) / samples.length)
  const grainMean = [226, 202, 154]
  const dev = Math.max(...mean.map((c, k) => Math.abs(c - grainMean[k])))
  check('lit sand mean within ±16/channel of the grain colour', dev <= 16, `mean rgb ${mean.map((c) => c.toFixed(0)).join(',')} (max deviation ${dev.toFixed(1)})`)
  const b = samples.map(bright)
  const ratio = Math.min(...b) / Math.max(...b)
  check('no acne: darkest of 25 sand samples ≥ 82 % of brightest', ratio >= 0.82, `ratio ${ratio.toFixed(3)}`)
}

// 2. The control tower's shadow (cab and roof, falling north-west of the base at (0,−104)) versus lit sand
//    mirrored on the north-east side. Both points are 0.5 m off the runway edge, so any wear darkening cancels.
{
  const s = await sample(0, -88, [['shade', -7.5, 0.02, -111.5], ['lit', 7.5, 0.02, -111.5]])
  const r = bright(s.shade.rgb) / bright(s.lit.rgb)
  check('tower shadow darkens sand to 50–80 %', r >= 0.5 && r <= 0.8, `shade ${s.shade.rgb.join(',')} lit ${s.lit.rgb.join(',')} ratio ${r.toFixed(3)}`)
}

// 3. The IIT Bombay board face (board at x 0, z −99.4, bottom 1.1, height 2.6, tilted 30° back): lower-right plain area.
{
  const s = await sample(0, -88, [['cream', 2.0, 1.1 + 0.6 * Math.cos(Math.PI / 6) + 0.13 * Math.sin(Math.PI / 6), -99.4 - 0.6 * Math.sin(Math.PI / 6) + 0.13 * Math.cos(Math.PI / 6)]])
  const cream = [255, 248, 234]
  const dev = Math.max(...s.cream.rgb.map((c, k) => Math.abs(c - cream[k])))
  check('board face stays Cream within ±6', dev <= 6, `rgb ${s.cream.rgb.join(',')} at ${s.cream.screen.join(',')}`)
}

console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
process.exit(results.some((r) => !r.ok) || errors.length ? 1 : 0)
```

- [ ] **Step 4: Add the npm script**

In `package.json` add to `"scripts"`:

```json
    "test:unit": "node --test scripts/unit/*.test.mjs",
```

- [ ] **Step 5: Run the new checks**

Run: `npm run test:unit`
Expected: `# fail 0`.

Run: `node scripts/e2e-finish.mjs`
Expected: four `PASS` lines and `errors: none`, exit 0. If `lit sand mean` fails bright lower `LIGHTING.sun` by 0.1 steps; if it fails dark raise `LIGHTING.hemi` by 0.1 steps; if the shadow ratio is below 0.5 raise `LIGHTING.hemi` or `Materials.ENV_INTENSITY`; above 0.8 raise `LIGHTING.sun`. Re-run until all four pass, then re-run `node scripts/e2e.mjs` and re-check the screenshots from Task 10 step 4.

Run: `node scripts/e2e-finish.mjs --no-effects`
Expected: four `PASS` lines (the checks hold with AO off too).

Run: `node scripts/e2e.mjs --no-effects --out /tmp/shots-noao`
Expected: `errors: none`, 60 fps, `"effects":false` in the `after reveal` line.

- [ ] **Step 6: Commit**

```bash
git add src/ui/DebugHud.js scripts/e2e.mjs scripts/e2e-finish.mjs package.json
git commit -m "HUD frame time, e2e --no-effects flag, pixel checks for the lit scene, test:unit script

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Full gate run and zoom review

**Files:** none new; this task verifies and tunes only.

- [ ] **Step 1: Node gates**

Run: `npm run test:unit && node scripts/smoke-sections.mjs && node scripts/check-rest.mjs && node scripts/check-boards-clear.mjs && node scripts/check-boards.mjs`
Expected: every command exits 0.

- [ ] **Step 2: Browser gates**

Run: `node scripts/e2e.mjs --out /tmp/shots-final && node scripts/e2e.mjs --mobile --out /tmp/shots-final-mobile && node scripts/e2e.mjs --no-effects --out /tmp/shots-final-noao && node scripts/e2e-finish.mjs && node scripts/e2e-ui.mjs && node scripts/e2e-drive.mjs && node scripts/e2e-stability.mjs`
Expected: all exit 0, `errors: none` everywhere, 60 fps at every section on every tier.

- [ ] **Step 3: Max-zoom shadow coverage and shimmer**

Run this one-off in the browser via playwright to capture two frames at maximum zoom, 0.5 m apart:

```bash
node -e '
import("playwright-core").then(async ({ chromium }) => {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--headless=new","--use-gl=angle","--use-angle=default","--enable-gpu","--ignore-gpu-blocklist"] })
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  await p.goto("http://localhost:5179/", { waitUntil: "load" })
  await p.waitForSelector("#start-btn:not([disabled])")
  await p.click("#start-btn"); await p.waitForTimeout(3000)
  await p.evaluate(() => { const w = window.__world; w.camera.targetZoom = 1.9; w.car.teleport(-46, -28, 0); w.camera.snap(w.car.physics.position); w.ui.hideCard?.() })
  await p.waitForTimeout(1500); await p.screenshot({ path: "/tmp/zoom-a.png" })
  await p.evaluate(() => { const w = window.__world; w.car.teleport(-45.5, -28, 0); w.camera.snap(w.car.physics.position) })
  await p.waitForTimeout(600); await p.screenshot({ path: "/tmp/zoom-b.png" })
  await b.close()
})'
```

Open `/tmp/zoom-a.png`: every hangar and board in frame has a shadow, including the ones at the far left and right edges (the frustum half-size at zoom 1.9 is 63.4 m). Compare with `/tmp/zoom-b.png`: shadow edges should look identical in softness and position relative to their props (the target snapping absorbs the 0.5 m move). If the far edge props lack shadows, raise `perZoom` in `ShadowFollow`'s constructor defaults from 26 to 30 and re-run Task 6's tests (update the expected numbers there) and this step.

- [ ] **Step 4: Commit any tuning**

If constants changed in Tasks 10–12:

```bash
git add -A
git commit -m "Tune lighting, shadow bias and AO after screenshot review

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-03-portfolio-design.md`

- [ ] **Step 1: README**

In `README.md`:

1. Replace the paragraph `Everything in the scene is generated at runtime from Three.js primitives, extruded text and canvas textures. There are no 3D models, no image files and no audio files in the repository.` with:

```markdown
Everything in the scene is generated at runtime: Three.js primitives, extruded text, canvas
textures for words, and noise textures for the sand, tarmac and sky. Lighting is a shadow-mapped
sun whose frustum follows the camera, a prefiltered environment map built from a generated dome,
and a half-resolution ambient-occlusion pass. There are no 3D models, no image files and no audio
files in the repository.
```

2. In **Tests**, before the `node scripts/smoke-sections.mjs` line add:

```bash
npm run test:unit                               # node:test suites: textures, materials, shadow flags, sun follow, road UVs
```

and in the headless Chrome list add:

```bash
node scripts/e2e.mjs --no-effects   # same, with the AO pass off (the auto-quality fallback path)
node scripts/e2e-finish.mjs         # reads pixels: lit sand colour, shadow ratio, board cream, no acne
```

3. Replace the **Performance** paragraph with:

```markdown
60 fps at 1080p on an integrated GPU. Draw calls stay between 50 and 120 per section against a
150 budget; 182 physics bodies, all of which sleep at rest. Desktop renders a 2048 soft shadow
map and a half-resolution ambient-occlusion pass; touch devices get a 1024 map, pixel ratio 1.5
and nearer fog. After the reveal the frame time is sampled for three seconds: above 18 ms the AO
pass is dropped, and if the re-sample is still above 22 ms the pixel ratio falls to 1 and the
shadow map to 1024. Neither is ever raised again.
```

- [ ] **Step 2: Point the old spec at the new one**

In `docs/superpowers/specs/2026-09-03-portfolio-design.md`, under `## Deviations (deliberate)` add as the first bullet:

```markdown
- **Rendering (superseded 2026-09-04)**: the toon/blob-only look was replaced by lit standard
  materials, a following shadow map, generated ground textures, a sky gradient and GTAO. See
  `2026-09-04-scene-finish-design.md`. "No image files" now means "generated in code".
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-03-portfolio-design.md
git commit -m "Document the lit scene, its tiers and the new test scripts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage**: §1 lights/env/tone mapping → Task 10; shadow map + follow → Tasks 6, 10; flags → Tasks 4, 7, 9; materials → Task 4; roughness overrides → Task 9; blob strength → Tasks 5, 7. §2 sand/wear/roads/sky → Tasks 1–3, 7, 8, 10. §3 composer/AO/tiers/sampler → Task 10; integration map → Tasks 7–11; testing → Tasks 11–12; docs → Task 13.
- **Names used across tasks**: `applyShadowFlags(root, { cast })`, `shadowed(mesh)`, `ENV_INTENSITY` (Materials); `sandGrain()`, `tarmacGrain()`, `fitGrain(tex, w, d)`, `wearMap(rect, { rects, blotch })`, `worldToUv(x, z, rect)`, `skyGradient()`, `environmentScene({ sunDir })` (Textures); `ShadowFollow.aim(focus, zoom)`, `.texel`; `world.floorRect`, `world.wearMap`; `ROAD_RECTS`, `planarUv(geometry, rect)` (Roads); `experience.shadowFollow`, `.effects`, `.setEffects()`, `.readPixel()`, `'rendered'` event (Experience).
