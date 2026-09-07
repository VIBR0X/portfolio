// src/world/PlanePhysics.js
import * as CANNON from 'cannon-es'

/**
 * Pure kinematic flight model. No THREE, no DOM — Node-testable like CarPhysics.
 * Local axes match the car: +X right, +Y up, -Z forward.
 */
export const PLANE = {
  size: { w: 2.4, h: 1.7, l: 6.4 },
  groundY: 1.05,
  accel: 8,               // ground-roll acceleration (measured: reaches liftSpeed in ~91m, ~2.2s)
  boostAccel: 10,          // ground-roll acceleration while boosting
  airCruiseAccel: 5.6,     // constant airborne thrust once flying, unboosted (equilibrium ~20 m/s)
  airBoostAccel: 20,       // constant airborne thrust while boosting (equilibrium ~38 m/s)
  drag: 0.014,             // quadratic drag; shared by ground roll and flight
  liftSpeed: 15,
  minSpeed: 6,
  maxSpeed: 30,
  maxBoostSpeed: 42,
  climbRateAtLiftSpeed: 3,
  climbRateAtMaxSpeed: 8,
  pitchRate: 1.1,
  maxPitch: 0.45,
  bankRate: 1.6,
  maxBank: 0.9,
  turnRateAtMaxBank: 0.85,
  ceiling: 34,             // low enough that the ground never leaves the frame
  rollDecel: 3,            // passive rolling resistance on the ground (m/s²)
  brakeDecel: 9,           // extra wheel braking while Ctrl/B is held on the ground
  landingSinkLimit: 4.5,
  // Parked on the north avenue at the west end, nose east: 92 m of straight pavement to roll down,
  // which is the longest clear run in the world. yaw -PI/2 is east, the same convention the car and
  // registry.HEADING_YAW use.
  spawn: [-92, 1.05, -30],
  spawnYaw: -Math.PI / 2,
  bounds: { x0: -105, x1: 105, z0: -125, z1: 70 }, // 5 m inside the walls: the clamp must not leave the nose (3.4 m from centre) inside one
}

export class PlanePhysics {
  constructor({ spawn = PLANE.spawn, spawnYaw = PLANE.spawnYaw } = {}) {
    this.spawn = spawn.slice()
    this.spawnYaw = spawnYaw
    this.position = new CANNON.Vec3(spawn[0], spawn[1], spawn[2])
    this.speed = 0
    this.pitch = 0
    this.bank = 0
    this.yaw = spawnYaw
    this.vy = 0
    this.gust = 0 // bank nudge (rad) set by a dust devil; decays over 0.4 s
    this.airborne = false
    this.stallTimer = 0
    this._lastVy = 0
  }

  get grounded() { return !this.airborne }

  update(dt, input) {
    const events = { justLifted: false, justLanded: false, hardLanding: false, stalling: false }
    const P = PLANE

    // Speed: throttle drives the ground roll (accelerator/reverse), matching the car. Once airborne,
    // throttle instead drives pitch (see below) — measured fact: reading raw throttle for thrust
    // AND pitch at the same time made climbing/diving also change speed unpredictably, so once
    // airborne, speed is held by a constant cruise thrust (boosted by Shift) against drag instead.
    const boostOn = input.boost
    const target = this.airborne
      ? (boostOn ? P.airBoostAccel : P.airCruiseAccel)
      : (input.throttle > 0 ? P.accel * (boostOn ? P.boostAccel / P.accel : 1) : input.throttle < 0 ? -P.accel * 0.5 : 0)
    const drag = P.drag * this.speed * Math.abs(this.speed)
    this.speed += (target - drag) * dt
    const speedCap = boostOn ? P.maxBoostSpeed : P.maxSpeed
    this.speed = Math.max(0, Math.min(speedCap, this.speed))

    // Pitch (airborne only responds to throttle-as-elevator; grounded stays level)
    if (this.airborne) {
      const targetPitch = Math.max(-1, Math.min(1, input.throttle)) * P.maxPitch
      this.pitch += (targetPitch - this.pitch) * (1 - Math.exp(-dt * P.pitchRate * 6))
    } else {
      this.pitch += (0 - this.pitch) * (1 - Math.exp(-dt * P.pitchRate * 6))
    }

    // Bank -> yaw rate (a dust-devil gust nudges the bank first, then fades)
    const g = this.gust * (1 - Math.exp(-dt / 0.4))
    this.bank += g
    this.gust -= g // the whole nudge lands over ~0.4 s, so a 0.15 rad gust adds 0.15 rad in total
    // steer +1 is left (the car's convention). Positive bank is a positive rotation about +Z, which
    // lifts the right wing and drops the left one, and positive yaw turns west from north — so left
    // stick banks left and turns left, with the mesh rolling the way the turn goes.
    const targetBank = input.steer * P.maxBank
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-dt * P.bankRate * 6))
    const yawRate = (this.bank / P.maxBank) * P.turnRateAtMaxBank
    this.yaw += yawRate * dt

    // Lift-off: measured fact — gating this on `this.pitch > 0.05` deadlocks the model, because
    // pitch only responds to input while `this.airborne` is already true (the branch above), so it
    // can never rise past 0 before liftoff and liftoff can never fire. Gate on throttle instead:
    // still holding the accelerator past liftSpeed is what takes off, exactly like holding the gas
    // in the ground-roll model.
    let justLiftedThisFrame = false
    if (!this.airborne && this.speed >= P.liftSpeed && input.throttle > 0) {
      this.airborne = true
      events.justLifted = true
      justLiftedThisFrame = true
    }

    if (this.airborne) {
      // Stall
      if (this.speed < P.minSpeed) {
        this.stallTimer += dt
        if (this.stallTimer > 0.4) {
          this.pitch += (-P.maxPitch - this.pitch) * (1 - Math.exp(-dt * 4))
          this.vy += (-6 - this.vy) * (1 - Math.exp(-dt * 4))
          events.stalling = true
        }
      } else {
        this.stallTimer = 0
      }
      if (!events.stalling) {
        const speedFrac = Math.max(0, Math.min(1, (this.speed - P.liftSpeed) / (P.maxSpeed - P.liftSpeed)))
        const climb = P.climbRateAtLiftSpeed + (P.climbRateAtMaxSpeed - P.climbRateAtLiftSpeed) * speedFrac
        const pitchFrac = Math.sin(this.pitch) / Math.sin(P.maxPitch)
        this.vy = climb * pitchFrac
      }
      // Rotation hop: measured fact — on the liftoff frame, pitch is still ~0 (it was governed by
      // the grounded branch a moment ago and has not yet risen), so the climb formula above gives
      // vy = 0 and the plane would sit exactly at groundY with zero vertical speed. The very next
      // check (`position.y <= groundY`) would then read that as an immediate landing on the same
      // frame, silently cancelling the liftoff every time. A small guaranteed hop breaks the tie.
      if (justLiftedThisFrame) this.vy = Math.max(this.vy, 1.5)
      if (this.position.y >= P.ceiling && this.vy > 0) this.vy = 0
      this.position.y += this.vy * dt
      if (this.position.y > P.ceiling) this.position.y = P.ceiling

      // Landing / hard landing
      if (this.position.y <= P.groundY) {
        const impactVy = this.vy
        this.position.y = P.groundY
        this.vy = 0
        this.airborne = false
        this._lastVy = impactVy
        if (Math.abs(impactVy) > P.landingSinkLimit) events.hardLanding = true
        else events.justLanded = true
      }
    } else {
      // Ground rollout: without this a landing coasts for half a minute before the visitor is
      // allowed to climb out. Ctrl/B adds wheel braking on top, as it does in the car.
      if (input.throttle <= 0.05) this.speed = Math.max(0, this.speed - P.rollDecel * dt)
      if (input.brake) this.speed = Math.max(0, this.speed - P.brakeDecel * dt)
    }

    // Integrate position from yaw/pitch and speed
    // A Y-rotation by `yaw` maps the model's nose (0, 0, -1) to (-sin yaw, 0, -cos yaw) — the same
    // convention as the car and as registry.HEADING_YAW (east = -PI/2). Integrating +sin here
    // instead flew the plane backwards at every heading but due north, while the mesh, driven by
    // `quaternion` below, pointed the other way (measured 2026-09-06).
    const cosPitch = Math.cos(this.pitch)
    const forward = new CANNON.Vec3(-Math.sin(this.yaw) * cosPitch, 0, -Math.cos(this.yaw) * cosPitch)
    this.position.x += forward.x * this.speed * dt
    this.position.z += forward.z * this.speed * dt

    // Soft world bounds: clamp and zero the outward component
    const B = P.bounds
    if (this.position.x < B.x0) this.position.x = B.x0
    if (this.position.x > B.x1) this.position.x = B.x1
    if (this.position.z < B.z0) this.position.z = B.z0
    if (this.position.z > B.z1) this.position.z = B.z1

    return events
  }

  get quaternion() {
    const q = new CANNON.Quaternion()
    q.setFromEuler(this.pitch, this.yaw, this.bank, 'YXZ')
    return q
  }

  get velocity() {
    const cosPitch = Math.cos(this.pitch)
    return new CANNON.Vec3(-Math.sin(this.yaw) * cosPitch * this.speed, this.vy, -Math.cos(this.yaw) * cosPitch * this.speed)
  }

  respawn() {
    this.position.set(this.spawn[0], this.spawn[1], this.spawn[2])
    this.yaw = this.spawnYaw // without this a crash respawns the plane still pointing where it crashed
    this.speed = 0
    this.pitch = 0
    this.bank = 0
    this.vy = 0
    this.airborne = false
  }
}
