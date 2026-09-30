// src/world/Plane.js
import { CANNON } from '../core/Physics.js'
import { PlanePhysics, PLANE } from './PlanePhysics.js'
import { buildPlaneMesh } from './props/PlaneModel.js'

/** Disc swap: above this ground speed the blade prop hides and the translucent disc shows. */
const DISC_SPEED = 8

/**
 * The flyable plane: the shared `buildPlaneMesh` model on a kinematic body driven by `PlanePhysics`.
 * The body carries the true attitude; the child `shell` adds a visual exaggeration on top (20% more
 * bank, ±0.15 rad of pitch while climbing or sinking faster than 1 m/s).
 */
export class Plane {
  constructor(world, { spawn = PLANE.spawn, spawnYaw = PLANE.spawnYaw } = {}) {
    this.world = world
    this.physics = new PlanePhysics({ spawn, spawnYaw })
    const m = buildPlaneMesh()
    this.group = m.group
    this.shell = m.shell
    this.propHub = m.propHub
    this.propDisc = m.propDisc
    this.lamps = m.lamps
    this.propRotation = 0
    world.scene.add(this.group)

    const { w, h, l } = PLANE.size
    this.body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, l / 2)) })
    this.body.position.set(spawn[0], spawn[1], spawn[2])
    this.body.quaternion.copy(this.physics.quaternion)
    this.group.quaternion.copy(this.physics.quaternion)
    this.body.userData = { kind: 'plane', tag: 'plane' }
    world.physics.add(this.body, this.group)
    world.physics.listenImpacts(this.body, 3, { tag: 'plane' })
  }

  update(dt, input) {
    const events = this.physics.update(dt, input)
    this.body.velocity.copy(this.physics.velocity)
    this.body.quaternion.copy(this.physics.quaternion)
    this.body.position.copy(this.physics.position)
    const speed = this.physics.speed
    this.propRotation += dt * (4 + speed * 3)
    this.propHub.rotation.z = this.propRotation
    this.propHub.visible = speed < DISC_SPEED
    this.propDisc.visible = speed >= DISC_SPEED
    const vy = this.physics.vy
    const extraPitch = Math.abs(vy) > 1 ? 0.15 * Math.sign(vy) : 0
    this.shell.rotation.set(extraPitch, 0, this.physics.bank * 0.2, 'YXZ')
    return events
  }

  get position() { return this.physics.position }
  get speed() { return this.physics.speed }
  get grounded() { return this.physics.grounded }
  get _lastVy() { return this.physics._lastVy }

  teleport(x, z, yaw = 0) {
    this.physics.position.set(x, PLANE.groundY, z)
    this.physics.speed = 0
    this.physics.pitch = 0
    this.physics.bank = 0
    this.physics.vy = 0
    this.physics.airborne = false
    this.physics.yaw = yaw
    this.body.position.copy(this.physics.position)
    this.body.quaternion.copy(this.physics.quaternion)
    this.shell.rotation.set(0, 0, 0)
  }
}
