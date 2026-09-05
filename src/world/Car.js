import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CarPhysics, CAR } from './CarPhysics.js'
import { flat, palette, shadowed, applyShadowFlags } from './Materials.js'

/**
 * The visitor's car: primitive low-poly rover driven by CarPhysics. Rover blue is the one
 * saturated blue in the world; the cabin, skirt and mirrors are ink, the stripe and hubs cream.
 */
export class Car {
  constructor(world, { spawn = [0, 1.2, 0], color = palette.rover } = {}) {
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
    const skirt = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w * 1.02, 0.22, l * 1.04, 2, 0.08), flat(palette.ink)))
    skirt.position.y = -0.24
    this.shell.add(skirt)

    // Cabin
    const cabin = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w * 0.78, 0.5, l * 0.46, 3, 0.16), flat(palette.ink)))
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

    // Windshield: the one genuinely new draw call, since glass needs its own transparent material.
    const windshield = shadowed(new THREE.Mesh(
      new RoundedBoxGeometry(w * 0.72, 0.4, 0.08, 2, 0.03),
      flat(palette.glass, { roughness: 0.15, transparent: true, opacity: 0.55 }),
    ))
    windshield.position.set(0, h / 2 + 0.22, -l * 0.06)
    windshield.rotation.x = -0.25
    this.shell.add(windshield)

    // Everything else added here shares the charcoal or body-colour material and never moves
    // relative to the shell, so each group is merged into a single mesh.
    const charcoalParts = []
    for (const sx of [-1, 1]) {
      const mirror = new THREE.BoxGeometry(0.09, 0.08, 0.17)
      mirror.translate(sx * (w / 2 + 0.06), h / 2 + 0.12, -l * 0.12)
      charcoalParts.push(mirror)
      const stalk = new THREE.BoxGeometry(0.06, 0.04, 0.06)
      stalk.translate(sx * (w / 2 - 0.02), h / 2 + 0.12, -l * 0.12)
      charcoalParts.push(stalk)
      const strut = new THREE.BoxGeometry(0.07, 0.26, 0.07)
      strut.translate(sx * 0.36, h / 2 + 0.34, l / 2 - 0.18)
      charcoalParts.push(strut)
    }
    const exhaust = new THREE.CylinderGeometry(0.05, 0.06, 0.24, 6)
    exhaust.rotateX(Math.PI / 2)
    exhaust.translate(w / 2 - 0.22, -0.2, l / 2 + 0.1)
    charcoalParts.push(exhaust)
    const grille = new THREE.BoxGeometry(w * 0.5, 0.12, 0.06)
    grille.translate(0, -0.02, -l / 2 - 0.04)
    charcoalParts.push(grille)
    this.shell.add(new THREE.Mesh(mergeGeometries(charcoalParts), flat(palette.ink)))

    // Spoiler and a racing stripe down the spine, both in the body colour.
    const bodyColourParts = []
    const spoiler = new THREE.BoxGeometry(w * 0.62, 0.07, 0.2)
    spoiler.translate(0, h / 2 + 0.48, l / 2 - 0.18)
    bodyColourParts.push(spoiler)
    this.shell.add(new THREE.Mesh(mergeGeometries(bodyColourParts), flat(this.color, { roughness: 0.55 })))

    // Racing stripe painted on the surfaces it actually lies on: the bonnet ahead of the cabin
    // and the roof. One straight bar across both would float above the bonnet.
    const stripeParts = []
    const bonnet = new THREE.BoxGeometry(0.2, 0.03, l * 0.3)
    bonnet.translate(0, h / 2 - 0.01, -l * 0.33)
    stripeParts.push(bonnet)
    const roofStripe = new THREE.BoxGeometry(0.2, 0.03, l * 0.34)
    roofStripe.translate(0, h / 2 + 0.47, 0.12)
    stripeParts.push(roofStripe)
    const boot = new THREE.BoxGeometry(0.2, 0.03, l * 0.16)
    boot.translate(0, h / 2 - 0.01, l * 0.36)
    stripeParts.push(boot)
    this.shell.add(new THREE.Mesh(mergeGeometries(stripeParts), flat(palette.cream)))

    // Antenna with a little ball
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5), flat(palette.ink))
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
      const tyre = shadowed(new THREE.Mesh(tyreGeo, flat(palette.ink)))
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
