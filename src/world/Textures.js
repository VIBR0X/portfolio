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
 * Tiling grain between two colours: fbm for the body, a sparse speckle on top, then `dots` — a
 * density of 2×2 `dotColor` pebbles stamped from a second seeded rng — and `streak`, a sine ripple
 * along v (wind streaks along X, parallel to the avenues) that scales the body by 1−streak..1.
 * The caller sets `repeat` (see fitGrain) so one tile spans `userData.metres` in the world.
 */
export function grain({
  size = 1024, seed = 3, a = palette.regolith, b = palette.regolithLight, baseCells = 6, octaves = 3,
  speckle = 0.03, speckleStrength = 0.25, dots = 0, dotColor = palette.pebble, streak = 0,
} = {}) {
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
    if (streak > 0) {
      const y = Math.floor(i / size)
      t *= 1 - streak + streak * Math.sin((y / size) * Math.PI * 2 * 3 + n[i] * 4)
    }
    t = Math.min(1, Math.max(0, t))
    data[i * 4] = Math.round(ca[0] + (cb[0] - ca[0]) * t)
    data[i * 4 + 1] = Math.round(ca[1] + (cb[1] - ca[1]) * t)
    data[i * 4 + 2] = Math.round(ca[2] + (cb[2] - ca[2]) * t)
    data[i * 4 + 3] = 255
  }
  const count = Math.round(size * size * dots)
  if (count > 0) {
    const cd = hexBytes(dotColor)
    const dr = rng(seed + 7)
    for (let k = 0; k < count; k++) {
      const x = Math.floor(dr() * size)
      const y = Math.floor(dr() * size)
      for (const [px, py] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
        if (px >= size || py >= size) continue
        const j = (py * size + px) * 4
        data[j] = cd[0]
        data[j + 1] = cd[1]
        data[j + 2] = cd[2]
      }
    }
  }
  return rgbaTexture(data, size, size, { repeat: true, anisotropy: 8 })
}

let regolith = null
/** Shared regolith grain: rust to light rust, pebble dots, faint wind streaks, one tile per 24 m. */
export function regolithGrain() {
  if (!regolith) {
    regolith = grain({ size: 1024, seed: 3, a: palette.regolith, b: palette.regolithLight, baseCells: 5, octaves: 4, speckle: 0.05, speckleStrength: 0.28, dots: 0.004, dotColor: palette.pebble, streak: 0.08 })
    regolith.userData.metres = 24
  }
  return regolith
}

let basalt = null
/** Shared basalt pavement grain: finer, darker, one tile per 12 m. */
export function basaltGrain() {
  if (!basalt) {
    basalt = grain({ size: 512, seed: 11, a: palette.basalt, b: palette.basaltDark, baseCells: 12, octaves: 2, speckle: 0.02, speckleStrength: 0.2, dots: 0.002, dotColor: '#8A7568' })
    basalt.userData.metres = 12
  }
  return basalt
}

/**
 * Per-surface view of a grain texture, with `repeat` set so one tile spans `texture.userData.metres`
 * on a w×d surface. Clones so the shared singleton's own `repeat` is never mutated: `Texture.clone()`
 * shares the underlying image `source` (pixels upload to the GPU once) and copies `userData`.
 */
export function fitGrain(texture, w, d) {
  const m = texture.userData.metres || 24
  const view = texture.clone()
  view.repeat.set(w / m, d / m)
  view.needsUpdate = true
  return view
}

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
 * ({ cx, cz, w, d, amount? }) feathered to nothing over `feather` metres outside the rectangle,
 * plus a bowl under each of `discs` ({ cx, cz, r, amount? }) that is deepest at the centre and
 * already fades to nothing at the rim, so it needs no feather. Values are clamped to 0.78..1.0.
 */
export function wearMap(rect, { size = 512, seed = 5, rects = [], discs = [], feather = 3, amount = 0.07, blotch = 0.08 } = {}) {
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
      for (const c of discs) {
        const dist = Math.hypot(wx - c.cx, wz - c.cz)
        if (dist >= c.r) continue
        v -= (c.amount ?? 0.12) * (1 - smooth(dist / c.r))
      }
      const b = Math.round(Math.min(1, Math.max(0.78, v)) * 255)
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

let crater = null
/**
 * Shared crater decal: a 256² sRGB RGBA DataTexture, radial. The bowl (t ≤ 0.72) is regolithDark at
 * alpha 0.35·(1 − (t/0.72)²); the rim (0.72 < t ≤ 0.92) is regolithLight fading out over a
 * smoothstep; outside is fully transparent. Drawn per crater by World.setFloor as an instanced
 * unlit disc, because an aoMap only darkens indirect light and would barely show.
 */
export function craterDecal() {
  if (crater) return crater
  const size = 256
  const half = size / 2
  const dark = hexBytes(palette.regolithDark)
  const light = hexBytes(palette.regolithLight)
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const t = Math.hypot(x - half, y - half) / half
      if (t <= 0.72) {
        data[i] = dark[0]; data[i + 1] = dark[1]; data[i + 2] = dark[2]
        data[i + 3] = Math.round(255 * 0.35 * (1 - (t / 0.72) ** 2))
      } else if (t <= 0.92) {
        data[i] = light[0]; data[i + 1] = light[1]; data[i + 2] = light[2]
        data[i + 3] = Math.round(255 * 0.4 * (1 - smooth((t - 0.72) / 0.2)))
      } else {
        data[i] = light[0]; data[i + 1] = light[1]; data[i + 2] = light[2]
        data[i + 3] = 0
      }
    }
  }
  crater = rgbaTexture(data, size, size, { srgb: true, anisotropy: 4 })
  return crater
}

/**
 * 1×`size` vertical strip for `scene.background` (three stretches it across the screen).
 * Flat `bottom` colour (the fog / haze band) up to `horizon` (fraction of screen height), then eases to `top`.
 * The visible sky is only the top band above the fogged floor edge, so the flat part hides behind the ground.
 */
export function skyGradient({ bottom = palette.skyBottom, top = palette.skyTop, horizon = 0.55, size = 64 } = {}) {
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
 * Tiny scene for PMREMGenerator.fromScene(): a colour-graded dome (regolith bounce below the horizon,
 * the sky's haze band at it, the darker zenith above) plus an HDR sun disc along `sunDir`.
 * Dispose it after prefiltering.
 */
export function environmentScene({ sunDir = new THREE.Vector3(1, 2, 1).normalize(), radius = 40 } = {}) {
  const scene = new THREE.Scene()
  const geo = new THREE.SphereGeometry(radius, 24, 16)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const below = new THREE.Color(palette.regolith)
  const horizon = new THREE.Color(palette.skyBottom)
  const above = new THREE.Color(palette.skyTop)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / radius
    if (t < 0) c.lerpColors(below, horizon, smooth(t + 1))
    else c.lerpColors(horizon, above, smooth(t))
    c.toArray(colors, i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }))
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.6, 4.3, 3.9) }))
  sun.position.copy(sunDir).multiplyScalar(radius * 0.75)
  scene.add(dome, sun)
  return scene
}
