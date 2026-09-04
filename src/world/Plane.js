// src/world/Plane.js
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CANNON } from '../core/Physics.js'
import { PlanePhysics, PLANE } from './PlanePhysics.js'
import { flat, palette, applyShadowFlags } from './Materials.js'
import { labelMesh } from './Text.js'

/** Cessna-like high-wing single-engine, built entirely from primitives. */
export class Plane {
  constructor(world, { spawn = [17, PLANE.groundY, -6] } = {}) {
    this.world = world
    this.physics = new PlanePhysics({ spawn })
    this.group = new THREE.Group()
    this.group.name = 'plane'
    this._build()
    world.scene.add(this.group)

    const { w, h, l } = PLANE.size
    this.body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, l / 2)) })
    this.body.position.set(spawn[0], spawn[1], spawn[2])
    this.body.userData = { kind: 'plane', tag: 'plane' }
    world.physics.add(this.body, this.group)
    world.physics.listenImpacts(this.body, 3, { tag: 'plane' })
  }

  _build() {
    const cream = flat(palette.cream)
    const trim = flat(palette.cobalt)
    const finStripe = flat(palette.terracotta)
    const ink = flat(palette.ink)

    const bodyParts = []
    const fuse = new THREE.CylinderGeometry(0.55, 0.75, 5.2, 10)
    fuse.rotateZ(Math.PI / 2)
    bodyParts.push(fuse)
    const noseCone = new THREE.ConeGeometry(0.55, 1.1, 10)
    noseCone.rotateZ(-Math.PI / 2)
    noseCone.translate(-3.15, 0, 0)
    bodyParts.push(noseCone)
    const cowl = new THREE.CylinderGeometry(0.7, 0.55, 0.6, 10)
    cowl.rotateZ(Math.PI / 2)
    cowl.translate(-2.7, 0, 0)
    const tailplane = new THREE.BoxGeometry(0.5, 0.12, 2.2)
    tailplane.translate(2.6, 0.1, 0)
    bodyParts.push(tailplane)
    const wheelPantL = new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8)
    wheelPantL.translate(-0.6, -0.9, 0.9)
    const wheelPantR = wheelPantL.clone()
    wheelPantR.translate(0, 0, -1.8)
    const body = new THREE.Mesh(mergeGeometries(bodyParts), cream)
    this.group.add(body)

    // Cowling and both wheel pants share the trim material and never move relative to the
    // fuselage, so they merge into one mesh.
    const trimParts = new THREE.Mesh(mergeGeometries([cowl, wheelPantL, wheelPantR]), trim)
    this.group.add(trimParts)

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.9), cream)
    fin.position.set(2.6, 0.75, 0)
    this.group.add(fin)
    const finStripeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.9), finStripe)
    finStripeMesh.position.set(2.6, 0.45, 0)
    this.group.add(finStripeMesh)

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      flat(palette.glass, { roughness: 0.15, transparent: true, opacity: 0.75 }),
    )
    canopy.position.set(-0.6, 0.65, 0)
    this.group.add(canopy)

    const wing = new THREE.Mesh(new RoundedBoxGeometry(8.6, 0.16, 1.3, 2, 0.06), cream)
    wing.position.set(-0.3, 0.85, 0)
    this.group.add(wing)
    // The camera looks down on the plane, so the top surfaces carry the paint scheme: cobalt
    // wing tips, a cobalt spine down the fuselage, and a terracotta flash across the wing.
    const stripeParts = []
    for (const sx of [-1, 1]) {
      const s = new THREE.BoxGeometry(1, 0.18, 1.32)
      s.translate(-0.3 + sx * 3.8, 0.85, 0)
      stripeParts.push(s)
    }
    const spine = new THREE.BoxGeometry(4.6, 0.12, 0.34)
    spine.translate(0.2, 0.72, 0)
    stripeParts.push(spine)
    this.group.add(new THREE.Mesh(mergeGeometries(stripeParts), trim))

    const flashParts = []
    for (const sx of [-1, 1]) {
      const f = new THREE.BoxGeometry(0.42, 0.19, 1.32)
      f.translate(-0.3 + sx * 2.2, 0.85, 0)
      flashParts.push(f)
    }
    this.group.add(new THREE.Mesh(mergeGeometries(flashParts), finStripe))

    const strutParts = []
    for (const sz of [-1, 1]) {
      const strut = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6)
      strut.rotateX(sz * 0.35)
      strut.translate(-0.3, 0.3, sz * 0.55)
      strutParts.push(strut)
    }
    this.group.add(new THREE.Mesh(mergeGeometries(strutParts), ink))

    // Hub and both blades spin together, so they are one merged mesh rotated as a unit.
    const hub = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8)
    hub.rotateZ(Math.PI / 2)
    const bladeA = new THREE.BoxGeometry(0.14, 1.3, 0.04)
    const bladeB = new THREE.BoxGeometry(0.14, 1.3, 0.04)
    bladeB.rotateX(Math.PI / 2)
    this.propHub = new THREE.Mesh(mergeGeometries([hub, bladeA, bladeB]), ink)
    this.propHub.position.set(-3.4, 0, 0)
    this.group.add(this.propHub)

    const reg = labelMesh('VT-VED', { width: 1.6, height: 0.4, color: palette.ink, background: palette.cream, fontSize: 0.28, weight: 800 })
    for (const sz of [-1, 1]) {
      const l = reg.clone()
      l.position.set(0.6, 0.2, sz * 0.76)
      l.rotation.y = sz > 0 ? -Math.PI / 2 : Math.PI / 2
      this.group.add(l)
    }

    applyShadowFlags(this.group)
    this.propRotation = 0
  }

  update(dt, input) {
    const events = this.physics.update(dt, input)
    this.body.velocity.copy(this.physics.velocity)
    this.body.quaternion.copy(this.physics.quaternion)
    this.body.position.copy(this.physics.position)
    this.propRotation += dt * (4 + this.physics.speed * 3)
    this.propHub.rotation.x = this.propRotation
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
  }
}
