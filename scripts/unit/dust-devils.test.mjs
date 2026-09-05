import test from 'node:test'
import assert from 'node:assert/strict'
import { stepDevil, DEVIL } from '../../src/world/props/DustDevils.js'
import { SECTION_DEFS } from '../../src/world/sections/registry.js'
import { ROAD_RECTS } from '../../src/world/Roads.js'

const EXTENTS = { x0: -110, x1: 110, z0: -130, z1: 75 }
const env = { extents: EXTENTS, sections: SECTION_DEFS, roads: ROAD_RECTS }
const rng = () => 0.5 // no drift

test('a devil started inside a section AABB steers out of it within 6 s', () => {
  const d = { x: 0, z: -30, heading: 0, speed: 2.5, spin: 4, phase: 0 } // the crossroads
  let t = 0
  while (t < 6 && !clear(d)) { stepDevil(d, 1 / 60, env, rng); t += 1 / 60 }
  assert.ok(clear(d), `still inside at ${d.x},${d.z} after ${t.toFixed(1)}s`)
})

test('a devil never leaves the extents minus the 6 m margin', () => {
  const d = { x: 100, z: 60, heading: Math.PI / 4, speed: 3, spin: 4, phase: 0 }
  for (let i = 0; i < 60 * 60; i++) {
    stepDevil(d, 1 / 60, env, rng)
    assert.ok(d.x >= EXTENTS.x0 + 6 && d.x <= EXTENTS.x1 - 6 && d.z >= EXTENTS.z0 + 6 && d.z <= EXTENTS.z1 - 6, `${d.x},${d.z}`)
  }
})

test('DEVIL carries the spec geometry and margins', () => {
  assert.deepEqual(DEVIL, { height: 9, radiusTop: 1.6, radiusBottom: 0.35, turn: 0.9, margin: 6 })
})

function clear(d) {
  for (const s of SECTION_DEFS) { const [x0, z0, x1, z1] = s.aabb; if (d.x > x0 - 6 && d.x < x1 + 6 && d.z > z0 - 6 && d.z < z1 + 6) return false }
  for (const r of ROAD_RECTS) {
    if (r.disc) { if (Math.hypot(d.x - r.cx, d.z - r.cz) < r.w / 2 + 3) return false; continue }
    if (Math.abs(d.x - r.cx) < r.w / 2 + 3 && Math.abs(d.z - r.cz) < r.d / 2 + 3) return false
  }
  return true
}
