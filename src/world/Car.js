import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CarPhysics, CAR } from './CarPhysics.js'
import { flat, palette, shadowed } from './Materials.js'

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
    this.wheels = []
    this._build()
    world.scene.add(this.group)
    this.headlightsOn = true
  }

  _build() {
    const { w, h, l } = CAR.chassis
    const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, l, 3, 0.14), flat(this.color)))
    body.position.y = -0.02
    this.group.add(body)
    this.body = body

    // Lower skirt / bumpers
    const skirt = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w * 1.02, 0.22, l * 1.04, 2, 0.08), flat(palette.charcoal)))
    skirt.position.y = -0.24
    this.group.add(skirt)

    // Cabin
    const cabin = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w * 0.78, 0.5, l * 0.46, 3, 0.16), flat(palette.charcoal)))
    cabin.position.set(0, h / 2 + 0.16, 0.12)
    this.group.add(cabin)
    const roof = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w * 0.7, 0.08, l * 0.36, 2, 0.03), flat(this.color)))
    roof.position.set(0, h / 2 + 0.44, 0.12)
    this.group.add(roof)

    // Headlights & tail lights
    const lampGeo = new THREE.BoxGeometry(0.28, 0.16, 0.08)
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(lampGeo, flat(palette.cream, { emissive: '#ffe9a8', emissiveIntensity: 0.8 }))
      head.position.set(sx * (w / 2 - 0.3), 0.04, -l / 2 - 0.02)
      this.group.add(head)
      const tail = new THREE.Mesh(lampGeo, flat(palette.coralDark, { emissive: '#ff3b2f', emissiveIntensity: 0.6 }))
      tail.position.set(sx * (w / 2 - 0.3), 0.04, l / 2 + 0.02)
      this.group.add(tail)
    }

    // Antenna with a little ball
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5), flat(palette.charcoal))
    antenna.position.set(-w / 2 + 0.18, h / 2 + 0.4, l / 2 - 0.35)
    this.group.add(antenna)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), flat(palette.amber))
    ball.position.set(-w / 2 + 0.18, h / 2 + 0.88, l / 2 - 0.35)
    this.group.add(ball)

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
  }

  get position() { return this.group.position }

  update(dt, input) {
    const events = this.physics.update(dt, input)
    const body = this.physics.chassisBody
    this.group.position.copy(body.position)
    this.group.quaternion.copy(body.quaternion)
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
