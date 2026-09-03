import * as THREE from 'three'
import { Physics } from '../core/Physics.js'
import { FollowCamera } from '../core/Camera.js'
import { Car } from './Car.js'
import { Reveal } from './Reveal.js'
import { AreaManager } from './Area.js'
import { flat, palette } from './Materials.js'
import { buildSections } from './sections/index.js'

/**
 * Assembles the drivable world: floor, boundary, car, sections, interactive areas.
 * Sections use this API:
 *   world.addStatic(object3D, { delay })            – decoration, no physics
 *   world.addDynamic(mesh, body, { delay, impact })  – physics prop kept in sync with its mesh
 *   world.addArea({ x, z, width, depth, label, onInteract, onEnter, onLeave, color })
 *   world.addUpdatable({ update(dt, elapsed) })
 */
export class World {
  constructor({ experience, controls, sounds, ui }) {
    this.experience = experience
    this.scene = experience.scene
    this.controls = controls
    this.sounds = sounds
    this.ui = ui

    this.physics = new Physics()
    this.reveal = new Reveal(this.physics)
    this.areas = new AreaManager(this)
    this.camera = new FollowCamera(experience)
    this.sections = []
    this.updatables = []
    this.mapEntries = []
    this.bounds = { x: 110, z: 110 }
    this.spawn = { x: 0, z: 6, yaw: 0 }
    this.started = false
    this.jumpRequested = false
    this._panelArea = null

    this.setFloor()
    this.setBoundary()
    this.car = new Car(this, { spawn: [this.spawn.x, 1.2, this.spawn.z] })
    this.camera.snap(this.car.group.position)

    buildSections(this)
    this.ui.setMapSections(this.mapEntries)
    this._wire()
  }

  /* ------------------------------------------------------------------ */
  /* Construction helpers                                                */
  /* ------------------------------------------------------------------ */

  setFloor() {
    const size = 600
    const geo = new THREE.PlaneGeometry(size, size)
    const floor = new THREE.Mesh(geo, flat(palette.sand))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    floor.name = 'floor'
    this.scene.add(floor)
    this.floor = floor
  }

  setBoundary() {
    const { x, z } = this.bounds
    const h = 6
    const t = 4
    const walls = [
      { size: [x * 2 + t * 2, h, t], position: [0, h / 2, -z - t / 2] },
      { size: [x * 2 + t * 2, h, t], position: [0, h / 2, z + t / 2] },
      { size: [t, h, z * 2], position: [-x - t / 2, h / 2, 0] },
      { size: [t, h, z * 2], position: [x + t / 2, h / 2, 0] },
    ]
    for (const w of walls) this.physics.add(this.physics.wall(w))
  }

  addStatic(object, { delay = 0 } = {}) {
    this.scene.add(object)
    this.reveal.registerByDistance(object, { delay })
    return object
  }

  addDynamic(mesh, body, { delay = 0, impact = true, minImpact = 1.5 } = {}) {
    this.scene.add(mesh)
    this.reveal.registerByDistance(mesh, { body, delay, mesh })
    if (impact) this.physics.listenImpacts(body, minImpact)
    return { mesh, body }
  }

  addArea(opts) {
    return this.areas.add(opts)
  }

  addUpdatable(obj) {
    this.updatables.push(obj)
    return obj
  }

  addSection(section) {
    this.sections.push(section)
    if (typeof section.update === 'function') this.updatables.push(section)
    if (section.map) this.mapEntries.push(section.map)
    return section
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */

  _wire() {
    const { controls, sounds, ui } = this
    controls.on('jump', () => { this.jumpRequested = true })
    controls.on('interact', () => this.interact())
    controls.on('horn', () => sounds.horn())
    controls.on('map', () => ui.toggleModal('map'))
    controls.on('help', () => ui.toggleModal('help'))
    controls.on('mute', () => ui.setMuted(sounds.toggleMute()))
    controls.on('respawn', () => this.respawn())
    controls.on('escape', () => ui.closeTop())

    ui.on('interact', () => this.interact())
    ui.on('mute', () => ui.setMuted(sounds.toggleMute()))
    ui.on('teleport', (entry) => this.teleport(entry))
    ui.on('modal-open', () => { controls.enabled = false })
    ui.on('modal-close', () => { controls.enabled = true })
    ui.on('resume-open', () => { controls.enabled = false })
    ui.on('resume-close', () => { controls.enabled = true })
    ui.setMuted(sounds.muted)

    this.physics.on('impact', ({ speed, body, target }) => {
      sounds.hit(speed / 4)
      if (body.userData?.kind === 'car' || target.userData?.kind === 'car') this.camera.shake = Math.min(1, speed / 12)
    })
    this.physics.listenImpacts(this.car.physics.chassisBody, 4)
  }

  interact() {
    if (this.ui.anyOpen && !this.areas.current) { this.ui.closeTop(); return }
    const handled = this.areas.interact()
    if (handled) {
      this.sounds.click()
      this._panelArea = this.areas.current
    }
  }

  respawn() {
    this.car.respawn()
    this.camera.snap(this.car.physics.position)
    this.ui.closePanel()
  }

  teleport(entry) {
    this.car.teleport(entry.x, entry.z, entry.yaw || 0)
    this.camera.snap(this.car.physics.position)
    this.ui.closePanel()
    this.sounds.click()
  }

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */

  start() {
    this.started = true
    this.reveal.start()
    this.sounds.reveal()
  }

  update(dt, elapsed) {
    const { controls, car } = this
    controls.update()
    const input = { throttle: controls.throttle, steer: controls.steer, boost: controls.boost, brake: controls.brake, jump: this.jumpRequested }
    this.jumpRequested = false
    const events = car.update(dt, input)
    if (events.jumped) this.sounds.jump()
    if (events.drifting) this.sounds.screech(0.7)

    this.physics.step(dt)
    this.reveal.update(dt)

    const p = car.physics.position
    this.areas.update(dt, elapsed, p.x, p.z)
    if (this._panelArea && this.areas.current !== this._panelArea) {
      this._panelArea = null
      this.ui.closePanel()
    }
    this.ui.setActionVisible(!!this.areas.current, this.areas.current?.actionLabel || 'OPEN')

    for (const u of this.updatables) u.update(dt, elapsed)

    this.camera.update(dt, car.group.position, car.physics.velocity)
    this.experience.setShadowCentre(p.x, p.z)
    this.sounds.updateEngine(car.physics.speed, Math.abs(controls.throttle), controls.boost)
  }
}
