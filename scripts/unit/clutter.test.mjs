import test from 'node:test'
import assert from 'node:assert/strict'
import { scatterPoints } from '../../src/world/Clutter.js'
import { ROAD_RECTS } from '../../src/world/Roads.js'
import { SECTION_DEFS } from '../../src/world/sections/registry.js'

const EXTENTS = { x0: -110, x1: 110, z0: -130, z1: 75 }

function insideRect(x, z, r) {
  if (r.disc) return Math.hypot(x - r.cx, z - r.cz) < r.w / 2
  return Math.abs(x - r.cx) < r.w / 2 && Math.abs(z - r.cz) < r.d / 2
}

test('every scattered point avoids roads and section interiors', () => {
  const points = scatterPoints(EXTENTS, 72)
  assert.equal(points.length, 72, 'the sampler finds enough clear ground')
  for (const p of points) {
    for (const r of ROAD_RECTS) assert.ok(!insideRect(p.x, p.z, r), `${p.x.toFixed(1)},${p.z.toFixed(1)} clear of ${r.name}`)
    for (const s of SECTION_DEFS) {
      const [x0, z0, x1, z1] = s.aabb
      assert.ok(!(p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1), `${p.x.toFixed(1)},${p.z.toFixed(1)} clear of ${s.id}`)
    }
  }
})

test('every scattered point stays inside the world', () => {
  for (const p of scatterPoints(EXTENTS, 72)) {
    assert.ok(p.x > EXTENTS.x0 && p.x < EXTENTS.x1 && p.z > EXTENTS.z0 && p.z < EXTENTS.z1)
  }
})

test('the scatter is deterministic across runs', () => {
  assert.deepEqual(scatterPoints(EXTENTS, 40), scatterPoints(EXTENTS, 40))
})

test('a different seed gives a different scatter', () => {
  assert.notDeepEqual(scatterPoints(EXTENTS, 40, 11), scatterPoints(EXTENTS, 40, 12))
})
