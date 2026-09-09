import * as CANNON from 'cannon-es'
import { EventEmitter } from './EventEmitter.js'

/**
 * cannon-es world wrapper. Keeps mesh/body pairs in sync and forwards impact events.
 * Emits 'impact' ({ body, target, speed }) for bodies registered with listenImpacts().
 */
export class Physics extends EventEmitter {
  constructor() {
    super()
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) })
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = true
    this.world.defaultContactMaterial.friction = 0.45
    this.world.defaultContactMaterial.restitution = 0.15
    this.world.defaultContactMaterial.contactEquationStiffness = 1e7
    this.world.defaultContactMaterial.contactEquationRelaxation = 3

    this.materials = {
      ground: new CANNON.Material('ground'),
      object: new CANNON.Material('object'),
      wheel: new CANNON.Material('wheel'),
    }
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.ground, this.materials.object, { friction: 0.5, restitution: 0.12 }))
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.object, this.materials.object, { friction: 0.4, restitution: 0.2 }))
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.wheel, this.materials.ground, { friction: 0.3, restitution: 0 }))

    const ground = new CANNON.Body({ mass: 0, material: this.materials.ground, shape: new CANNON.Plane() })
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    ground.updateAABB() // cannon-es caches the AABB at construction; static bodies posed afterwards must refresh it
    ground.userData = { kind: 'ground' }
    this.world.addBody(ground)
    this.ground = ground

    this.pairs = []
    this.fixedStep = 1 / 60
    this.maxSubSteps = 4
  }

  /** Add a body; optionally keep `mesh` synced to it every step. */
  add(body, mesh = null) {
    this.world.addBody(body)
    if (mesh) this.pairs.push({ body, mesh })
    return body
  }

  remove(body) {
    this.world.removeBody(body)
    const i = this.pairs.findIndex((p) => p.body === body)
    if (i >= 0) this.pairs.splice(i, 1)
  }

  /** Emit 'impact' when `body` collides faster than `minSpeed`. */
  listenImpacts(body, minSpeed = 1.5, extra = {}) {
    body.addEventListener('collide', (e) => {
      const speed = Math.abs(e.contact.getImpactVelocityAlongNormal())
      if (speed < minSpeed) return
      this.emit('impact', { body, target: e.body, speed, ...extra })
    })
  }

  step(dt) {
    this.world.step(this.fixedStep, dt, this.maxSubSteps)
    for (const { body, mesh } of this.pairs) {
      // world.step(fixed, dt, maxSubSteps) already computes where each body is BETWEEN its 60 Hz
      // steps. Copying body.position instead advanced every mesh in 60 Hz stair-steps, so on a
      // 120 or 144 Hz panel one frame in two was a duplicate.
      mesh.position.copy(body.interpolatedPosition)
      mesh.quaternion.copy(body.interpolatedQuaternion)
    }
  }

  /* ---------------- body factories ---------------- */

  box({ size, mass = 1, position = [0, 0, 0], quaternion = null, material = this.materials.object, sleepy = true }) {
    const [w, h, d] = size
    const body = new CANNON.Body({ mass, material, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)) })
    body.position.set(position[0], position[1], position[2])
    if (quaternion) body.quaternion.copy(quaternion)
    body.updateAABB()
    if (sleepy) this._sleepy(body)
    return body
  }

  cylinder({ radiusTop, radiusBottom = radiusTop, height, segments = 10, mass = 1, position = [0, 0, 0], material = this.materials.object, sleepy = true }) {
    const body = new CANNON.Body({ mass, material, shape: new CANNON.Cylinder(radiusTop, radiusBottom, height, segments) })
    body.position.set(position[0], position[1], position[2])
    body.updateAABB()
    if (sleepy) this._sleepy(body)
    return body
  }

  sphere({ radius, mass = 1, position = [0, 0, 0], material = this.materials.object, sleepy = true }) {
    const body = new CANNON.Body({ mass, material, shape: new CANNON.Sphere(radius) })
    body.position.set(position[0], position[1], position[2])
    body.updateAABB()
    if (sleepy) this._sleepy(body)
    return body
  }

  /** Invisible static wall (axis-aligned box). */
  wall({ size, position }) {
    const body = this.box({ size, mass: 0, position, material: this.materials.ground, sleepy: false })
    body.userData = { kind: 'wall' }
    return body
  }

  _sleepy(body) {
    body.allowSleep = true
    body.sleepSpeedLimit = 0.35
    body.sleepTimeLimit = 0.6
    body.linearDamping = 0.08
    body.angularDamping = 0.2
  }
}

export { CANNON }
