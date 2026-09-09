import * as THREE from 'three'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
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
    const blue = flat(this.color, { roughness: 0.55 })
    const ink = flat(palette.ink)

    // A Mars buggy, not a road car: an open deck on an exposed chassis, a roll cage carrying a
    // solar panel, a single seat, a camera mast and a comms whip. Parts are grouped by material and
    // merged, so the whole vehicle is nine draw calls. Squash and stretch act on `shell`.
    const bodyParts = []
    const deck = new RoundedBoxGeometry(w * 0.88, 0.16, l * 0.9, 3, 0.06)
    deck.translate(0, 0.02, 0)
    bodyParts.push(deck)
    for (const sx of [-1, 1]) { // battery pods along the flanks
      const pod = new RoundedBoxGeometry(0.22, 0.3, 1.5, 2, 0.07)
      pod.translate(sx * (w / 2 - 0.13), -0.13, 0.1)
      bodyParts.push(pod)
    }
    const rack = new RoundedBoxGeometry(w * 0.72, 0.1, 0.72, 2, 0.04) // rear cargo rack
    rack.translate(0, 0.16, l / 2 - 0.42)
    bodyParts.push(rack)
    this.body = shadowed(new THREE.Mesh(merge(bodyParts), blue))
    this.shell.add(this.body)

    // Ink: the chassis tub, the suspension arms and the seat squab — the parts in shadow anyway.
    const inkParts = []
    const tub = new RoundedBoxGeometry(w * 0.66, 0.26, l * 0.66, 2, 0.06)
    tub.translate(0, -0.22, 0)
    inkParts.push(tub)
    const CAGE_Y = 0.9
    const cageParts = []
    for (const sx of [-1, 1]) {
      for (const cz of [-0.2, 0.86]) { // four uprights
        const post = new THREE.CylinderGeometry(0.05, 0.05, CAGE_Y - 0.1, 6)
        post.translate(sx * (w / 2 - 0.2), (CAGE_Y - 0.1) / 2 + 0.1, cz)
        cageParts.push(post)
      }
      const rail = new THREE.BoxGeometry(0.08, 0.08, 1.06) // top rail fore-aft
      rail.translate(sx * (w / 2 - 0.2), CAGE_Y, 0.33)
      cageParts.push(rail)
      // suspension arms out to each wheel
      for (const wz of [CAR.frontZ, CAR.rearZ]) {
        const arm = new THREE.BoxGeometry(0.42, 0.07, 0.09)
        arm.translate(sx * 0.6, -0.24, wz)
        inkParts.push(arm)
      }
    }
    for (const cz of [-0.2, 0.86]) { // cross rails
      const cross = new THREE.BoxGeometry(w - 0.4, 0.08, 0.08)
      cross.translate(0, CAGE_Y, cz)
      cageParts.push(cross)
    }
    const mast = new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6) // camera mast
    mast.translate(-0.45, CAGE_Y + 0.28, -0.28)
    cageParts.push(mast)
    const whip = new THREE.CylinderGeometry(0.022, 0.022, 0.9, 5) // comms whip
    whip.translate(0.5, CAGE_Y + 0.45, 0.86)
    cageParts.push(whip)
    const squab = new RoundedBoxGeometry(0.54, 0.12, 0.52, 2, 0.04) // seat cushion
    squab.translate(0, 0.17, 0.24)
    inkParts.push(squab)
    this.shell.add(shadowed(new THREE.Mesh(merge(inkParts), ink)))

    // Cream carries the read from above: the cage, the bright nose plate that shows which way the
    // buggy faces, the seat back, the camera head and the solar array's frame.
    const creamParts = cageParts
    const nose = new RoundedBoxGeometry(w * 0.82, 0.14, 0.52, 2, 0.06)
    nose.rotateX(-0.22)
    nose.translate(0, 0.06, -l / 2 + 0.24)
    creamParts.push(nose)
    const back = new RoundedBoxGeometry(0.5, 0.46, 0.1, 2, 0.04)
    back.rotateX(0.16)
    back.translate(0, 0.42, 0.5)
    creamParts.push(back)
    const head = new THREE.BoxGeometry(0.22, 0.15, 0.15)
    head.translate(-0.45, CAGE_Y + 0.6, -0.28)
    creamParts.push(head)
    const frame = new THREE.BoxGeometry(w - 0.22, 0.04, 1.2) // solar array frame
    frame.translate(0, CAGE_Y + 0.06, 0.4)
    creamParts.push(frame)
    this.shell.add(shadowed(new THREE.Mesh(merge(creamParts), flat(palette.cream))))

    // The solar array across the cage, the one thing that says "this drives on Mars".
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.34, 0.04, 1.06), flat(palette.navy, { roughness: 0.5 }))
    panel.position.set(0, CAGE_Y + 0.1, 0.4)
    this.shell.add(shadowed(panel))

    // Headlights, tail lights, and the mast's camera lens.
    const heads = []
    const tails = []
    for (const sx of [-1, 1]) {
      const head2 = new THREE.BoxGeometry(0.22, 0.14, 0.08)
      head2.translate(sx * (w / 2 - 0.3), 0.06, -l / 2 + 0.02)
      heads.push(head2)
      const tail = new THREE.BoxGeometry(0.2, 0.12, 0.08)
      tail.translate(sx * (w / 2 - 0.3), 0.14, l / 2 - 0.06)
      tails.push(tail)
    }
    this.shell.add(new THREE.Mesh(merge(heads), flat(palette.cream, { emissive: '#ffe9a8', emissiveIntensity: 0.8 })))
    // A private clone: flat() hands out one shared material per key, so ramping the emissive on the
    // cached instance would light every clay-and-red mesh in the world with it.
    this.tailMaterial = flat(palette.clay, { emissive: '#ff3b2f', emissiveIntensity: 0.6 }).clone()
    this.shell.add(new THREE.Mesh(merge(tails), this.tailMaterial))
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.9 }))
    lens.position.set(-0.45, CAGE_Y + 0.6, -0.37)
    this.shell.add(lens)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), flat(palette.terracotta, { emissive: palette.terracotta, emissiveIntensity: 0.9 }))
    beacon.position.set(0.5, CAGE_Y + 0.9, 0.86)
    this.shell.add(beacon)

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

    // A low wind deflector in front of the seat — the only glass on an open vehicle.
    const deflector = shadowed(new THREE.Mesh(
      new RoundedBoxGeometry(0.86, 0.3, 0.06, 2, 0.03),
      flat(palette.glass, { roughness: 0.15, transparent: true, opacity: 0.55 }),
    ))
    deflector.position.set(0, 0.36, -0.28)
    deflector.rotation.x = -0.3
    this.shell.add(deflector)

    // Wheels: a treaded tyre and a pale hub, merged with vertex colours, drawn as four instances
    // whose matrices follow the raycast vehicle's wheel transforms every frame.
    const tyreGeo = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, CAR.wheelWidth, 12)
    tyreGeo.rotateZ(Math.PI / 2)
    const treads = [tyreGeo]
    for (let i = 0; i < 8; i++) { // cleats around the tyre, the way a rover wheel grips regolith
      const a = (i / 8) * Math.PI * 2
      const cleat = new THREE.BoxGeometry(CAR.wheelWidth + 0.03, 0.07, 0.16)
      cleat.translate(0, CAR.wheelRadius - 0.02, 0)
      cleat.rotateX(a)
      treads.push(cleat)
    }
    const hubGeo = new THREE.CylinderGeometry(CAR.wheelRadius * 0.5, CAR.wheelRadius * 0.5, CAR.wheelWidth + 0.05, 8)
    hubGeo.rotateZ(Math.PI / 2)
    const wheelGeo = merge([tint(merge(treads), palette.ink), tint(hubGeo, palette.cream)])
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
    // Pose from the interpolated transform, for the same reason Physics.step does (high-refresh
    // panels). World.update calls this BEFORE physics.step, while the car's blob shadow reads the
    // body after it, so the mesh used to trail its own shadow by 0.37 m at 22 m/s.
    this.group.position.copy(body.interpolatedPosition)
    this.group.quaternion.copy(body.interpolatedQuaternion)

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

    // Weight. The shell is a child group, so none of this touches the collider, CAR constants or any
    // physics gate — it is the body moving on its springs. At the fixed 43° camera the car is only
    // ~55 px wide, so the read is less the tilt itself than the shading change as the flat-shaded
    // navy solar panel and the cream nose plate swing out of the sun.
    const roll = -clamp(this.physics.lateral / 8, -1, 1) * 0.16
    const pitch = clamp(this.physics.accel / 10, -1, 1) * 0.09
    const k = 1 - Math.exp(-dt * 9)
    this.shell.rotation.z += (roll - this.shell.rotation.z) * k
    this.shell.rotation.x += (pitch - this.shell.rotation.x) * k
    this.shell.position.y += (-Math.abs(pitch) * 0.45 - this.shell.position.y) * k

    // Brake lights. Standing on the brakes, or reversing the throttle against the way you are going.
    const braking = !!input.brake || (input.throttle < -0.05 && this.physics.forwardSpeed > 1)
    const target = braking ? 2.4 : 0.6
    const m = this.tailMaterial
    m.emissiveIntensity += (target - m.emissiveIntensity) * (1 - Math.exp(-dt * (braking ? 26 : 9)))

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
