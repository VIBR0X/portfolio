import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CarPhysics, CAR } from './CarPhysics.js'
import { flat, palette, shadowed, applyShadowFlags } from './Materials.js'

/**
 * The visitor's car: primitive low-poly mesh driven by CarPhysics.
 */
export class Car {
  constructor(world, { spawn = [0, 1.2, 0], color = palette.coral } = {}) {
    this.world = world
    this.physics = new CarPhysics(world.physics, { spawn })
    this.color = color
    this.group = new THREE.Group()
    this.group.name = 'car'
    this.shell = new THREE.Group() // everything that squashes and stretches
    this.group.add(this.shell)
    this.wheels = []
    this._build()
    world.scene.add(this.group)
    this.headlightsOn = true
    this.squash = { t: 0, from: new THREE.Vector3(1, 1, 1), dur: 0.2 }
    this._wasGrounded = true
    this._prevVy = 0
  }

  _build() {
    const { w, h, l } = CAR.chassis
    const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, l, 3, 0.14), flat(this.color, { roughness: 0.55 })))
    body.position.y = -0.02
    this.shell.add(body)
    this.body = body

    // Lower skirt / bumpers
    const skirt = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w * 1.02, 0.22, l * 1.04, 2, 0.08), flat(palette.charcoal)))
    skirt.position.y = -0.24
    this.shell.add(skirt)

    // Cabin
    const cabin = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w * 0.78, 0.5, l * 0.46, 3, 0.16), flat(palette.charcoal)))
    cabin.position.set(0, h / 2 + 0.16, 0.12)
    this.shell.add(cabin)
    const roof = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w * 0.7, 0.08, l * 0.36, 2, 0.03), flat(this.color, { roughness: 0.55 })))
    roof.position.set(0, h / 2 + 0.44, 0.12)
    this.shell.add(roof)

    // Headlights & tail lights
    const lampGeo = new THREE.BoxGeometry(0.28, 0.16, 0.08)
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(lampGeo, flat(palette.cream, { emissive: '#ffe9a8', emissiveIntensity: 0.8 }))
      head.position.set(sx * (w / 2 - 0.3), 0.04, -l / 2 - 0.02)
      this.shell.add(head)
      const tail = new THREE.Mesh(lampGeo, flat(palette.clay, { emissive: '#ff3b2f', emissiveIntensity: 0.6 }))
      tail.position.set(sx * (w / 2 - 0.3), 0.04, l / 2 + 0.02)
      this.shell.add(tail)
    }

    // Boost flames (only visible while boosting)
    this.flames = []
    const flameGeo = new THREE.ConeGeometry(0.12, 0.6, 6)
    flameGeo.rotateX(Math.PI / 2)
    for (const sx of [-0.28, 0.28]) {
      const f = new THREE.Mesh(flameGeo, flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.9 }))
      f.position.set(sx, -0.12, l / 2 + 0.35)
      f.visible = false
      this.group.add(f)
      this.flames.push(f)
    }

    // Antenna with a little ball
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5), flat(palette.charcoal))
    antenna.position.set(-w / 2 + 0.18, h / 2 + 0.4, l / 2 - 0.35)
    this.shell.add(antenna)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), flat(palette.terracotta))
    ball.position.set(-w / 2 + 0.18, h / 2 + 0.88, l / 2 - 0.35)
    this.shell.add(ball)

    // Wheels (separate objects, driven by the raycast vehicle transforms)
    const tyreGeo = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, CAR.wheelWidth, 14)
    tyreGeo.rotateZ(Math.PI / 2)
    const hubGeo = new THREE.CylinderGeometry(CAR.wheelRadius * 0.55, CAR.wheelRadius * 0.55, CAR.wheelWidth + 0.04, 8)
    hubGeo.rotateZ(Math.PI / 2)
    for (let i = 0; i < 4; i++) {
      const wheel = new THREE.Group()
      const tyre = shadowed(new THREE.Mesh(tyreGeo, flat(palette.charcoal)))
      const hub = new THREE.Mesh(hubGeo, flat(palette.cream))
      wheel.add(tyre, hub)
      this.world.scene.add(wheel)
      this.wheels.push(wheel)
    }

    applyShadowFlags(this.group)
    for (const wheel of this.wheels) applyShadowFlags(wheel)
  }

  get position() { return this.group.position }

  /** Wheels are separate scene objects driven by the vehicle transforms, so they need hiding too. */
  setVisible(visible) {
    this.group.visible = visible
    for (const wheel of this.wheels) wheel.visible = visible
  }

  update(dt, input) {
    const vyBefore = this.physics.chassisBody.velocity.y
    const events = this.physics.update(dt, input)
    const body = this.physics.chassisBody
    this.group.position.copy(body.position)
    this.group.quaternion.copy(body.quaternion)

    // Squash on landing, stretch on jump
    const grounded = this.physics.grounded
    if (grounded && !this._wasGrounded && this._prevVy < -3) {
      this.squash.from.set(1.08, 0.88, 1.08)
      this.squash.t = this.squash.dur = 0.22
      events.landed = -this._prevVy
    }
    if (events.jumped) {
      this.squash.from.set(0.94, 1.1, 0.94)
      this.squash.t = this.squash.dur = 0.12
    }
    this._wasGrounded = grounded
    this._prevVy = Math.min(vyBefore, body.velocity.y)
    if (this.squash.t > 0) {
      this.squash.t = Math.max(0, this.squash.t - dt)
      const k = this.squash.t / this.squash.dur
      const e = k * k
      this.shell.scale.set(1 + (this.squash.from.x - 1) * e, 1 + (this.squash.from.y - 1) * e, 1 + (this.squash.from.z - 1) * e)
    } else if (this.shell.scale.x !== 1) {
      this.shell.scale.set(1, 1, 1)
    }

    // Boost flames
    const boosting = !!input.boost && this.physics.speed > 2 && input.throttle > 0.05
    for (const f of this.flames) {
      f.visible = boosting
      if (boosting) f.scale.setScalar(1 + 0.3 * Math.sin(performance.now() * 0.04))
    }
    const v = this.physics.vehicle
    for (let i = 0; i < 4; i++) {
      v.updateWheelTransform(i)
      const t = v.wheelInfos[i].worldTransform
      this.wheels[i].position.copy(t.position)
      this.wheels[i].quaternion.copy(t.quaternion)
    }
    return events
  }

  respawn() { this.physics.respawn() }
  teleport(x, z, yaw) { this.physics.teleport(x, z, yaw) }
}
