import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Section } from './Section.js'
import { resume } from '../../content/resume.js'
import { flat, palette } from '../Materials.js'
import { board } from '../Board.js'
import { boardMesh, labelMesh, floorLabel } from '../Text.js'
import { figureGeometry, FIGURE_HEIGHT } from '../props/Hangar.js'
import { rocketStep } from './rocketLaunch.js'

const PADS = [
  { id: 'screening', x: 40, z: -42, enter: [40, -33] },
  { id: 'instiapp', x: 52, z: -18, enter: [52, -27] },
  { id: 'trading', x: 64, z: -42, enter: [64, -33] },
  { id: 'drone', x: 76, z: -18, enter: [76, -27] },
]

/**
 * Launch pads: one concrete slab and gantry billboard per project, each with a working model
 * of the project on it. The drone leaves its pad and follows you around.
 */
export class ProjectsSection extends Section {
  constructor(world, def) {
    super(world, def)
    this.buildPads()
    this.buildScreening()
    this.buildInstiApp()
    this.buildTrading()
    this.buildDrone()
    this.buildRocket()
    this.buildLaunchPad()
    this.rocket = { state: 'idle', t: 0, y: 0, cooldown: 0 }
    this._lastCountdownSec = null
    this._launchedFx = false
  }

  buildPads() {
    const { world } = this
    for (const pad of PADS) {
      const project = resume.projects.find((p) => p.id === pad.id)
      const g = new THREE.Group()
      g.position.set(pad.x, 0, pad.z)

      const slab = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.3, 20), flat(palette.concrete))
      slab.position.y = 0.15
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.12, 4, 24), flat(palette.terracotta))
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.32
      g.add(slab, ring)

      // Gantry holding the billboard
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 7.4, 0.25), flat(palette.ink))
        post.position.set(sx * 3.6, 3.7, -3.5)
        g.add(post)
        const body = world.physics.box({ size: [0.3, 7.4, 0.3], mass: 0, position: [pad.x + sx * 3.6, 3.7, pad.z - 3.5], sleepy: false })
        body.userData = { kind: 'wall', tag: 'wall' }
        world.physics.add(body)
      }
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, 0.25), flat(palette.cream))
      crossbar.position.set(0, 7.4, -3.5)
      g.add(crossbar)
      world.addStatic(g)

      const slabBody = world.physics.cylinder({ radiusTop: 5, radiusBottom: 5, height: 0.3, segments: 16, mass: 0, position: [pad.x, 0.15, pad.z], sleepy: false })
      slabBody.userData = { kind: 'wall', tag: 'wall' }
      world.physics.add(slabBody)

      board(world, {
        x: pad.x, z: pad.z - 3.5, width: 7, height: 3, bottom: 2.6,
        accent: palette.terracotta, posts: false, physics: false, entry: pad.id,
        title: project.title.toUpperCase(),
        subtitle: project.subtitle,
        body: [project.description],
        titleSize: 0.42, bodySize: 0.2,
      })

      const area = world.addArea({
        x: pad.enter[0], z: pad.enter[1], width: 5, depth: 3, label: project.title.toUpperCase(),
        color: palette.terracotta,
        onInteract: () => world.ui.togglePanel(pad.id),
      })
      area.actionLabel = 'OPEN'
    }
  }

  /** A — rural clinic with a diagnosis slip being read by a small language model. */
  buildScreening() {
    const g = new THREE.Group()
    g.position.set(40, 0.3, -42)
    const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), flat(palette.cream))
    hut.position.y = 1
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), flat(palette.terracotta))
    roof.position.y = 2.6
    roof.rotation.y = Math.PI / 4
    const crossA = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.26, 0.06), flat(palette.clay))
    crossA.position.set(0, 1.3, 1.52)
    const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.1, 0.06), flat(palette.clay))
    crossB.position.set(0, 1.3, 1.52)
    g.add(hut, roof, crossA, crossB)

    this.slip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.04), flat(palette.cream))
    this.slip.position.set(0, 3.9, 0)
    this.slmCube = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), flat(palette.ink))
    const slmLabel = labelMesh('SLM', { width: 0.55, height: 0.4, color: palette.cream, fontSize: 0.22, weight: 900 })
    slmLabel.position.z = 0.31
    this.slmCube.add(slmLabel)
    g.add(this.slip, this.slmCube)
    this.world.addStatic(g)

    const body = this.world.physics.box({ size: [3, 2, 3], mass: 0, position: [40, 1.3, -42], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    this.world.physics.add(body)
  }

  /** B — a giant phone showing the campus app, with students walking around it. */
  buildInstiApp() {
    const { world } = this
    const g = new THREE.Group()
    g.position.set(52, 0.3, -18)

    const stand = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 1.2), flat(palette.concrete))
    stand.position.y = 0.2
    const phone = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5, 0.3), flat(palette.ink))
    phone.position.set(0, 2.9, 0)
    phone.rotation.x = -0.2
    const screen = boardMesh({
      width: 2.2, height: 4.4, ppu: 110,
      background: palette.cream, accent: palette.cobalt, titleColor: palette.ink,
      title: 'InstiApp',
      subtitle: 'DIGITAL STUDENT ID',
      body: ['ID · MEAL · BADGE · FORUM', 'Achievement verification', 'Discussion forums'],
      footer: '5,000+ students daily',
      titleSize: 0.34, bodySize: 0.17, padding: 0.22,
    })
    screen.position.z = 0.17
    phone.add(screen)
    g.add(stand, phone)
    world.addStatic(g)

    const body = world.physics.box({ size: [2.6, 5, 0.9], mass: 0, position: [52, 2.8, -18], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)

    // Five students circling the phone (decorative, one draw call).
    this.walkers = new THREE.InstancedMesh(figureGeometry(), flat(palette.sage), 5)
    this.walkers.frustumCulled = false
    world.addStatic(this.walkers, { reveal: false })
    this._walkM = new THREE.Matrix4()
    this._walkP = new THREE.Vector3()
    this._walkQ = new THREE.Quaternion()
    this._walkS = new THREE.Vector3(1, 1, 1)
  }

  /** C — a candlestick chart the agent keeps trading against. */
  buildTrading() {
    const { world } = this
    const g = new THREE.Group()
    g.position.set(64, 0.3, -42)

    const base = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 1.2), flat(palette.concrete))
    base.position.y = 0.1
    g.add(base)
    this.candles = []
    for (let i = 0; i < 9; i++) {
      const h = 0.6 + Math.abs(Math.sin(i * 1.7)) * 2.4
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1, 0.42), flat(i % 2 ? palette.sage : palette.terracotta))
      c.position.set(-2.6 + i * 0.65, 0.2, 0)
      c.scale.y = h
      c.userData.h = h
      // Scale about the base rather than the centre.
      c.geometry.translate(0, 0.5, 0)
      g.add(c)
      this.candles.push(c)
    }

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), flat(palette.ink))
    neck.position.set(2.6, 1.2, 0)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.9, 10), flat(palette.sage))
    torso.position.set(2.6, 0.55, 0)
    this.robotHead = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), flat(palette.ink))
    this.robotHead.position.set(2.6, 1.9, 0)
    for (const sx of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 1 }))
      eye.position.set(sx, 0.05, 0.41)
      this.robotHead.add(eye)
    }
    g.add(neck, torso, this.robotHead)

    this.dqnCube = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.5 }))
    this.dqnCube.position.set(0, 4.2, 0)
    const dqn = labelMesh('DQN', { width: 0.65, height: 0.4, color: palette.ink, fontSize: 0.24, weight: 900 })
    dqn.position.z = 0.36
    this.dqnCube.add(dqn)
    g.add(this.dqnCube)
    world.addStatic(g)
    this.candleTimer = 0
    this._robotTarget = new THREE.Vector3()
  }

  /** D — the drone: lifts off its H pad and follows you, then goes home. */
  buildDrone() {
    const { world } = this
    const h = floorLabel('H', { width: 3, height: 3, color: '#8E8778', fontSize: 2.2, weight: 900 })
    h.position.set(76, 0.32, -18)
    world.addStatic(h, { reveal: false })

    const g = new THREE.Group()
    g.position.set(76, 3, -18)
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), flat(palette.ink))
    const cam = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.9 }))
    cam.position.set(0, -0.22, 0.4)
    g.add(body, cam)
    this.rotors = []
    for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 1.3), flat(palette.ink))
      arm.position.set(ax * 0.45, 0, az * 0.45)
      arm.rotation.y = ax * az > 0 ? Math.PI / 4 : -Math.PI / 4
      g.add(arm)
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 10), flat(palette.cream))
      rotor.position.set(ax * 0.85, 0.14, az * 0.85)
      g.add(rotor)
      this.rotors.push(rotor)
    }
    this.drone = g
    this.droneHome = new THREE.Vector3(76, 3, -18)
    this.droneVel = new THREE.Vector3()
    this.droneChasing = false
    this.droneRoll = 0
    world.addStatic(g)
    this._droneTarget = new THREE.Vector3()
  }

  /** The eastern landmark. It never actually launches. */
  buildRocket() {
    const { world } = this
    const g = new THREE.Group()
    g.position.set(96, 0, -30)
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.6, 12), flat(palette.concrete))
    stand.position.y = 0.3
    const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 9, 12), flat(palette.cream))
    bodyMesh.position.y = 5.1
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.8, 12), flat(palette.terracotta))
    nose.position.y = 11
    const bell = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.2, 12, 1, true), flat(palette.ink, { side: THREE.DoubleSide, emissive: palette.lamp, emissiveIntensity: 0 }))
    bell.position.y = 0.9
    bell.rotation.x = Math.PI
    g.add(stand, bodyMesh, nose, bell)
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 1.6), flat(palette.terracotta))
      const a = (i / 4) * Math.PI * 2
      fin.position.set(Math.cos(a) * 1.3, 1.7, Math.sin(a) * 1.3)
      fin.rotation.y = -a
      g.add(fin)
    }
    this.rocketTip = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 1 }))
    this.rocketTip.position.y = 12.6
    g.add(this.rocketTip)

    // Parachute for the ride back down; hidden until the rocket starts falling.
    this.rocketParachute = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, 3, 8, 1, true),
      flat(palette.cream, { side: THREE.DoubleSide }),
    )
    this.rocketParachute.position.y = 14.5
    this.rocketParachute.visible = false
    g.add(this.rocketParachute)

    // Grid fins near the base: a merged cross of two thin boxes per fin.
    const gridFinParts = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const finA = new THREE.BoxGeometry(0.5, 0.5, 0.06)
      finA.translate(Math.cos(a) * 1.5, 3.2, Math.sin(a) * 1.5)
      const finB = new THREE.BoxGeometry(0.06, 0.5, 0.5)
      finB.translate(Math.cos(a) * 1.5, 3.2, Math.sin(a) * 1.5)
      gridFinParts.push(finA, finB)
    }
    g.add(new THREE.Mesh(mergeGeometries(gridFinParts), flat(palette.ink)))

    // Stage bands, so the body is not one blank cylinder.
    const bandParts = []
    for (const y of [3.4, 6.4, 9.4]) {
      const band = new THREE.CylinderGeometry(1.34, 1.34, 0.35, 12)
      band.translate(0, y, 0)
      bandParts.push(band)
    }
    g.add(new THREE.Mesh(mergeGeometries(bandParts), flat(palette.cobalt)))

    // Launch clamps gripping the base.
    const clampParts = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const clamp = new THREE.BoxGeometry(0.5, 0.9, 0.25)
      clamp.rotateY(-a)
      clamp.translate(Math.cos(a) * 1.6, 0.85, Math.sin(a) * 1.6)
      clampParts.push(clamp)
    }
    this.rocketClamps = new THREE.Mesh(mergeGeometries(clampParts), flat(palette.ink))
    world.addStatic(this.rocketClamps.clone().translateX(96).translateZ(-30), { reveal: false })

    // Service gantry beside the pad: uprights, cross braces and three walkway tiers.
    const gantryParts = []
    for (const dz of [-0.35, 0.35]) {
      const upright = new THREE.BoxGeometry(0.22, 12, 0.22)
      upright.translate(4.6, 6, dz)
      gantryParts.push(upright)
    }
    for (let i = 0; i < 6; i++) {
      const brace = new THREE.BoxGeometry(0.12, 0.12, 0.9)
      brace.rotateX(Math.PI / 4)
      brace.translate(4.6, 1.2 + i * 2, 0)
      gantryParts.push(brace)
    }
    const gantry = new THREE.Mesh(mergeGeometries(gantryParts), flat(palette.concrete))
    gantry.position.set(96, 0, -30)
    world.addStatic(gantry, { reveal: false })

    const walkParts = []
    for (const y of [3.5, 7, 10.5]) {
      const w = new THREE.BoxGeometry(2.4, 0.12, 0.6)
      w.translate(3.3, y, 0)
      walkParts.push(w)
    }
    const walkways = new THREE.Mesh(mergeGeometries(walkParts), flat(palette.sage))
    walkways.position.set(96, 0, -30)
    world.addStatic(walkways, { reveal: false })

    this.rocketBell = bell
    this.rocketGroup = g
    world.addStatic(g)

    const body = world.physics.cylinder({ radiusTop: 1.5, radiusBottom: 1.5, height: 12, segments: 10, mass: 0, position: [96, 6, -30], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }

  onHorn() {
    const p = this.world.car.physics.position
    if (Math.hypot(p.x - 76, p.z + 18) < 12) {
      this.droneRoll = 0.6
      this.world.sounds.blip(1400)
    }
    if (Math.hypot(p.x - 96, p.z + 30) < 14) this.armRocket()
  }

  /** A pad beside the rocket that starts the countdown. */
  buildLaunchPad() {
    const area = this.world.addArea({
      x: 90, z: -30, width: 4.5, depth: 3, label: 'LAUNCH',
      color: palette.terracotta,
      onInteract: () => this.armRocket(),
    })
    area.actionLabel = 'LAUNCH'
  }

  armRocket() {
    if (this.rocket.state !== 'idle' || this.rocket.cooldown > 0) return
    this.rocket = { ...this.rocket, state: 'countdown', t: 0 }
    this.world.ui.toast('3 · 2 · 1 …')
    this.world.sounds.blip(880)
  }

  update(dt, elapsed) {
    const car = this.world.car.physics.position

    // A: the slip spins, the model orbits it.
    this.slip.rotation.y += dt * 0.8
    this.slmCube.position.set(40 + Math.cos(elapsed * 0.9) * 1.4, 4.2, -42 + Math.sin(elapsed * 0.9) * 1.4)
    this.slmCube.rotation.y += dt * 1.2

    // B: students walk a slow circle.
    for (let i = 0; i < 5; i++) {
      const a = elapsed * 0.35 + (i / 5) * Math.PI * 2
      this._walkP.set(52 + Math.cos(a) * 3.2, 0.3 + FIGURE_HEIGHT / 2, -18 + Math.sin(a) * 3.2)
      this._walkQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
      this._walkM.compose(this._walkP, this._walkQ, this._walkS)
      this.walkers.setMatrixAt(i, this._walkM)
    }
    this.walkers.instanceMatrix.needsUpdate = true

    // C: one candle re-prints every few seconds; the robot watches you.
    this.candleTimer += dt
    if (this.candleTimer > 4) {
      this.candleTimer = 0
      const c = this.candles[Math.floor(Math.random() * this.candles.length)]
      c.userData.h = 0.6 + Math.random() * 2.6
    }
    for (const c of this.candles) c.scale.y += (c.userData.h - c.scale.y) * (1 - Math.exp(-dt * 4))
    if (Math.hypot(car.x - 64, car.z + 42) < 16) {
      this._robotTarget.set(car.x, 2.2, car.z)
      this.robotHead.lookAt(this._robotTarget)
    }
    this.dqnCube.rotation.y += dt * 0.9
    this.dqnCube.position.y = 4.2 + Math.sin(elapsed * 1.6) * 0.15

    this.updateDrone(dt, elapsed, car)

    this.updateRocket(dt, elapsed, car)
  }

  /** Countdown, lift-off, coast and a parachute back onto the clamps. */
  updateRocket(dt, elapsed, car) {
    const { world } = this
    const prev = this.rocket.state
    this.rocket = rocketStep(this.rocket, dt)
    const { state } = this.rocket

    if (state === 'countdown') {
      const secLeft = Math.max(1, Math.ceil(3 - this.rocket.t))
      world.ui.setChip('rocket', `T-${secLeft}`)
      if (secLeft !== this._lastCountdownSec) {
        this._lastCountdownSec = secLeft
        world.sounds.blip(660 + (3 - secLeft) * 220)
      }
      this.rocketTip.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(elapsed * 12))
      this.rocketBell.material.emissiveIntensity = (this.rocket.t / 3) * 1.4
    }

    if (state === 'ascending') {
      if (!this._launchedFx) {
        this._launchedFx = true
        world.sounds.whoosh()
        world.ui.setChip('rocket', 'LIFT-OFF')
        if (!world.reducedMotion && Math.hypot(car.x - 96, car.z + 30) < 25) world.camera.shake = 0.5
      }
      this.rocketBell.material.emissiveIntensity = 1.4
      this._smokeT = (this._smokeT || 0) + dt
      if (this._smokeT > 0.08) {
        this._smokeT = 0
        world.particles?.emit(new THREE.Vector3(96, 0.4, -30), {
          count: 4, color: '#BFB8A8', spread: 2.2, life: 1.2, size: 0.3,
          velocity: new THREE.Vector3(0, 1.5, 0), gravity: 1,
        })
      }
    }

    if (state === 'coasting' || state === 'descending') {
      this.rocketBell.material.emissiveIntensity = 0
      this.rocketParachute.visible = true
      if (state === 'descending') this.rocketGroup.position.x = 96 + Math.sin(elapsed * 0.8) * 1.5
    }

    if (state !== 'idle') {
      this.rocketGroup.position.y = this.rocket.y
      // Lift the camera to watch it, but only if the visitor is near enough to be watching.
      const near = Math.hypot(car.x - 96, car.z + 30) < 45
      if (near && !world.reducedMotion) world.requestFocusAltitude(this.rocket.y * 0.55)
    }

    if (state === 'idle' && prev === 'descending') {
      world.sounds.hit(0.6, 90, { noise: true })
      world.ui.toast('Recovered. Pad resets in a moment.')
      this.rocketGroup.position.set(96, 0, -30)
      this.rocketParachute.visible = false
      this.rocketBell.material.emissiveIntensity = 0
      this.rocketTip.material.emissiveIntensity = 1
      this._launchedFx = false
      this._lastCountdownSec = null
      world.ui.setChip('rocket', null)
    }
  }

  updateDrone(dt, elapsed, car) {
    const d = Math.hypot(car.x - this.drone.position.x, car.z - this.drone.position.z)
    if (!this.droneChasing && Math.hypot(car.x - 76, car.z + 18) < 16) this.droneChasing = true
    else if (this.droneChasing && Math.hypot(car.x - 76, car.z + 18) > 26 && d > 24) this.droneChasing = false

    if (this.droneChasing) this._droneTarget.set(car.x, Math.max(2.8, car.y + 3.2), car.z + 1.6)
    else this._droneTarget.copy(this.droneHome).setY(3 + Math.sin(elapsed * 1.2) * 0.2)

    // Critically damped spring toward the target.
    const k = 4
    const c = 2 * Math.sqrt(k)
    const p = this.drone.position
    this.droneVel.x += ((this._droneTarget.x - p.x) * k - this.droneVel.x * c) * dt
    this.droneVel.y += ((this._droneTarget.y - p.y) * k - this.droneVel.y * c) * dt
    this.droneVel.z += ((this._droneTarget.z - p.z) * k - this.droneVel.z * c) * dt
    p.addScaledVector(this.droneVel, dt)
    if (p.y < 2.6) p.y = 2.6

    this.drone.rotation.z = THREE.MathUtils.clamp(-this.droneVel.x * 0.05, -0.44, 0.44)
    this.drone.rotation.x = THREE.MathUtils.clamp(this.droneVel.z * 0.05, -0.44, 0.44)
    if (this.droneRoll > 0) {
      this.droneRoll = Math.max(0, this.droneRoll - dt)
      this.drone.rotation.y = (1 - this.droneRoll / 0.6) * Math.PI * 2
    }
    const spin = dt * 40
    for (const r of this.rotors) r.rotation.y += spin
  }
}
