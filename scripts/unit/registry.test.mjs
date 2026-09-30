// The section registry is a lookup table with two rules that are easy to break by moving one number:
// sectionAt() returns the FIRST row whose AABB contains the point, and every teleport key drops the
// car on its row's `spawn`. So a spawn that lies inside an earlier row's AABB silently teleports the
// visitor into the wrong section — measured 2026-09-09: key 2 (crossroads, spawn z -18) resolved to
// 'intro', and key 6 (education, spawn z -88) resolved to 'skills'. Both showed the wrong label and
// never fired their own card.
import test from 'node:test'
import assert from 'node:assert/strict'
import { SECTION_DEFS } from '../../src/world/sections/registry.js'

const inside = (aabb, x, z) => x >= aabb[0] && x <= aabb[2] && z >= aabb[1] && z <= aabb[3]
/** The same first-match rule World.sectionAt uses. */
const sectionAt = (x, z) => SECTION_DEFS.find((d) => inside(d.aabb, x, z))

test('every section spawn resolves to its own section', () => {
  for (const def of SECTION_DEFS) {
    const [x, z] = def.spawn
    assert.ok(inside(def.aabb, x, z), `${def.id} spawn (${x}, ${z}) is outside its own aabb ${def.aabb}`)
    const got = sectionAt(x, z)
    assert.equal(got.id, def.id, `${def.id} spawn (${x}, ${z}) resolves to '${got.id}' — an earlier row's aabb ${got.aabb} contains it`)
  }
})

test('every section centre resolves to its own section', () => {
  for (const def of SECTION_DEFS) {
    const [x, z] = def.centre
    const got = sectionAt(x, z)
    assert.equal(got.id, def.id, `${def.id} centre (${x}, ${z}) resolves to '${got.id}'`)
  }
})

test('the registry keys are 1-8 in table order, and ids are unique', () => {
  assert.deepEqual(SECTION_DEFS.map((d) => d.key), ['1', '2', '3', '4', '5', '6', '7', '8'])
  assert.equal(new Set(SECTION_DEFS.map((d) => d.id)).size, SECTION_DEFS.length)
})
