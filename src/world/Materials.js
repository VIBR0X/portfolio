import * as THREE from 'three'

// Warm, low-poly pastel palette in the spirit of bruno-simon.com's matcap look.
export const palette = {
  sand: '#f2e8d8',
  sandDark: '#e6d9c3',
  road: '#e0d3bb',
  ink: '#2b2a33',
  inkSoft: '#5a5866',
  white: '#fbfaf7',
  cream: '#fff6e5',
  coral: '#ff6b57',
  coralDark: '#d9503f',
  amber: '#ffb64d',
  mint: '#7fd1b9',
  teal: '#3aa6a0',
  sky: '#8ec5ff',
  blue: '#4d65ff',
  lilac: '#b8a4ff',
  rose: '#ff8fb1',
  grass: '#a8d672',
  leaf: '#5fb36a',
  wood: '#c99b6a',
  woodDark: '#8f6a45',
  slate: '#77839a',
  charcoal: '#3b3f4a',
}

const cache = new Map()

/**
 * Flat-shaded matte material. Cached per colour so hundreds of props share a few materials.
 */
export function flat(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}`
  if (cache.has(key)) return cache.get(key)
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color('#000000'),
    emissiveIntensity: opts.emissiveIntensity ?? 0.35,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  })
  cache.set(key, mat)
  return mat
}

export function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast
  mesh.receiveShadow = receive
  return mesh
}

/**
 * Applies a random-but-subtle shade variation to a Color for visual richness.
 */
export function vary(hex, amount = 0.06, seed = Math.random()) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  hsl.l = THREE.MathUtils.clamp(hsl.l + (seed - 0.5) * amount * 2, 0, 1)
  c.setHSL(hsl.h, hsl.s, hsl.l)
  return '#' + c.getHexString()
}
