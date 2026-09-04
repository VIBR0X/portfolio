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
