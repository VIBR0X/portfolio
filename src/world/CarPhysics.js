import * as CANNON from 'cannon-es'

/**
 * Pure cannon-es raycast vehicle. No rendering here so it can be unit-tested in Node.
 * Local axes: +X right, +Y up, -Z forward (matches the mesh, which faces -Z).
 */
// Note on units: cannon-es applies `engineForce * dt` as an impulse per wheel per step,
// so acceleration ≈ 4 * engineForce / mass (m/s²). 520 N on 220 kg ≈ 9.5 m/s².
export const CAR = {
  mass: 220,
  chassis: { w: 1.7, h: 0.6, l: 3.2 },
  wheelRadius: 0.38,
  wheelWidth: 0.32,
  axleX: 0.82,
  frontZ: -1.12,
  rearZ: 1.12,
  restLength: 0.38,
  engineForce: 520,
  boostMultiplier: 1.8,
  reverseMultiplier: 0.6,
  brakeForce: 18,
  idleBrake: 2,
  maxSteer: 0.6,
  maxSpeed: 22,
  maxBoostSpeed: 34,
  jumpImpulse: 7.5,
  jumpCooldown: 0.9,
  maxLaunchSpeed: 46,
  maxRiseSpeed: 14,
}

export class CarPhysics {
  constructor(physics, { spawn = [0, 1.2, 0] } = {}) {
    this.physics = physics
    this.world = physics.world
    this.spawn = new CANNON.Vec3(spawn[0], spawn[1], spawn[2])
    this.spawnYaw = 0

    const { w, h, l } = CAR.chassis
    this.chassisBody = new CANNON.Body({ mass: CAR.mass, material: physics.materials.object })
    this.chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, l / 2)))
    this.chassisBody.position.copy(this.spawn)
    this.chassisBody.angularDamping = 0.35
    this.chassisBody.linearDamping = 0.02
    this.chassisBody.allowSleep = false
    this.chassisBody.userData = { kind: 'car' }

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    })

    const wheelOptions = {
      radius: CAR.wheelRadius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 70,
      suspensionRestLength: CAR.restLength,
      frictionSlip: 3,
      dampingRelaxation: 3,
      dampingCompression: 5,
      maxSuspensionForce: 100000,
      rollInfluence: 0.01,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      maxSuspensionTravel: 0.25,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    }

    // Order: front-left, front-right, rear-left, rear-right
    const positions = [
      [-CAR.axleX, 0, CAR.frontZ],
      [CAR.axleX, 0, CAR.frontZ],
      [-CAR.axleX, 0, CAR.rearZ],
      [CAR.axleX, 0, CAR.rearZ],
    ]
    for (const p of positions) {
      wheelOptions.chassisConnectionPointLocal.set(p[0], p[1], p[2])
      this.vehicle.addWheel(wheelOptions)
    }
    this.vehicle.addToWorld(this.world)

    this.steer = 0
    this.speed = 0
    this.forwardSpeed = 0
    this.jumpTimer = 0
    this.flipTimer = 0
    this.grounded = false
    this._forward = new CANNON.Vec3()
    this._up = new CANNON.Vec3()
    this._tmp = new CANNON.Vec3()
  }

  get position() { return this.chassisBody.position }
  get velocity() { return this.chassisBody.velocity }

  /** Yaw of the chassis around Y (radians). */
  get yaw() {
    const q = this.chassisBody.quaternion
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z))
  }

  /**
   * @param dt seconds
   * @param input { throttle: -1..1, steer: -1..1 (+1 = left), boost, brake }
   * @returns events: { jumped, drifting }
   */
  update(dt, input) {
    const v = this.vehicle
    const body = this.chassisBody

    // Local forward (-Z) in world space
    body.vectorToWorldFrame(new CANNON.Vec3(0, 0, -1), this._forward)
    body.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), this._up)
    this.speed = body.velocity.length()
    this.forwardSpeed = body.velocity.dot(this._forward)

    let contacts = 0
    for (const w of v.wheelInfos) if (w.isInContact) contacts++
    this.grounded = contacts >= 2

    // Steering: smoother and tighter at low speed
    const speedFactor = Math.max(0.35, 1 - Math.abs(this.forwardSpeed) / 45)
    const targetSteer = input.steer * CAR.maxSteer * speedFactor
    const steerRate = 1 - Math.exp(-dt * 10)
    this.steer += (targetSteer - this.steer) * steerRate
    v.setSteeringValue(this.steer, 0)
    v.setSteeringValue(this.steer, 1)

    // Throttle / brake
    let force = 0
    let brake = 0
    const limit = input.boost ? CAR.maxBoostSpeed : CAR.maxSpeed
    if (input.throttle > 0.05) {
      if (this.forwardSpeed < -1.5) brake = CAR.brakeForce // reversing: brake first
      else if (this.forwardSpeed < limit) force = CAR.engineForce * input.throttle * (input.boost ? CAR.boostMultiplier : 1)
    } else if (input.throttle < -0.05) {
      if (this.forwardSpeed > 1.5) brake = CAR.brakeForce
      else if (this.forwardSpeed > -CAR.maxSpeed * 0.5) force = CAR.engineForce * input.throttle * CAR.reverseMultiplier
    } else {
      brake = CAR.idleBrake
    }
    if (input.brake) { brake = CAR.brakeForce; force = 0 }

    // Engine force sign (verified in Node): positive drives toward -Z, which is the nose.
    for (let i = 0; i < 4; i++) {
      v.applyEngineForce(force, i)
      v.setBrake(brake, i)
    }

    // Jump
    this.jumpTimer = Math.max(0, this.jumpTimer - dt)
    let jumped = false
    if (input.jump && this.grounded && this.jumpTimer === 0) {
      body.applyImpulse(new CANNON.Vec3(0, CAR.mass * CAR.jumpImpulse, 0), body.position)
      this.jumpTimer = CAR.jumpCooldown
      jumped = true
    }

    // Flip recovery: upside down for a while -> right it in place
    if (this._up.y < 0.15 && this.speed < 2) this.flipTimer += dt
    else this.flipTimer = 0
    if (this.flipTimer > 1.5) {
      this.reset(body.position.x, body.position.z, this.yaw)
      this.flipTimer = 0
    }

    // Fell off the world
    if (body.position.y < -8) this.respawn()

    // Safety net: a deep overlap (a teleport onto a prop, say) can make the solver fling the car.
    // Clamp rather than let it disappear into the sky.
    if (this.speed > CAR.maxLaunchSpeed) body.velocity.scale(CAR.maxLaunchSpeed / this.speed, body.velocity)
    if (body.velocity.y > CAR.maxRiseSpeed) body.velocity.y = CAR.maxRiseSpeed
    if (body.angularVelocity.length() > 12) body.angularVelocity.scale(12 / body.angularVelocity.length(), body.angularVelocity)

    const lateral = Math.abs(body.velocity.dot(this._tmp.copy(this._forward).cross(this._up))) 
    const drifting = this.grounded && this.speed > 6 && (lateral > 4 || (input.brake && this.speed > 8))
    return { jumped, drifting }
  }

  reset(x, z, yaw = 0) {
    const body = this.chassisBody
    body.position.set(x, 1.3, z)
    body.velocity.setZero()
    body.angularVelocity.setZero()
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw)
    body.wakeUp()
    this.steer = 0
  }

  respawn() {
    this.reset(this.spawn.x, this.spawn.z, this.spawnYaw)
  }

  teleport(x, z, yaw = 0) {
    this.reset(x, z, yaw)
  }
}
