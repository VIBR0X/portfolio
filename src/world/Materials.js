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
 *  - unlit (MeshBasicMaterial: decals, labels, printed board/counter faces, blob discs): neither cast
 *    nor receive — MeshBasicMaterial has no lighting in its shader, so it cannot receive a shadow,
 *    and these are all zero-thickness printed panels that should not cast one either;
 *  - transparent with no depth write (floor decals): neither cast nor receive;
 *  - other transparent (glazing, pad fills): receive only;
 *  - opaque: cast and receive, unless `cast` is false (flat ground pieces such as roads and markings).
 */
export function applyShadowFlags(root, { cast = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const m = o.material
    if (m.isMeshBasicMaterial) { o.castShadow = false; o.receiveShadow = false; return }
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

/** Subtle per-instance shade variation. */
export function vary(hex, amount = 0.06, seed = Math.random()) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  hsl.l = THREE.MathUtils.clamp(hsl.l + (seed - 0.5) * amount * 2, 0, 1)
  c.setHSL(hsl.h, hsl.s, hsl.l)
  return '#' + c.getHexString()
}
