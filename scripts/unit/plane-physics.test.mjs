// scripts/unit/plane-physics.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import * as CANNON from 'cannon-es'
import { PlanePhysics, PLANE } from '../../src/world/PlanePhysics.js'

function fly(steps, input, p = new PlanePhysics({ spawn: [17, PLANE.groundY, -6] })) {
  const dt = 1 / 60
  const events = []
  for (let i = 0; i < steps; i++) events.push(p.update(dt, typeof input === 'function' ? input(p, i) : input))
  return { p, events }
}

test('full throttle from rest lifts off within a plausible ground roll', () => {
  const { p, events } = fly(400, { throttle: 1, steer: 0, boost: false, brake: false, jump: false })
  const liftEvent = events.find((e) => e.justLifted)
  assert.ok(liftEvent, 'lifts off within 400 steps (6.7s)')
  const travelled = Math.abs(p.position.z - (-6))
  assert.ok(travelled > 20 && travelled < 100, `ground roll ${travelled.toFixed(1)}m is plausible`)
})

test('holding pitch-up after lift-off climbs steadily', () => {
  const { p } = fly(500, { throttle: 1, steer: 0, boost: false, brake: false, jump: false })
  const y1 = p.position.y
  const { p: p2 } = fly(120, { throttle: 1, steer: 0, boost: false, brake: false, jump: false }, p)
  assert.ok(p2.position.y > y1, 'still climbing 2s later')
})

test('full bank for 2s at cruise speed turns at least 60 degrees', () => {
  const cruise = new PlanePhysics({ spawn: [17, 20, -6] })
  cruise.speed = 20
  cruise.airborne = true
  const yaw0 = cruise.yaw
  fly(120, { throttle: 0.5, steer: 1, boost: false, brake: false, jump: false }, cruise)
  const delta = Math.abs(cruise.yaw - yaw0)
  assert.ok(delta > (60 * Math.PI) / 180, `yaw changed ${(delta * 180 / Math.PI).toFixed(0)} degrees`)
})

test('a gentle dive lands softly: justLanded, not hardLanding', () => {
  // Presetting vy directly is meaningless here: the model recomputes vy from pitch every frame
  // (Step 3's `this.vy = climb * pitchFrac`), so the test must command a real dive through input,
  // the same way a player would, and let the model's own dynamics produce the descent rate.
  const p = new PlanePhysics({ spawn: [17, PLANE.groundY + 1.5, -6] })
  p.airborne = true
  p.speed = 18
  let landed = null
  for (let i = 0; i < 400 && !landed; i++) {
    const e = p.update(1 / 60, { throttle: -0.3, steer: 0, boost: false, brake: false, jump: false })
    if (e.justLanded || e.hardLanding) landed = e
  }
  assert.ok(landed?.justLanded && !landed.hardLanding, `landed: ${JSON.stringify(landed)}`)
})

test('a steep dive lands hard: hardLanding', () => {
  const p = new PlanePhysics({ spawn: [17, PLANE.groundY + 3, -6] })
  p.airborne = true
  p.speed = 25
  let landed = null
  for (let i = 0; i < 400 && !landed; i++) {
    const e = p.update(1 / 60, { throttle: -1, steer: 0, boost: false, brake: false, jump: false })
    if (e.justLanded || e.hardLanding) landed = e
  }
  assert.ok(landed?.hardLanding, `landed: ${JSON.stringify(landed)}`)
})

test('never exceeds the ceiling even after 10s of full pitch-up', () => {
  const { p } = fly(600, { throttle: 1, steer: 0, boost: true, brake: false, jump: false })
  assert.ok(p.position.y <= PLANE.ceiling + 1e-6)
})

test('stays within the world bounds after 20s flying straight at a boundary', () => {
  const p = new PlanePhysics({ spawn: [17, 20, -120] })
  p.airborne = true
  p.speed = PLANE.maxSpeed
  p.pitch = 0
  fly(1200, { throttle: 1, steer: 0, boost: false, brake: false, jump: false }, p)
  const bounds = PLANE.bounds
  assert.ok(p.position.x >= bounds.x0 && p.position.x <= bounds.x1)
  assert.ok(p.position.z >= bounds.z0 && p.position.z <= bounds.z1)
})

/* ---------------------------------------------------------------------------------------------
 * Orientation. The mesh is drawn from `quaternion` while the position is integrated from `yaw`, so
 * the two conventions have to agree. They did not until 2026-09-06: the model flew backwards at
 * every heading except due north, which no numeric check here caught because they all flew north.
 * ------------------------------------------------------------------------------------------- */

/** The nose direction the mesh is drawn along: the model's -Z axis through the pose quaternion. */
function nose(p) {
  const n = p.quaternion.vmult(new CANNON.Vec3(0, 0, -1))
  const flat = new CANNON.Vec3(n.x, 0, n.z)
  flat.normalize()
  return flat
}

test('the plane moves the way its nose points, at every heading', () => {
  for (const yaw of [0, 0.4, Math.PI / 2, -Math.PI / 2, 2.5, Math.PI, -3]) {
    const p = new PlanePhysics({ spawn: [0, 20, 0] })
    p.airborne = true
    p.speed = 20
    p.yaw = yaw
    const from = { x: p.position.x, z: p.position.z }
    p.update(1 / 60, { throttle: 0, steer: 0, boost: false, brake: false, jump: false })
    const moved = new CANNON.Vec3(p.position.x - from.x, 0, p.position.z - from.z)
    moved.normalize()
    const n = nose(p)
    assert.ok(n.dot(moved) > 0.999, `yaw ${yaw.toFixed(2)}: nose (${n.x.toFixed(2)}, ${n.z.toFixed(2)}) vs motion (${moved.x.toFixed(2)}, ${moved.z.toFixed(2)})`)
    assert.ok(Math.abs(p.velocity.x - moved.x * 20) < 1e-6, `yaw ${yaw.toFixed(2)}: velocity disagrees with the step`)
  }
})

test('heading zero is north and a quarter turn east matches the car (registry E = -PI/2)', () => {
  const p = new PlanePhysics({ spawn: [0, 20, 0] })
  p.airborne = true
  p.speed = 20
  assert.ok(nose(p).z < -0.999, 'yaw 0 points north (-z)')
  p.yaw = -Math.PI / 2
  assert.ok(nose(p).x > 0.999, 'yaw -PI/2 points east (+x), as HEADING_YAW.E does')
})

test('left stick banks left and turns left', () => {
  const p = new PlanePhysics({ spawn: [0, 20, 0] })
  p.airborne = true
  p.speed = 20
  const { p: flown } = fly(120, { throttle: 0, steer: 1, boost: false, brake: false, jump: false }, p)
  assert.ok(flown.bank > 0.3, `left stick rolls the right wing up (bank ${flown.bank.toFixed(2)})`)
  assert.ok(flown.yaw > 0.3, `and yaws left/west from north (yaw ${flown.yaw.toFixed(2)})`)
  assert.ok(nose(flown).x < -0.2, 'so the nose swings west')
})
