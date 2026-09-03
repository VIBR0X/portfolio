import * as THREE from 'three'

/**
 * Palette from the design spec (docs/superpowers/specs). Old scaffold names are kept as aliases.
 */
export const palette = {
  dune: '#E9D4A6',
  tarmac: '#CDB07E',
  haze: '#F7EFDD',
  terracotta: '#E07A5F',
  clay: '#C6634B',
  cobalt: '#3D5A80',
  sage: '#81B29A',
  sageDark: '#6F9C86',
  cream: '#FFF8EA',
  ink: '#2B2D42',
  concrete: '#BFB8A8',
  glass: '#A8DADC',
  lamp: '#FFD166',
  mesa: '#D4A373',
  shadow: '#6B4E2E',
  lavender: '#9FB3C8',
  // aliases used by the early scaffold
  sand: '#E9D4A6',
  sandDark: '#DCC493',
  road: '#CDB07E',
  inkSoft: '#5A5D73',
  white: '#FFF8EA',
  coral: '#E07A5F',
  coralDark: '#C6634B',
  amber: '#FFD166',
  mint: '#81B29A',
  teal: '#5E9A8E',
  sky: '#A8DADC',
  blue: '#3D5A80',
  lilac: '#9FB3C8',
  rose: '#E07A5F',
  grass: '#81B29A',
  leaf: '#6F9C86',
  wood: '#D4A373',
  woodDark: '#8F6A45',
  slate: '#BFB8A8',
  charcoal: '#2B2D42',
}

/* Three-step toon gradient: the "matcap" look without matcap textures. */
let gradientMap = null
export function toonGradient() {
  if (gradientMap) return gradientMap
  const data = new Uint8Array([96, 168, 255])
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RedFormat)
  gradientMap.minFilter = THREE.NearestFilter
  gradientMap.magFilter = THREE.NearestFilter
  gradientMap.colorSpace = THREE.LinearSRGBColorSpace
  gradientMap.needsUpdate = true
  return gradientMap
}

const cache = new Map()

/**
 * Flat-shaded toon material, cached per colour/options so props share materials.
 */
export function flat(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.emissiveIntensity ?? ''}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}|${opts.side ?? ''}|${opts.vertexColors ? 1 : 0}`
  if (cache.has(key)) return cache.get(key)
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toonGradient(),
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color('#000000'),
    emissiveIntensity: opts.emissiveIntensity ?? 0.6,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
  })
  mat.flatShading = true
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

/** Kept for API compatibility: shadow maps are off (blob shadows instead). */
export function shadowed(mesh) {
  return mesh
}

/** Subtle per-instance shade variation. */
export function vary(hex, amount = 0.06, seed = Math.random()) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  hsl.l = THREE.MathUtils.clamp(hsl.l + (seed - 0.5) * amount * 2, 0, 1)
  c.setHSL(hsl.h, hsl.s, hsl.l)
  return '#' + c.getHexString()
}
