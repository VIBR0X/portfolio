import * as THREE from 'three'

/**
 * Mars palette (docs/superpowers/specs/2026-09-05-mars-rework-design.md §1.1). Rust regolith,
 * butterscotch sky, basalt pavement, habitat-white shells, cobalt trim, terracotta as a small accent
 * only. Every older key is kept as an alias written out as the literal hex of its new target, so no
 * call site breaks and the table below is the single source of every colour.
 */
export const palette = {
  regolith: '#B65E38', // ground base tone; the lit-ground target
  regolithDark: '#8F4426', // grain low end, crater bowls, skid marks, hill base
  regolithLight: '#D2825A', // grain high end, crater rims, drifts, dust
  pebble: '#6E3A24', // 2×2 dot pass in the ground grain
  dust: '#D9A17A', // default particle colour
  skyBottom: '#E6B98E', // fog, clear colour, horizon band
  skyTop: '#B97C50', // zenith (Mars darkens overhead)
  basalt: '#7C5240', // pavement grain base
  basaltDark: '#67433A', // pavement grain low end
  concrete: '#B9B0A2', // sintered block: pedestals, kerbs, tower shaft
  habitat: '#EFEAE0', // every built shell; greyer than board cream on purpose
  cream: '#FFF8EA', // boards, markings, labels, plane body, letters
  cobalt: '#2F5D8A', // primary trim
  trim: '#2F5D8A',
  steel: '#8FA9B8', // equipment grey-blue: replaces every green
  steelDark: '#748E9E',
  rover: '#2E6DA4', // the car: the one saturated blue in the world
  terracotta: '#E07A5F', // accent only, on cream / habitat / ink / basalt
  clay: '#C6634B', // darker accent
  navy: '#1F3550', // solar cell faces
  rock: '#6B4636', // boulders, lerped to rockLight per instance
  rockLight: '#8A5A44',
  hill: '#8F4426', // near hill ring, lerped to hillLight per instance
  hillLight: '#A85C3E',
  mesaFar: '#8F4426', // far mesa layer, lerped to mesaFarLight per instance
  mesaFarLight: '#B86A45',
  ink: '#2B2D42',
  lamp: '#FFD166', // beacons, eyes, flame, runway lights
  glass: '#9CCFD8', // canopy, rotors, glazing
  shadow: '#5A2C18', // blob-shadow discs
  dusk: '#B8A6A0', // replaces lavender / lilac
  stencil: '#F3E4D2', // every floor stencil and pad label
  inkSoft: '#5A5D73',
  // aliases from the desert scaffold, re-pointed (values must equal their targets above)
  dune: '#B65E38',
  sand: '#B65E38',
  sandDark: '#8F4426',
  tarmac: '#7C5240',
  road: '#7C5240',
  haze: '#E6B98E',
  mesa: '#D2825A',
  wood: '#D2825A',
  woodDark: '#2B2D42',
  sage: '#8FA9B8',
  mint: '#8FA9B8',
  grass: '#8FA9B8',
  sageDark: '#748E9E',
  leaf: '#748E9E',
  teal: '#748E9E',
  slate: '#B9B0A2',
  blue: '#2F5D8A',
  coral: '#E07A5F',
  rose: '#E07A5F',
  coralDark: '#C6634B',
  lavender: '#B8A6A0',
  lilac: '#B8A6A0',
  sky: '#9CCFD8',
  white: '#FFF8EA',
  charcoal: '#2B2D42',
  amber: '#FFD166',
}

/**
 * Environment-light contribution for every lit material. Applied through `scene.environmentIntensity`
 * in `Experience.setEnvironment`: while `scene.environment` is set and a material carries no `envMap`
 * of its own, WebGLRenderer overwrites the material's uniform with the scene-level value, so the
 * `envMapIntensity` set on each material below is only the fallback for a material with its own map.
 */
export const ENV_INTENSITY = 0.6

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
 *  - unlit (MeshBasicMaterial: decals, labels, printed board and counter faces): neither cast nor
 *    receive — MeshBasicMaterial has no lighting in its shader, so it cannot receive a shadow, and
 *    these are all zero-thickness printed panels that should not cast one either. The blob discs in
 *    Shadows.js are unlit too but never reach here: BlobShadows adds its InstancedMesh to the scene
 *    itself, and InstancedMesh already defaults both flags to false;
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
