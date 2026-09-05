import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Section } from './Section.js'
import { resume } from '../../content/resume.js'
import { flat, palette } from '../Materials.js'
import { board } from '../Board.js'
import { labelMesh, floorLabel } from '../Text.js'
import { relayBeacon } from '../props/Beacon.js'

const COURSEWORK = ['COURSEWORK', 'machine learning', 'data analysis', 'optimisation', 'adaptive and learning control', 'control systems', 'flight dynamics']

/**
 * Control Tower: the degree on the tower's base board, the coursework on a rack of flight strips,
 * and the hackathon trophy on a podium under permanent confetti.
 */
export class EducationSection extends Section {
  constructor(world, def) {
    super(world, def)
    this.buildTower()
    this.buildRack()
    this.buildPodium()
    this.buildConfetti()
    this.buildPad()
    this.beaconPulse = 0
    this.strobe = 0
  }

  buildTower() {
    const { world } = this
    const g = new THREE.Group()
    g.position.set(0, 0, -104)

    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 5), flat(palette.concrete))
    base.position.y = 0.5
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 13, 8), flat(palette.concrete))
    shaft.position.y = 7.5
    const cabFloor = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.6, 8), flat(palette.cobalt))
    cabFloor.position.y = 14.3
    this.glass = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 2.4, 8, 1, true),
      flat(palette.glass, { transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 0.2 }),
    )
    this.glass.position.y = 15.8
    // Habitat parapet under the glazing, so the cab reads as a built shell and not a bare cylinder.
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 0.7, 8), flat(palette.habitat))
    cab.position.y = 14.95
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 1.4, 8), flat(palette.ink))
    roof.position.y = 17.7
    const catwalk = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.14, 5, 10), flat(palette.steel))
    catwalk.rotation.x = Math.PI / 2
    catwalk.position.y = 14.7
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 5), flat(palette.ink))
    antenna.position.y = 19.9
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.6 }))
    this.beacon.position.y = 21.5
    g.add(base, shaft, cabFloor, this.glass, cab, roof, catwalk, antenna, this.beacon)

    // Window-band ribs around the glazing, so the cab is not one blank cylinder.
    const ribParts = []
    for (const y of [14.9, 15.8, 16.7]) {
      const ring = new THREE.TorusGeometry(3.25, 0.06, 4, 10)
      ring.rotateX(Math.PI / 2)
      ring.translate(0, y, 0)
      ribParts.push(ring)
    }
    g.add(new THREE.Mesh(mergeGeometries(ribParts), flat(palette.ink)))

    // Vertical shaft ribs and alternating stair landings up the tower.
    const shaftParts = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const rib = new THREE.BoxGeometry(0.14, 13, 0.14)
      rib.translate(Math.cos(a) * 2.0, 7.5, Math.sin(a) * 2.0)
      shaftParts.push(rib)
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 * 1.5
      const step = new THREE.BoxGeometry(1, 0.1, 0.55)
      step.rotateY(-a)
      step.translate(Math.cos(a) * 2.3, 2.4 + i * 1.9, Math.sin(a) * 2.3)
      shaftParts.push(step)
    }
    g.add(new THREE.Mesh(mergeGeometries(shaftParts), flat(palette.concrete)))

    // Roof radar, the same shape Ground Control already uses.
    const radar = new THREE.Group()
    radar.position.set(1.1, 18.5, 1.1)
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 12), flat(palette.concrete))
    const dishArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), flat(palette.ink))
    dishArm.position.y = 0.3
    this.towerDish = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3),
      flat(palette.cream, { side: THREE.DoubleSide }),
    )
    this.towerDish.position.y = 0.5
    this.towerDish.rotation.x = Math.PI * 0.72
    radar.add(drum, dishArm, this.towerDish)
    g.add(radar)
    this.towerRadar = radar

    world.addStatic(g)
    // Relay beacon on the mast top, blinking on its own material.
    relayBeacon(world, { x: 0, y: 22.0, z: -104, phase: 0 })

    const body = world.physics.cylinder({ radiusTop: 2.2, radiusBottom: 2.6, height: 16, segments: 8, mass: 0, position: [0, 8, -104], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)

    const e = resume.education
    board(world, {
      x: 0, z: -99.4, width: 6, height: 2.6, bottom: 1.1,
      accent: palette.lamp, posts: false, physics: true, entry: 'education',
      title: e.shortSchool.toUpperCase(),
      subtitle: e.degree,
      body: [e.minor],
      titleSize: 0.5, bodySize: 0.22,
    })
  }

  /** Coursework as air-traffic flight strips on a rack. */
  buildRack() {
    const { world } = this
    const g = new THREE.Group()
    g.position.set(-9, 0, -98)
    for (const sx of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3, 0.16), flat(palette.ink))
      post.position.set(sx, 1.5, 0)
      g.add(post)
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.14, 0.2), flat(palette.ink))
    rail.position.y = 3
    g.add(rail)
    COURSEWORK.forEach((text, i) => {
      const strip = labelMesh(text, {
        width: 2.6, height: 0.42,
        color: i === 0 ? palette.terracotta : palette.ink,
        background: palette.cream, fontSize: i === 0 ? 0.2 : 0.17, weight: i === 0 ? 900 : 700,
      })
      strip.position.set(0, 2.7 - i * 0.36, 0.06)
      strip.rotation.z = (i % 2 ? 1 : -1) * 0.02
      g.add(strip)
    })
    world.addStatic(g)
    const body = world.physics.box({ size: [3, 3, 0.4], mass: 0, position: [-9, 1.5, -98], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }

  /** The hackathon trophy, knockable off its step. */
  buildPodium() {
    const { world } = this
    const g = new THREE.Group()
    g.position.set(9, 0, -98)
    const heights = [1.2, 0.8, 0.6]
    heights.forEach((h, i) => {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, h, 1.4), flat(palette.concrete))
      step.position.set((i - 1) * 1.45, h / 2, 0)
      g.add(step)
      const num = labelMesh(String(i === 0 ? 1 : i === 1 ? 2 : 3), { width: 0.7, height: 0.7, color: palette.ink, fontSize: 0.42, weight: 900 })
      num.position.set((i - 1) * 1.45, h / 2, 0.72)
      g.add(num)
    })
    world.addStatic(g)
    for (let i = 0; i < heights.length; i++) {
      const h = heights[i]
      const body = world.physics.box({ size: [1.4, h, 1.4], mass: 0, position: [9 + (i - 1) * 1.45, h / 2, -98], sleepy: false })
      body.userData = { kind: 'wall', tag: 'wall' }
      world.physics.add(body)
    }

    // Trophy: a dynamic body so you can knock it off the top step.
    const trophy = new THREE.Group()
    const parts = new THREE.Group()
    parts.position.y = -0.14 // centre the model on its 1 m collider
    trophy.add(parts)
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.2, 0.5, 10), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.45 }))
    cup.position.y = 0.34
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8), flat(palette.lamp))
    stem.position.y = -0.06
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), flat(palette.lamp))
    foot.position.y = -0.26
    for (const sx of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 5, 10), flat(palette.lamp))
      handle.position.set(sx * 0.36, 0.34, 0)
      handle.rotation.y = Math.PI / 2
      parts.add(handle)
    }
    parts.add(cup, stem, foot)
    const trophyBody = world.physics.cylinder({ radiusTop: 0.36, radiusBottom: 0.36, height: 1, segments: 8, mass: 3, position: [7.55, 1.7, -98] })
    world.addDynamic(trophy, trophyBody, { tag: 'trophy', shadowRadius: { rx: 0.4, rz: 0.4 } })
    this.track(trophyBody)

    board(world, {
      x: 11.5, z: -96, width: 4.4, height: 2, bottom: 1.2,
      accent: palette.lamp, physics: true, entry: 'education',
      title: 'WINNER',
      subtitle: 'Institute-wide Game Dev Hackathon, IIT Bombay',
      body: [resume.awards[0].description],
      titleSize: 0.4, bodySize: 0.18,
    })
  }

  /** A permanent drizzle of confetti over the podium. */
  buildConfetti() {
    const { world } = this
    const count = world.experience.quality === 'low' ? 24 : 48
    const geo = new THREE.PlaneGeometry(0.2, 0.13)
    this.confetti = new THREE.InstancedMesh(geo, flat(palette.terracotta, { side: THREE.DoubleSide }), count)
    this.confetti.frustumCulled = false
    const colors = [palette.terracotta, palette.steel, palette.lamp, palette.cobalt, palette.cream]
    const c = new THREE.Color()
    this.flakes = []
    for (let i = 0; i < count; i++) {
      this.confetti.setColorAt(i, c.set(colors[i % colors.length]))
      this.flakes.push({
        x: 9 + (Math.random() - 0.5) * 4,
        y: Math.random() * 4,
        z: -98 + (Math.random() - 0.5) * 4,
        spin: Math.random() * Math.PI,
        speed: 0.5 + Math.random() * 0.6,
      })
    }
    this.confetti.instanceColor.needsUpdate = true
    world.addStatic(this.confetti, { reveal: false })
    this._m = new THREE.Matrix4()
    this._p = new THREE.Vector3()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._s = new THREE.Vector3(1, 1, 1)
    this.confettiSpeed = 1
  }

  buildPad() {
    const pad = floorLabel('H', { width: 4, height: 4, color: palette.stencil, fontSize: 3, weight: 900 })
    pad.position.set(0, 0.03, -96)
    this.world.addStatic(pad, { reveal: false })
    const area = this.world.addArea({
      x: 0, z: -96, width: 6, depth: 4, label: 'EDUCATION',
      color: palette.lamp,
      onInteract: () => this.world.ui.togglePanel('education'),
    })
    area.actionLabel = 'OPEN'
  }

  openDetails() {
    this.world.ui.togglePanel('education')
  }

  onHorn() {
    const p = this.world.car.physics.position
    if (Math.hypot(p.x, p.z + 104) < 24) {
      this.strobe = 1.2
      this.world.ui.toast('Cleared for takeoff')
    }
  }

  update(dt, elapsed) {
    if (this.towerRadar) this.towerRadar.rotation.y += dt * 0.5

    // Beacon blinks; the horn makes it strobe.
    this.beaconPulse += dt
    let intensity = this.beaconPulse % 1.5 < 0.2 ? 1.2 : 0.2
    if (this.strobe > 0) {
      this.strobe -= dt
      intensity = Math.abs(Math.sin(elapsed * 18)) * 1.4
      this.glass.material.opacity = 0.6 + Math.abs(Math.sin(elapsed * 18)) * 0.25
      if (this.strobe <= 0) this.glass.material.opacity = 0.6
    }
    this.beacon.material.emissiveIntensity = intensity

    // Confetti falls and wraps.
    const speed = this.confettiSpeed
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i]
      f.y -= dt * f.speed * speed
      f.spin += dt * 2
      if (f.y < 0) f.y = 4
      this._p.set(f.x + Math.sin(f.spin) * 0.2, f.y, f.z)
      this._e.set(f.spin, f.spin * 0.7, 0)
      this._q.setFromEuler(this._e)
      this._m.compose(this._p, this._q, this._s)
      this.confetti.setMatrixAt(i, this._m)
    }
    this.confetti.instanceMatrix.needsUpdate = true
    if (this.confettiSpeed > 1) this.confettiSpeed = Math.max(1, this.confettiSpeed - dt)

    // Jumping on the helipad doubles the confetti for a moment.
    const car = this.world.car.physics
    if (!car.grounded && Math.hypot(car.position.x, car.position.z + 96) < 3 && this.confettiSpeed === 1) {
      this.confettiSpeed = 2.5
      this.world.sounds.blip(1200)
    }
  }
}
