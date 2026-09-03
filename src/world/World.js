import * as THREE from 'three'
import { Physics, CANNON } from '../core/Physics.js'
import { FollowCamera } from '../core/Camera.js'
import { Car } from './Car.js'
import { Reveal } from './Reveal.js'
import { AreaManager } from './Area.js'
import { BlobShadows } from './Shadows.js'
import { flat, palette, vary } from './Materials.js'
import { SECTION_DEFS } from './sections/registry.js'
import { resetBodies } from './props/RedButton.js'
import { buildRoads } from './Roads.js'
import { Pointer } from './Pointer.js'

/** Impact "tock" pitch per body tag (Hz). */
const IMPACT_PITCH = {
  letter: 420, crate: 260, brick: 300, pin: 880, figure: 880, ball: 500, cone: 900,
  trophy: 1200, gate: 240, seesaw: 200, wall: 120, board: 120, car: 180, drum: 200, default: 220,
}
const IMPACT_OPTS = { pin: { partial: 1.5 }, figure: { partial: 1.5 }, trophy: { partial: 1.5, decay: 0.6 }, cone: { noise: true, decay: 0.05 } }

/**
 * Assembles the drivable world: floor, boundary, car, sections, interactive areas.
 *
 * Section API (see docs/superpowers/specs/section-api.md):
 *   world.addStatic(object3D, { delay, reveal })
 *   world.addDynamic(mesh, body, { delay, impact, minImpact, tag, shadow, shadowRadius })
 *   world.addArea({ x, z, width, depth, label, hint, onInteract, onEnter, onLeave, color })
 *   world.addUpdatable({ update(dt, elapsed) }) / world.removeUpdatable(obj)
 *   world.resetBodies(bodies)   world.teleportTo(sectionId)
 */
export class World {
  constructor({ experience, controls, sounds, ui, strict = false }) {
    this.experience = experience
    this.scene = experience.scene
    this.controls = controls
    this.sounds = sounds
    this.ui = ui
    this.strict = strict

    this.physics = new Physics()
    this.reveal = new Reveal(this.physics)
    this.areas = new AreaManager(this)
    this.shadows = new BlobShadows(this.scene, { max: 220 })
    this.camera = new FollowCamera(experience)
    this.pointer = new Pointer(this)
    this.sections = []
    this.sectionById = new Map()
    this.updatables = []
    this.mapEntries = []
    this.extents = { x0: -110, x1: 110, z0: -130, z1: 75 }
    this.spawn = { x: 0, z: 0, yaw: 0 }
    this.started = false
    this.jumpRequested = false
    this.currentSection = null
    this._panelArea = null
    this._seenCards = new Set()
    this._tmpNudge = new THREE.Vector3()

    this.setFloor()
    this.setBoundary()
    buildRoads(this)
    this.car = new Car(this, { spawn: [this.spawn.x, 1.2, this.spawn.z] })
    this.car.physics.chassisBody.userData = { kind: 'car', tag: 'car' }
    this.shadows.add(this.car.physics.chassisBody, { rx: 1.25, rz: 1.9 })
    this.camera.snap(this.car.group.position)

    this._wire()
  }

  /** Sections are added after construction so the world can be built without them in tests. */
  build(builder) {
    builder(this)
    this.ui.setMapSections(this.mapEntries)
    return this
  }

  /* ------------------------------------------------------------------ */
  /* Construction helpers                                                */
  /* ------------------------------------------------------------------ */

  setFloor() {
    const { x0, x1, z0, z1 } = this.extents
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 80, z1 - z0 + 80), flat(palette.dune))
    floor.rotation.x = -Math.PI / 2
    floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2)
    floor.name = 'floor'
    this.scene.add(floor)
    this.floor = floor
  }

  setBoundary() {
    const { x0, x1, z0, z1 } = this.extents
    const h = 6
    const t = 1
    const walls = [
      { size: [x1 - x0 + 2 * t, h, t], position: [(x0 + x1) / 2, h / 2, z0 - t / 2] },
      { size: [x1 - x0 + 2 * t, h, t], position: [(x0 + x1) / 2, h / 2, z1 + t / 2] },
      { size: [t, h, z1 - z0], position: [x0 - t / 2, h / 2, (z0 + z1) / 2] },
      { size: [t, h, z1 - z0], position: [x1 + t / 2, h / 2, (z0 + z1) / 2] },
    ]
    for (const w of walls) this.physics.add(this.physics.wall(w))

    // Visual edge: a jittered ring of low-poly hills just outside the walls (one instanced draw call).
    const count = this.experience.quality === 'low' ? 50 : 70
    const geo = new THREE.IcosahedronGeometry(1, 0)
    const hills = new THREE.InstancedMesh(geo, flat(palette.mesa), count)
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const perimeter = 2 * (x1 - x0) + 2 * (z1 - z0)
    let seed = 7
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    for (let i = 0; i < count; i++) {
      const d = (i / count) * perimeter + rnd() * 6
      let x, z
      if (d < x1 - x0) { x = x0 + d; z = z0 }
      else if (d < (x1 - x0) + (z1 - z0)) { x = x1; z = z0 + (d - (x1 - x0)) }
      else if (d < 2 * (x1 - x0) + (z1 - z0)) { x = x1 - (d - (x1 - x0) - (z1 - z0)); z = z1 }
      else { x = x0; z = z1 - (d - 2 * (x1 - x0) - (z1 - z0)) }
      const out = 8 + rnd() * 10
      const dx = x <= x0 + 1 ? -out : x >= x1 - 1 ? out : 0
      const dz = z <= z0 + 1 ? -out : z >= z1 - 1 ? out : 0
      p.set(x + dx + (rnd() - 0.5) * 6, -1.5, z + dz + (rnd() - 0.5) * 6)
      q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0))
      s.set(6 + rnd() * 12, 4 + rnd() * 5, 6 + rnd() * 12)
      m.compose(p, q, s)
      hills.setMatrixAt(i, m)
    }
    hills.instanceMatrix.needsUpdate = true
    hills.frustumCulled = false
    this.scene.add(hills)
  }

  addStatic(object, { delay = 0, reveal = true } = {}) {
    this.scene.add(object)
    if (reveal) this.reveal.registerByDistance(object, { delay })
    return object
  }

  addDynamic(mesh, body, { delay = 0, impact = true, minImpact = 1.5, tag = 'default', shadow = true, shadowRadius = null } = {}) {
    this.scene.add(mesh)
    body.userData = {
      ...(body.userData || {}),
      kind: 'prop',
      tag,
      home: { p: body.position.clone(), q: body.quaternion.clone() },
    }
    this.reveal.registerByDistance(mesh, { body, delay, mesh })
    if (impact) this.physics.listenImpacts(body, minImpact, { tag })
    if (shadow) {
      const r = shadowRadius || footprint(body)
      this.shadows.add(body, { rx: r.rx, rz: r.rz })
    }
    return { mesh, body }
  }

  addArea(opts) {
    const area = this.areas.add(opts)
    if (opts.onInteract) {
      // The pad can also be clicked from anywhere, so driving is never the only way in.
      this.pointer.add(area.group, () => opts.onInteract(area), opts.label)
    }
    return area
  }

  /** Register any object so a click on it (from any distance) runs `action`. */
  addClickable(object, action, label = '') {
    return this.pointer.add(object, action, label)
  }

  addUpdatable(obj) {
    this.updatables.push(obj)
    return obj
  }

  removeUpdatable(obj) {
    const i = this.updatables.indexOf(obj)
    if (i >= 0) this.updatables.splice(i, 1)
  }

  addSection(section) {
    this.sections.push(section)
    this.sectionById.set(section.id, section)
    if (typeof section.update === 'function') this.updatables.push(section)
    if (section.map) this.mapEntries.push(section.map)
    return section
  }

  resetBodies(bodies) {
    resetBodies(this, bodies)
  }

  /** Section whose AABB contains (x, z), if any. */
  sectionAt(x, z) {
    for (const s of this.sections) if (s.contains(x, z)) return s
    return null
  }

  nearestSection(x, z) {
    let best = null
    let bestD = Infinity
    for (const s of this.sections) {
      const d = Math.hypot(s.def.centre[0] - x, s.def.centre[1] - z)
      if (d < bestD) { bestD = d; best = s }
    }
    return best
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */

  _wire() {
    const { controls, sounds, ui } = this
    controls.on('jump', () => { this.jumpRequested = true })
    controls.on('interact', () => this.interact())
    controls.on('horn', () => this.horn())
    controls.on('map', () => { if (this.started) ui.toggleModal('map') })
    controls.on('help', () => { if (this.started) ui.toggleModal('help') })
    controls.on('text', () => { if (this.started) ui.toggleResume() })
    controls.on('mute', () => this.toggleMute())
    controls.on('respawn', () => this.respawn())
    controls.on('escape', () => ui.closeTop())
    controls.on('teleportIndex', (i) => {
      if (!this.started) return
      const def = SECTION_DEFS[i]
      if (def) this.teleportTo(def.id)
    })

    ui.on('interact', () => this.interact())
    ui.on('mute', () => this.toggleMute())
    ui.on('teleport', (entry) => this.teleportTo(entry.id))
    ui.on('reset-section', () => this.currentSection?.reset())
    ui.on('reset-all', () => this.sections.forEach((s) => s.reset()))
    ui.on('modal-open', () => { controls.enabled = false })
    ui.on('modal-close', () => { controls.enabled = true })
    ui.on('resume-open', () => { controls.enabled = false })
    ui.on('resume-close', () => { controls.enabled = true })
    ui.on('card-details', (sectionId) => {
      const s = this.sectionById.get(sectionId)
      if (s?.openDetails) return s.openDetails()
      const entry = { intro: 'about', experience: 'tark', projects: 'screening', skills: 'skills', education: 'education', contact: 'contact' }[sectionId]
      if (entry) ui.showEntry(entry)
    })
    ui.setMuted(sounds.muted)

    this.physics.on('impact', ({ speed, body, target, tag }) => {
      const t = tag || body.userData?.tag || target?.userData?.tag || 'default'
      const strength = Math.min(1, speed / 8)
      sounds.hit(strength, IMPACT_PITCH[t] || IMPACT_PITCH.default, IMPACT_OPTS[t] || {})
      const isCar = body.userData?.kind === 'car' || target?.userData?.kind === 'car'
      if (isCar && speed > 6 && !this.reducedMotion) this.camera.shake = Math.min(1, speed / 14)
      const prop = body.userData?.kind === 'prop' ? body : target?.userData?.kind === 'prop' ? target : null
      if (prop && prop.type !== CANNON.Body.KINEMATIC) {
        const s = this.sectionAt(prop.position.x, prop.position.z)
        if (s) s.disturbed = true
      }
    })
    this.physics.listenImpacts(this.car.physics.chassisBody, 4, { tag: 'car' })
  }

  toggleMute() {
    const muted = this.sounds.toggleMute()
    this.ui.setMuted(muted)
    this.ui.toast(muted ? 'Muted' : 'Sound on', 1200)
  }

  horn() {
    this.sounds.horn()
    for (const s of this.sections) s.onHorn?.()
  }

  interact() {
    if (this.ui.anyOpen && !this.areas.current) { this.ui.closeTop(); return }
    const handled = this.areas.interact()
    if (handled) {
      this.sounds.click()
      this._panelArea = this.areas.current
    }
  }

  /** R: reset the current section's toys if disturbed, else respawn at the nearest section spawn. */
  respawn() {
    const s = this.currentSection
    if (s && s.disturbed) {
      s.reset()
      this.ui.toast('Reset', 1200)
      return
    }
    const p = this.car.physics.position
    const near = this.nearestSection(p.x, p.z)
    if (near) this.car.teleport(near.def.spawn[0], near.def.spawn[1], near.def.yaw)
    else this.car.respawn()
    this.camera.snap(this.car.physics.position)
    this.ui.closePanel()
    this.ui.toast('Respawned', 1200)
  }

  teleportTo(sectionId) {
    const s = this.sectionById.get(sectionId)
    if (!s) return
    this.ui.closeModal()
    this.ui.hideResume()
    this.car.teleport(s.def.spawn[0], s.def.spawn[1], s.def.yaw)
    this.camera.snap(this.car.physics.position)
    this.ui.closePanel()
    this.ui.fade()
    this.sounds.click()
  }

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */

  start({ reducedMotion = false } = {}) {
    this.started = true
    this.reducedMotion = reducedMotion
    const body = this.car.physics.chassisBody
    if (reducedMotion) {
      this.reveal.finish()
    } else {
      body.position.y = 2.5
      body.velocity.setZero()
      this.reveal.start()
      this.camera.startSwoop(1.6)
    }
    this.sounds.reveal()
    // The car begins inside a section, so announce it explicitly.
    const here = this.sectionAt(body.position.x, body.position.z)
    if (here) {
      this._seenCards.add(here.id)
      this.ui.showCard(here.def)
    }
  }

  update(dt, elapsed) {
    const { controls, car } = this
    controls.update()
    const input = { throttle: controls.throttle, steer: controls.steer, boost: controls.boost, brake: controls.brake, jump: this.jumpRequested }
    if (this.ui.panelOpen && !controls.boost && Math.abs(controls.throttle) < 0.05) input.brake = true
    this.jumpRequested = false
    const events = car.update(dt, input)
    if (events.jumped) this.sounds.jump()
    if (events.drifting) this.sounds.screech(0.7)
    if (events.landed) this.sounds.hit(Math.min(1, events.landed / 10), 70, { decay: 0.18, noise: true })

    this.physics.step(dt)
    this.reveal.update(dt)

    const p = car.physics.position
    this.areas.update(dt, elapsed, p.x, p.z)
    if (this._panelArea && this.areas.current !== this._panelArea) {
      const a = this._panelArea
      if (Math.hypot(p.x - a.x, p.z - a.z) > 6) {
        this._panelArea = null
        this.ui.closePanel()
      }
    }
    this.ui.setActionVisible(!!this.areas.current, this.areas.current?.actionLabel || 'OPEN')

    this._trackSection(p.x, p.z)

    for (const u of [...this.updatables]) u.update(dt, elapsed)

    this.shadows.update(p)
    this.camera.boosting = controls.boost && car.physics.speed > 2
    this._tmpNudge.set(this.ui.panelOpen && !this.experience.isSmall ? 4 : 0, 0, 0)
    this.camera.nudge.lerp(this._tmpNudge, 1 - Math.exp(-dt * 6))
    this.camera.update(dt, car.group.position, car.physics.velocity)
    this.sounds.updateEngine(car.physics.speed, Math.abs(controls.throttle), controls.boost)
  }

  _trackSection(x, z) {
    const s = this.sectionAt(x, z)
    if (s === this.currentSection) return
    this.currentSection?.onLeave()
    this.currentSection = s
    if (!s) return
    s.onEnter()
    if (!this.started) return
    this.ui.showSectionLabel(s.def.label)
    this.sounds.whoosh()
    if (!this._seenCards.has(s.id)) {
      this._seenCards.add(s.id)
      this.ui.showCard(s.def)
    }
  }
}

/** Approximate ground footprint of a body from its first shape. */
function footprint(body) {
  const shape = body.shapes[0]
  if (!shape) return { rx: 0.6, rz: 0.6 }
  if (shape instanceof CANNON.Box) return { rx: shape.halfExtents.x * 1.15, rz: shape.halfExtents.z * 1.15 }
  if (shape instanceof CANNON.Sphere) return { rx: shape.radius, rz: shape.radius }
  if (shape instanceof CANNON.Cylinder) return { rx: shape.radiusBottom, rz: shape.radiusBottom }
  return { rx: shape.boundingSphereRadius * 0.8, rz: shape.boundingSphereRadius * 0.8 }
}

export { vary }
