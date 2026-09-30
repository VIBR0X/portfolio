// scripts/unit/plane-physics.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import * as CANNON from 'cannon-es'
import { PlanePhysics, PLANE } from '../../src/world/PlanePhysics.js'

// Every test here pins spawnYaw: 0 (north). The default is where the aircraft is parked in the
// world — nose east on the avenue — which is a placement decision, not a property of the model.

function fly(steps, input, p = new PlanePhysics({ spawn: [17, PLANE.groundY, -6], spawnYaw: 0 })) {
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
  const cruise = new PlanePhysics({ spawn: [17, 20, -6], spawnYaw: 0 })
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
  const p = new PlanePhysics({ spawn: [17, PLANE.groundY + 1.5, -6], spawnYaw: 0 })
  p.airborne = true
  p.speed = 18
  let landed = null
  for (let i = 0; i < 400 && !landed; i++) {
    const e = p.update(1 / 60, { throttle: -0.3, steer: 0, boost: false, brake: false, jump: false })
    if (e.justLanded || e.hardLanding) landed = e
  }
  assert.ok(landed?.justLanded && !landed.hardLanding, `landed: ${JSON.stringify(landed)}`)
})

/** Fly a descent from `height` at `speed` holding full S, and return the touchdown event. */
function descend(height, speed, boost) {
  const p = new PlanePhysics({ spawn: [17, PLANE.groundY + height, -6], spawnYaw: 0 })
  p.airborne = true
  p.speed = speed
  let landed = null
  for (let i = 0; i < 900 && !landed; i++) {
    const e = p.update(1 / 60, { throttle: -1, steer: 0, boost, brake: false, jump: false })
    if (e.justLanded || e.hardLanding) landed = e
  }
  return { landed, vy: p._lastVy }
}

// The bug this guards (measured 2026-09-09): airborne, throttle is the elevator, so the only way
// down is full S, which sinks at 4.67 m/s at the model's own ~20 m/s cruise equilibrium -- against a
// 4.5 m/s limit. Every naive landing from every altitude reported a crash, by a margin of 2-4%.
test('a normal held-S approach lands cleanly from every altitude', () => {
  for (const height of [8, 15, 25, 33]) {
    const { landed, vy } = descend(height, 20, false)
    assert.ok(landed?.justLanded && !landed.hardLanding, `from ${height} m: ${JSON.stringify(landed)} at vy ${vy}`)
    assert.ok(vy >= -PLANE.flareSink - 1e-6, `from ${height} m the flare should cap sink at ${PLANE.flareSink}, got ${vy}`)
  }
})

test('a boosted dive still lands hard: the flare does not catch it', () => {
  const { landed, vy } = descend(20, 38, true)
  assert.ok(landed?.hardLanding, `landed: ${JSON.stringify(landed)} at vy ${vy}`)
  assert.ok(vy < -PLANE.landingSinkLimit, `boosted dive should exceed the sink limit, got ${vy}`)
})

// The flare also bypasses itself while `stalling`, but that guard is defensive rather than reachable
// today, and this pins why: airborne thrust is unconditional (airCruiseAccel, applied whatever the
// throttle), so a slow aircraft accelerates back through minSpeed on its own. A stall is a
// self-recovering transient that never reaches the ground, and levelling off holds altitude exactly.
test('a slow aircraft recovers by itself rather than falling out of the sky', () => {
  const p = new PlanePhysics({ spawn: [17, PLANE.groundY + 12, -6], spawnYaw: 0 })
  p.airborne = true
  p.speed = 2
  let stalled = false
  let lowest = Infinity
  for (let i = 0; i < 900; i++) {
    const e = p.update(1 / 60, { throttle: 0, steer: 0, boost: false, brake: false, jump: false })
    if (e.stalling) stalled = true
    lowest = Math.min(lowest, p.position.y)
    assert.ok(!e.hardLanding && !e.justLanded, `should never reach the ground, but landed at t=${(i / 60).toFixed(2)}`)
  }
  assert.ok(stalled, 'below minSpeed for longer than the stall timer, it should report stalling')
  assert.ok(p.speed > PLANE.minSpeed, `should have recovered above minSpeed, got ${p.speed.toFixed(1)}`)
  assert.ok(lowest > PLANE.groundY + 9, `should sink only a little while recovering, dropped to ${lowest.toFixed(2)}`)
})

test('the ground roll stops in a sane distance', () => {
  const p = new PlanePhysics({ spawn: [-92, PLANE.groundY, -30], spawnYaw: -Math.PI / 2 })
  p.speed = 20
  const x0 = p.position.x
  for (let i = 0; i < 60 * 30 && p.speed > 0.2; i++) {
    p.update(1 / 60, { throttle: 0, steer: 0, boost: false, brake: false, jump: false })
  }
  const rolled = Math.abs(p.position.x - x0)
  // The avenue is 92 m of clear pavement from the spawn to the crossroads signpost, which is a solid
  // body: at the old rollDecel of 3 m/s² a 20 m/s touchdown ran 36 m and a 24 m/s one ran 96 m into it.
  assert.ok(rolled < 25, `rollout from 20 m/s should be well short of the 92 m avenue, got ${rolled.toFixed(1)} m`)
})

test('never exceeds the ceiling even after 10s of full pitch-up', () => {
  const { p } = fly(600, { throttle: 1, steer: 0, boost: true, brake: false, jump: false })
  assert.ok(p.position.y <= PLANE.ceiling + 1e-6)
})

test('stays within the world bounds after 20s flying straight at a boundary', () => {
  const p = new PlanePhysics({ spawn: [17, 20, -120], spawnYaw: 0 })
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
    const p = new PlanePhysics({ spawn: [0, 20, 0], spawnYaw: 0 })
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
  const p = new PlanePhysics({ spawn: [0, 20, 0], spawnYaw: 0 })
  p.airborne = true
  p.speed = 20
  assert.ok(nose(p).z < -0.999, 'yaw 0 points north (-z)')
  p.yaw = -Math.PI / 2
  assert.ok(nose(p).x > 0.999, 'yaw -PI/2 points east (+x), as HEADING_YAW.E does')
})

test('left stick banks left and turns left', () => {
  const p = new PlanePhysics({ spawn: [0, 20, 0], spawnYaw: 0 })
  p.airborne = true
  p.speed = 20
  const { p: flown } = fly(120, { throttle: 0, steer: 1, boost: false, brake: false, jump: false }, p)
  assert.ok(flown.bank > 0.3, `left stick rolls the right wing up (bank ${flown.bank.toFixed(2)})`)
  assert.ok(flown.yaw > 0.3, `and yaws left/west from north (yaw ${flown.yaw.toFixed(2)})`)
  assert.ok(nose(flown).x < -0.2, 'so the nose swings west')
})
