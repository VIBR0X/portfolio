import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CarPhysics, CAR } from './CarPhysics.js'
import { flat, palette, shadowed, applyShadowFlags } from './Materials.js'

/** Merge same-material parts; RoundedBoxGeometry is non-indexed, so everything is made so first. */
function merge(geometries) {
  return mergeGeometries(geometries.map((g) => (g.index ? g.toNonIndexed() : g)))
}

/** Give every vertex of `geometry` the colour `hex`, for merging parts of different colours. */
function tint(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

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
    const bodyMat = flat(this.color, { roughness: 0.55 })
    const charcoal = flat(palette.charcoal)

    // Everything below is grouped by material and merged, so the car costs eight draw calls
    // instead of twenty-two: body colour, charcoal, headlights, tail lights, windshield, stripe,
    // antenna ball and one instanced mesh for the four wheels. Squash and stretch act on `shell`.
    const bodyParts = []
    const body = new RoundedBoxGeometry(w, h, l, 3, 0.14)
    body.translate(0, -0.02, 0)
    bodyParts.push(body)
    const roof = new RoundedBoxGeometry(w * 0.7, 0.08, l * 0.36, 2, 0.03)
    roof.translate(0, h / 2 + 0.44, 0.12)
    bodyParts.push(roof)
    const spoiler = new THREE.BoxGeometry(w * 0.62, 0.07, 0.2)
    spoiler.translate(0, h / 2 + 0.48, l / 2 - 0.18)
    bodyParts.push(spoiler)
    this.body = shadowed(new THREE.Mesh(merge(bodyParts), bodyMat))
    this.shell.add(this.body)

    // Charcoal: lower skirt, cabin, mirrors, spoiler struts, exhaust, grille, antenna.
    const charcoalParts = []
    const skirt = new RoundedBoxGeometry(w * 1.02, 0.22, l * 1.04, 2, 0.08)
    skirt.translate(0, -0.24, 0)
    charcoalParts.push(skirt)
    const cabin = new RoundedBoxGeometry(w * 0.78, 0.5, l * 0.46, 3, 0.16)
    cabin.translate(0, h / 2 + 0.16, 0.12)
    charcoalParts.push(cabin)
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
    const antenna = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5)
    antenna.translate(-w / 2 + 0.18, h / 2 + 0.4, l / 2 - 0.35)
    charcoalParts.push(antenna)
    this.shell.add(shadowed(new THREE.Mesh(merge(charcoalParts), charcoal)))

    // Headlights and tail lights: one mesh per emissive material.
    const heads = []
    const tails = []
    for (const sx of [-1, 1]) {
      const head = new THREE.BoxGeometry(0.28, 0.16, 0.08)
      head.translate(sx * (w / 2 - 0.3), 0.04, -l / 2 - 0.02)
      heads.push(head)
      const tail = new THREE.BoxGeometry(0.28, 0.16, 0.08)
      tail.translate(sx * (w / 2 - 0.3), 0.04, l / 2 + 0.02)
      tails.push(tail)
    }
    this.shell.add(new THREE.Mesh(merge(heads), flat(palette.cream, { emissive: '#ffe9a8', emissiveIntensity: 0.8 })))
    this.shell.add(new THREE.Mesh(merge(tails), flat(palette.clay, { emissive: '#ff3b2f', emissiveIntensity: 0.6 })))

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

    // Windshield: glass needs its own transparent material.
    const windshield = shadowed(new THREE.Mesh(
      new RoundedBoxGeometry(w * 0.72, 0.4, 0.08, 2, 0.03),
      flat(palette.glass, { roughness: 0.15, transparent: true, opacity: 0.55 }),
    ))
    windshield.position.set(0, h / 2 + 0.22, -l * 0.06)
    windshield.rotation.x = -0.25
    this.shell.add(windshield)

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
    this.shell.add(new THREE.Mesh(merge(stripeParts), flat(palette.cream)))

    // Antenna ball
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), flat(palette.terracotta))
    ball.position.set(-w / 2 + 0.18, h / 2 + 0.88, l / 2 - 0.35)
    this.shell.add(ball)

    // Wheels: tyre and hub merged with vertex colours into one geometry, drawn as four instances
    // whose matrices follow the raycast vehicle's wheel transforms every frame.
    const tyreGeo = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, CAR.wheelWidth, 14)
    tyreGeo.rotateZ(Math.PI / 2)
    const hubGeo = new THREE.CylinderGeometry(CAR.wheelRadius * 0.55, CAR.wheelRadius * 0.55, CAR.wheelWidth + 0.04, 8)
    hubGeo.rotateZ(Math.PI / 2)
    const wheelGeo = merge([tint(tyreGeo, palette.ink), tint(hubGeo, palette.cream)])
    this.wheels = shadowed(new THREE.InstancedMesh(wheelGeo, flat('#FFFFFF', { vertexColors: true }), 4))
    this.wheels.name = 'car-wheels'
    this.wheels.frustumCulled = false
    this.world.scene.add(this.wheels)
    this._wheelM = new THREE.Matrix4()
    this._wheelP = new THREE.Vector3()
    this._wheelQ = new THREE.Quaternion()
    this._wheelS = new THREE.Vector3(1, 1, 1)

    applyShadowFlags(this.group)
    applyShadowFlags(this.wheels)
  }

  get position() { return this.group.position }

  /** The wheels are a separate scene object driven by the vehicle transforms, so they need hiding too. */
  setVisible(visible) {
    this.group.visible = visible
    this.wheels.visible = visible
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
      this._wheelP.set(t.position.x, t.position.y, t.position.z)
      this._wheelQ.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w)
      this._wheelM.compose(this._wheelP, this._wheelQ, this._wheelS)
      this.wheels.setMatrixAt(i, this._wheelM)
    }
    this.wheels.instanceMatrix.needsUpdate = true
    return events
  }

  respawn() { this.physics.respawn() }
  teleport(x, z, yaw) { this.physics.teleport(x, z, yaw) }
}
