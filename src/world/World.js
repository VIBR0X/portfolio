import * as THREE from 'three'
import { Physics, CANNON } from '../core/Physics.js'
import { FollowCamera } from '../core/Camera.js'
import { Car } from './Car.js'
import { Reveal } from './Reveal.js'
import { AreaManager } from './Area.js'
import { BlobShadows } from './Shadows.js'
import { flat, palette, vary, applyShadowFlags } from './Materials.js'
import { SECTION_DEFS } from './sections/registry.js'
import { resetBodies } from './props/RedButton.js'
import { buildRoads, ROAD_RECTS } from './Roads.js'
import { regolithGrain, fitGrain, wearMap, craterDecal } from './Textures.js'
import { craterPoints } from './Craters.js'
import { Pointer } from './Pointer.js'
import { Particles } from './Particles.js'
import { SkidMarks } from './SkidMarks.js'
import { Plane } from './Plane.js'
import { AirRace } from './props/AirRace.js'
import { buildClutter } from './Clutter.js'
import { DustDevils } from './props/DustDevils.js'
import { Dishes } from './props/Dishes.js'

/** Impact "tock" pitch per body tag (Hz). */
const IMPACT_PITCH = {
  letter: 420, crate: 260, brick: 300, pin: 880, figure: 880, ball: 500, cone: 900,
  trophy: 1200, gate: 240, seesaw: 200, wall: 120, board: 120, car: 180, drum: 200, plane: 260, default: 220,
}
const IMPACT_OPTS = { pin: { partial: 1.5 }, figure: { partial: 1.5 }, trophy: { partial: 1.5, decay: 0.6 }, cone: { noise: true, decay: 0.05 } }

/**
 * Assembles the drivable world: floor, boundary, car, sections, interactive areas.
 *
 * Section API (see docs/superpowers/specs/section-api.md):
 *   world.addStatic(object3D, { delay, reveal, cast })
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
    this.shadows = new BlobShadows(this.scene, { max: 220, strength: experience.quality === 'low' ? 0.3 : 0.16 })
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

    this.particles = new Particles(this)
    this.addUpdatable(this.particles)
    this.skidMarks = new SkidMarks(this)
    this.addUpdatable(this.skidMarks)
    this._lastSkidMark = null
    this._focusAltitude = 0
    this._minZoom = 0
    this._exitWhenStopped = false

    this.setFloor()
    this.setBoundary()
    buildRoads(this)
    this.car = new Car(this, { spawn: [this.spawn.x, 1.2, this.spawn.z] })
    this.car.physics.chassisBody.userData = { kind: 'car', tag: 'car' }
    this.shadows.add(this.car.physics.chassisBody, { rx: 1.25, rz: 1.9 })
    this.mode = 'car'
    this.plane = new Plane(this)
    this.shadows.add(this.plane.body, { rx: 4.1, rz: 3.3, altitudeCue: true })
    this._wheelDustT = 0
    this.airRace = new AirRace(this)
    this.addUpdatable(this.airRace)
    this.dustDevils = new DustDevils(this)
    this.addUpdatable(this.dustDevils)
    this.dishes = new Dishes(this)
    this.addUpdatable(this.dishes)
    this.camera.snap(this.car.group.position)

    this._wire()
  }

  /** Sections are added after construction so the world can be built without them in tests. */
  build(builder) {
    builder(this)
    // Clutter dresses the ground between sections, so it runs once the sections have placed
    // their own props and pads and it can avoid them.
    buildClutter(this)
    this.ui.setMapSections(this.mapEntries)
    return this
  }

  /* ------------------------------------------------------------------ */
  /* Construction helpers                                                */
  /* ------------------------------------------------------------------ */

  setFloor() {
    const { x0, x1, z0, z1 } = this.extents
    const low = this.experience.quality === 'low'
    const w = x1 - x0 + 80
    const d = z1 - z0 + 80
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    // The floor rectangle is the UV space shared by the regolith, the pavement and the wear map.
    this.floorRect = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }
    // Craters: wear bowls in the aoMap (deepens them under shadow) plus an unlit decal each (what
    // the visitor actually sees). Clutter puts boulders on the same rims.
    this.craters = craterPoints(this.extents, { low })
    this.wearMap = wearMap(this.floorRect, { rects: ROAD_RECTS, discs: this.craters.map((c) => ({ ...c, amount: 0.12 })) })
    // White base: a standard material multiplies colour by map, and the grain already carries the regolith colour.
    const material = flat('#FFFFFF', { map: fitGrain(regolithGrain(), w, d), aoMap: this.wearMap, roughness: 1 })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(cx, 0, cz)
    floor.name = 'floor'
    floor.receiveShadow = true
    this.scene.add(floor)
    this.floor = floor

    const decalGeo = new THREE.CircleGeometry(1, 24)
    decalGeo.rotateX(-Math.PI / 2)
    const decalMat = new THREE.MeshBasicMaterial({ map: craterDecal(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, toneMapped: false })
    const decals = new THREE.InstancedMesh(decalGeo, decalMat, this.craters.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    this.craters.forEach((c, i) => {
      m.compose(new THREE.Vector3(c.cx, 0.02, c.cz), q, new THREE.Vector3(c.r, 1, c.r))
      decals.setMatrixAt(i, m)
    })
    decals.instanceMatrix.needsUpdate = true
    decals.renderOrder = 1
    decals.frustumCulled = false
    decals.name = 'crater-decals'
    decals.castShadow = false
    decals.receiveShadow = false
    this.scene.add(decals)
  }

  setBoundary() {
    const { x0, x1, z0, z1 } = this.extents
    const low = this.experience.quality === 'low'
    const h = 6
    const t = 1
    const walls = [
      { size: [x1 - x0 + 2 * t, h, t], position: [(x0 + x1) / 2, h / 2, z0 - t / 2] },
      { size: [x1 - x0 + 2 * t, h, t], position: [(x0 + x1) / 2, h / 2, z1 + t / 2] },
      { size: [t, h, z1 - z0], position: [x0 - t / 2, h / 2, (z0 + z1) / 2] },
      { size: [t, h, z1 - z0], position: [x1 + t / 2, h / 2, (z0 + z1) / 2] },
    ]
    for (const w of walls) this.physics.add(this.physics.wall(w))

    // Visual edge, two instanced layers on the same seeded perimeter walk: a jittered ring of
    // low-poly hills just outside the walls, and a sparser ring of flat-topped mesas 30–45 m out
    // whose tops stand over the hills. Every instance is coloured here, before the first render.
    const perimeter = 2 * (x1 - x0) + 2 * (z1 - z0)
    const layer = ({ count, seed, geometry, outMin, outMax, y, scale, colorA, colorB, name, cast }) => {
      const mesh = new THREE.InstancedMesh(geometry, flat('#FFFFFF'), count)
      const m = new THREE.Matrix4()
      const p = new THREE.Vector3()
      const q = new THREE.Quaternion()
      const s = new THREE.Vector3()
      const ca = new THREE.Color(colorA)
      const cb = new THREE.Color(colorB)
      const c = new THREE.Color()
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
      for (let i = 0; i < count; i++) {
        const d = (i / count) * perimeter + rnd() * 6
        let x, z
        if (d < x1 - x0) { x = x0 + d; z = z0 }
        else if (d < (x1 - x0) + (z1 - z0)) { x = x1; z = z0 + (d - (x1 - x0)) }
        else if (d < 2 * (x1 - x0) + (z1 - z0)) { x = x1 - (d - (x1 - x0) - (z1 - z0)); z = z1 }
        else { x = x0; z = z1 - (d - 2 * (x1 - x0) - (z1 - z0)) }
        const out = outMin + rnd() * (outMax - outMin)
        const dx = x <= x0 + 1 ? -out : x >= x1 - 1 ? out : 0
        const dz = z <= z0 + 1 ? -out : z >= z1 - 1 ? out : 0
        p.set(x + dx + (rnd() - 0.5) * 6, y, z + dz + (rnd() - 0.5) * 6)
        q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0))
        s.set(scale[0][0] + rnd() * scale[0][1], scale[1][0] + rnd() * scale[1][1], scale[2][0] + rnd() * scale[2][1])
        m.compose(p, q, s)
        mesh.setMatrixAt(i, m)
        mesh.setColorAt(i, c.lerpColors(ca, cb, rnd()))
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor.needsUpdate = true
      mesh.frustumCulled = false
      mesh.name = name
      mesh.castShadow = cast
      mesh.receiveShadow = cast
      this.scene.add(mesh)
      return mesh
    }
    layer({
      count: low ? 50 : 70, seed: 7, geometry: new THREE.IcosahedronGeometry(1, 0), outMin: 8, outMax: 18, y: -1.5,
      scale: [[6, 12], [4, 5], [6, 12]], colorA: palette.hill, colorB: palette.hillLight, name: 'hills', cast: true,
    })
    // Translated up by half its height before instancing so the scale acts from the base.
    const mesaGeo = new THREE.CylinderGeometry(0.72, 1, 1, 7)
    mesaGeo.translate(0, 0.5, 0)
    layer({
      count: low ? 14 : 24, seed: 9, geometry: mesaGeo, outMin: 30, outMax: 45, y: -1,
      scale: [[14, 8], [9, 4], [10, 6]], colorA: palette.mesaFar, colorB: palette.mesaFarLight, name: 'mesas', cast: false,
    })
  }

  addStatic(object, { delay = 0, reveal = true, cast = true } = {}) {
    applyShadowFlags(object, { cast })
    this.scene.add(object)
    if (reveal) this.reveal.registerByDistance(object, { delay })
    return object
  }

  addDynamic(mesh, body, { delay = 0, impact = true, minImpact = 1.5, tag = 'default', shadow = true, shadowRadius = null } = {}) {
    applyShadowFlags(mesh)
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
      const isCar = body.userData?.kind === 'car' || target?.userData?.kind === 'car' || body.userData?.kind === 'plane' || target?.userData?.kind === 'plane'
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
    // While flying, Enter/E means "land and get out" rather than "open the pad under me".
    if (this.mode === 'plane') { this.exitPlane(); return }
    if (this.ui.anyOpen && !this.areas.current) { this.ui.closeTop(); return }
    const handled = this.areas.interact()
    if (handled) {
      this.sounds.click()
      this._panelArea = this.areas.current
    }
  }

  /**
   * Every solid static body in the world, for the plane's manual crash test. A kinematic body
   * generates no cannon contacts against static ones (measured), so the collision has to be found
   * by hand. Re-filtered only when the body count changes, so it is flat once the world is built.
   */
  get staticSolids() {
    const bodies = this.physics.world.bodies
    if (!this._staticSolids || this._staticSolidsCount !== bodies.length) {
      this._staticSolids = bodies.filter((b) => b.mass === 0 && (b.userData?.kind === 'wall' || b.userData?.kind === 'board'))
      this._staticSolidsCount = bodies.length
    }
    return this._staticSolids
  }

  /**
   * Ask the camera to frame something tall this frame (the rocket launch). Highest request wins;
   * it is consumed and cleared each frame, so it never sticks.
   */
  requestFocusAltitude(y) {
    this._focusAltitude = Math.max(this._focusAltitude, y)
  }

  /** Floor under the visitor's zoom for this frame only (the rocket flight); highest request wins. */
  requestMinZoom(z) {
    this._minZoom = Math.max(this._minZoom, z)
  }

  /** The vehicle the visitor is currently driving; everything downstream follows this one. */
  get activeVehicle() {
    return this.mode === 'plane' ? this.plane.physics : this.car.physics
  }

  boardPlane() {
    if (this.mode === 'plane') return
    this.mode = 'plane'
    this._exitWhenStopped = false
    this.car.setVisible(false)
    this.car.physics.chassisBody.sleep()
    this.camera.maxZoom = 3.2
    this.ui.toast('Flying — W/S climb & dive, A/D bank, Shift boost, Enter to land', 3200)
    this.sounds.click()
  }

  exitPlane() {
    if (this.mode !== 'plane') return
    if (!this.plane.grounded) {
      this.ui.toast('Land first', 1400)
      return
    }
    // Still rolling out: rather than refuse the keypress, brake to a stop and hop out then.
    if (this.plane.speed > 2) {
      if (!this._exitWhenStopped) {
        this._exitWhenStopped = true
        this.ui.toast('Braking…', 1200)
      }
      return
    }
    this._exitWhenStopped = false
    this.mode = 'car'
    this.camera.maxZoom = 1.9
    this.camera.targetZoom = Math.min(this.camera.targetZoom, 1.9)
    const p = this.plane.position
    this.car.physics.chassisBody.wakeUp()
    this.car.teleport(p.x + 3, p.z, this.plane.physics.yaw)
    this.car.setVisible(true)
    this.camera.snap(this.car.group.position)
    this.sounds.click()
  }

  crashPlane() {
    this._exitWhenStopped = false
    this.sounds.hit(1, 120, { noise: true })
    if (!this.reducedMotion) this.camera.shake = 0.6
    this.ui.toast('Crashed — respawned on the hardstand', 2000)
    this.plane.physics.respawn()
    this.plane.body.position.copy(this.plane.physics.position)
    this.plane.body.quaternion.copy(this.plane.physics.quaternion)
    this.plane.body.velocity.setZero()
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
    this.jumpRequested = false

    if (this.mode === 'plane') {
      // A panel open mid-flight should not leave the throttle stuck on behind it.
      if (this.ui.panelOpen) input.throttle = 0
      // Enter pressed while still rolling out: hold the brakes on until it stops, then hop out.
      if (this._exitWhenStopped) {
        input.throttle = 0
        input.brake = true
        if (this.plane.grounded && this.plane.speed <= 2) this.exitPlane()
      }
      const events = this.plane.update(dt, input)
      if (events.justLifted) {
        this.sounds.liftoff()
        this.particles.emit(new THREE.Vector3(this.plane.position.x, 0.2, this.plane.position.z), { count: 12, color: palette.dust, spread: 1.6, life: 0.7 })
      }
      if (events.justLanded) {
        this.sounds.touchdown(0.3)
        this.particles.emit(new THREE.Vector3(this.plane.position.x, 0.2, this.plane.position.z), { count: 16, color: palette.regolithLight, spread: 1.6, life: 0.7 })
      }
      if (events.hardLanding) {
        this.sounds.touchdown(1)
        if (!this.reducedMotion) this.camera.shake = 0.4
      }
      this.airRace?.onPlaneUpdate(this.plane, events)
      // Ground-roll dust: a puff off each main wheel every 0.1 s while rolling faster than 3 m/s.
      if (this.plane.grounded && this.plane.speed > 3) {
        this._wheelDustT += dt
        if (this._wheelDustT >= 0.1) {
          this._wheelDustT = 0
          this.plane.group.updateMatrixWorld()
          for (const sx of [-1.05, 1.05]) {
            const p = this.plane.group.localToWorld(new THREE.Vector3(sx, -0.6, -0.35))
            this.particles.emit(p, { count: 2, color: palette.dust, spread: 0.6, life: 0.5, size: 0.12 })
          }
        }
      } else {
        this._wheelDustT = 0
      }
      // Kinematic bodies raise no contacts against static ones, so crashes are found by hand.
      this.plane.body.updateAABB()
      for (const wall of this.staticSolids) {
        if (this.plane.body.aabb.overlaps(wall.aabb)) { this.crashPlane(); break }
      }
    } else {
      if (this.ui.panelOpen && !controls.boost && Math.abs(controls.throttle) < 0.05) input.brake = true
      const events = car.update(dt, input)
      if (events.jumped) this.sounds.jump()
      if (events.drifting) this.sounds.screech(0.7)
      if (events.landed) this.sounds.hit(Math.min(1, events.landed / 10), 70, { decay: 0.18, noise: true })
      if (events.drifting || (input.brake && car.physics.speed > 5)) {
        const cp = car.physics.position
        if (!this._lastSkidMark || Math.hypot(cp.x - this._lastSkidMark.x, cp.z - this._lastSkidMark.z) > 0.4) {
          this.skidMarks.mark(new THREE.Vector3(cp.x, 0, cp.z), car.physics.yaw)
          this._lastSkidMark = { x: cp.x, z: cp.z }
        }
      } else {
        this._lastSkidMark = null
      }
      // Dust off the back wheels on the sand.
      if (car.physics.grounded && car.physics.speed > 4) {
        const cp = car.physics.position
        if (!this._lastDust || Math.hypot(cp.x - this._lastDust.x, cp.z - this._lastDust.z) > 0.6) {
          this.particles.emit(new THREE.Vector3(cp.x, 0.15, cp.z), { count: 3, color: '#DCC08F', size: 0.1, life: 0.4, spread: 0.5 })
          this._lastDust = { x: cp.x, z: cp.z }
        }
      }
    }

    this.physics.step(dt)
    this.reveal.update(dt)

    const active = this.activeVehicle
    const p = active.position
    this.areas.update(dt, elapsed, p.x, p.z)
    if (this._panelArea && this.areas.current !== this._panelArea) {
      const a = this._panelArea
      if (Math.hypot(p.x - a.x, p.z - a.z) > 6) {
        this._panelArea = null
        this.ui.closePanel()
      }
    }
    this.ui.setActionVisible(!!this.areas.current, this.areas.current?.actionLabel || 'OPEN')
    if (this.mode === 'plane') {
      this.ui.setChip('alt', `ALT ${Math.round(p.y)}m`)
      this.ui.setChip('spd', `${Math.round(active.speed * 3.6)} km/h`)
    } else if (this._flightChips) {
      this.ui.setChip('alt', null)
      this.ui.setChip('spd', null)
    }
    this._flightChips = this.mode === 'plane'

    this._trackSection(p.x, p.z)

    for (const u of [...this.updatables]) u.update(dt, elapsed)

    this.shadows.update(p)
    this.camera.boosting = controls.boost && active.speed > 2
    this._tmpNudge.set(this.ui.panelOpen && !this.experience.isSmall ? 4 : 0, 0, 0)
    this.camera.nudge.lerp(this._tmpNudge, 1 - Math.exp(-dt * 6))
    const follow = this.mode === 'plane' ? this.plane.group.position : car.group.position
    const altitude = Math.max(this.mode === 'plane' ? p.y : 0, this._focusAltitude)
    this.camera.update(dt, follow, active.velocity, { altitude, minZoom: this._minZoom })
    this._focusAltitude = 0
    this._minZoom = 0
    // Keep the sun's shadow frustum on the visible ground (no-op under the Node harnesses).
    this.experience.shadowFollow?.aim(this.camera.smoothTarget, this.camera.zoom)
    if (this.mode === 'plane') this.sounds.propeller(active.speed, controls.boost)
    else this.sounds.updateEngine(car.physics.speed, Math.abs(controls.throttle), controls.boost)
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
