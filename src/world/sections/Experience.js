import * as THREE from 'three'
import { Section } from './Section.js'
import { CANNON } from '../../core/Physics.js'
import { resume } from '../../content/resume.js'
import { flat, palette } from '../Materials.js'
import { board } from '../Board.js'
import { floorLabel, labelMesh } from '../Text.js'
import { hangar, hangarTrim, figureGeometry, FIGURE_HEIGHT } from '../props/Hangar.js'
import { InstancedProps } from '../props/InstancedProps.js'
import { Counter } from '../props/Counter.js'
import { RedButton } from '../props/RedButton.js'
import { buildPlaneMesh } from '../props/PlaneModel.js'

const HANGARS = [
  { id: 'tark', x: -40 },
  { id: 'epik', x: -52 },
  { id: 'consulting', x: -64 },
  { id: 'devcom', x: -76 },
]
const HZ = -42          // hangar centre in z
const MOUTH = -37.5     // z of the open front

/** A cylinder stretched between two points (for pipes and struts). */
function tube(a, b, radius, material, segments = 6) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(radius, radius, len, segments)
  const mesh = new THREE.Mesh(geo, material)
  mesh.position.copy(a).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return mesh
}

/**
 * Hangar Row: four drive-in hangars, newest nearest the crossroads, each containing a physics
 * diorama of the job — Tark's confidence gate, Epik's pipelines, the consulting deal corral,
 * and DevCom's twenty-one developers.
 */
export class ExperienceSection extends Section {
  constructor(world, def) {
    super(world, def)
    this.buildHangars()
    this.buildTimeline()
    this.buildPlane()
    this.buildTark()
    this.buildEpik()
    this.buildConsulting()
    this.buildDevCom()
  }

  buildHangars() {
    const { world } = this
    const built = []
    for (const h of HANGARS) {
      built.push(hangar(world, { x: h.x, z: HZ, number: HANGARS.indexOf(h) + 1 }))
      const job = resume.experience.find((e) => e.id === h.id)
      board(world, {
        x: h.x, z: MOUTH + 0.2, width: 8, height: 2.4, bottom: 5.1,
        accent: palette.cobalt, posts: false, physics: false, entry: h.id,
        title: job.company.toUpperCase(),
        subtitle: job.role,
        body: [job.period],
        titleSize: 0.5, bodySize: 0.22,
      })
      const area = world.addArea({
        x: h.x, z: -33, width: 5.5, depth: 3, label: job.company.toUpperCase(),
        color: palette.cobalt,
        onInteract: () => world.ui.togglePanel(h.id),
      })
      area.actionLabel = 'OPEN'
    }
    // Airlock collars and cobalt bands: one mesh per material for the whole row.
    hangarTrim(world, built)
  }

  /** A dashed timeline painted between the road and the hangar mouths. */
  buildTimeline() {
    const line = floorLabel('2026 ─────── 2025 ─────── 2024 ─────── 2023 ────── EARLIER', {
      width: 46, height: 1.4, color: palette.stencil, fontSize: 0.55, weight: 800,
    })
    line.position.set(-58, 0.03, -35.6)
    this.world.addStatic(line, { reveal: false })
  }

  /**
   * Parked light aircraft: the western landmark, visible over the fog. The same model as the
   * flyable plane, turned nose-east toward the hangars (the model's nose is −Z; rotation.y −π/2
   * sends it to +X), so its body box is wider than it is long.
   */
  buildPlane() {
    const { group } = buildPlaneMesh()
    group.name = 'landmark-plane'
    group.position.set(-92, 1.05, -30)
    group.rotation.y = -Math.PI / 2
    this.world.addStatic(group)
    const body = this.world.physics.box({ size: [7.0, 2.2, 8.8], mass: 0, position: [-92, 1.1, -30], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    this.world.physics.add(body)
  }

  /* ------------------------------------------------------------------ */
  /* H1 — Tark: a boom barrier you lift with your bumper                  */
  /* ------------------------------------------------------------------ */

  buildTark() {
    const { world } = this
    const x = -40
    const pivotX = x - 4.3

    const post = world.physics.box({ size: [0.45, 1.6, 0.45], mass: 0, position: [pivotX, 0.8, MOUTH], sleepy: false })
    post.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(post)
    const postMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.6, 0.45), flat(palette.ink))
    postMesh.position.set(pivotX, 0.8, MOUTH)
    world.addStatic(postMesh)

    // The boom: hinged at the post, resting on a stop. Gravity brings it back down.
    const boomLen = 8.4
    const boomGroup = new THREE.Group()
    const boomBar = new THREE.Mesh(new THREE.BoxGeometry(boomLen, 0.28, 0.28), flat(palette.terracotta))
    boomGroup.add(boomBar)
    for (let i = 0; i < 5; i++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.3), flat(palette.cream))
      band.position.x = -boomLen / 2 + 0.9 + i * 1.7
      boomGroup.add(band)
    }
    const boomLabel = labelMesh('CONFIDENCE GATE · <5% of cycles', { width: 5.6, height: 0.44, color: palette.ink, fontSize: 0.2, weight: 800 })
    boomLabel.position.set(0, 0, 0.16)
    boomGroup.add(boomLabel)

    const boomBody = world.physics.box({ size: [boomLen, 0.28, 0.28], mass: 2, position: [pivotX + boomLen / 2, 0.95, MOUTH] })
    boomBody.angularDamping = 0.35
    world.addDynamic(boomGroup, boomBody, { tag: 'gate', shadowRadius: { rx: 4, rz: 0.4 } })
    this.track(boomBody)
    this.boom = boomBody

    const hinge = new CANNON.HingeConstraint(post, boomBody, {
      pivotA: new CANNON.Vec3(0, 0.15, 0),
      pivotB: new CANNON.Vec3(-boomLen / 2, 0, 0),
      axisA: new CANNON.Vec3(0, 0, 1),
      axisB: new CANNON.Vec3(0, 0, 1),
      collideConnected: false,
    })
    world.physics.world.addConstraint(hinge)

    // Stop under the free end so the boom rests horizontally.
    const stop = world.physics.box({ size: [0.4, 0.6, 0.4], mass: 0, position: [pivotX + boomLen - 0.3, 0.3, MOUTH], sleepy: false })
    stop.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(stop)
    const stopMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), flat(palette.ink))
    stopMesh.position.set(pivotX + boomLen - 0.3, 0.3, MOUTH)
    world.addStatic(stopMesh)

    // Observe / Think / Act / Measure ring, spinning inside the hangar.
    const ring = new THREE.Group()
    ring.position.set(x, 1.4, HZ - 1)
    const torus = new THREE.Mesh(new THREE.TorusGeometry(2, 0.09, 6, 24), flat(palette.ink))
    torus.rotation.x = Math.PI / 2
    ring.add(torus)
    const stages = ['OBSERVE', 'THINK', 'ACT', 'MEASURE']
    stages.forEach((name, i) => {
      const a = (i / stages.length) * Math.PI * 2
      const tile = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.18), flat(palette.cream))
      tile.position.set(Math.cos(a) * 2, 0, Math.sin(a) * 2)
      tile.rotation.y = -a
      const text = labelMesh(name, { width: 1.4, height: 0.5, color: palette.ink, fontSize: 0.22, weight: 800 })
      text.position.z = 0.1
      tile.add(text)
      ring.add(tile)
    })
    this.otam = ring
    world.addStatic(ring)

    // Gate lamp: fires on a random <5% of one-second cycles, like the real confidence gate.
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.6 }))
    this.lamp.position.set(x, 3.2, HZ - 1)
    this.lampHot = flat(palette.terracotta, { emissive: palette.terracotta, emissiveIntensity: 1.4 })
    this.lampCool = this.lamp.material
    this.lampTimer = 0
    this.lampFlash = 0
    world.addStatic(this.lamp)
  }

  /* ------------------------------------------------------------------ */
  /* H2 — Epik: seven pipelines feeding a warehouse                       */
  /* ------------------------------------------------------------------ */

  buildEpik() {
    const { world } = this
    const x = -52
    const g = new THREE.Group()

    const warehouse = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 2.2), flat(palette.habitat))
    warehouse.position.set(x, 1.1, HZ - 3.2)
    g.add(warehouse)
    const whRoof = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.2, 2.5), flat(palette.cobalt))
    whRoof.position.set(x, 2.3, HZ - 3.2)
    g.add(whRoof)
    const whLabel = labelMesh('BigQuery', { width: 2.6, height: 0.6, color: palette.ink, fontSize: 0.3, weight: 800 })
    whLabel.position.set(x, 1.5, HZ - 2.05)
    g.add(whLabel)

    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 12), flat(palette.steel))
    tank.position.set(x, 0.9, HZ + 2.8)
    g.add(tank)

    // Seven pipes fanning from the tank into the warehouse; flow beads travel along them.
    // 0.2 m pipes inside a drive-in hangar: named so the collision audit can exempt them.
    const pipes = new THREE.Group()
    pipes.name = 'epik-pipes'
    const pipeMat = flat(palette.ink)
    this.flowPaths = []
    for (let i = 0; i < 7; i++) {
      const t = (i - 3) / 3
      const a = new THREE.Vector3(x + t * 0.8, 0.5, HZ + 2.2)
      const b = new THREE.Vector3(x + t * 1.5, 0.7, HZ - 2.2)
      pipes.add(tube(a, b, 0.11, pipeMat))
      this.flowPaths.push([a.clone(), b.clone()])
    }
    g.add(pipes)
    world.addStatic(g)

    // The warehouse and the tank are solid.
    const whBody = world.physics.box({ size: [3.4, 2.2, 2.2], mass: 0, position: [x, 1.1, HZ - 3.2], sleepy: false })
    whBody.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(whBody)
    const tankBody = world.physics.cylinder({ radiusTop: 0.9, radiusBottom: 0.9, height: 1.8, segments: 12, mass: 0, position: [x, 0.9, HZ + 2.8], sleepy: false })
    tankBody.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(tankBody)

    const flowGeo = new THREE.SphereGeometry(0.13, 6, 5)
    const flowMat = flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.9 })
    this.flow = new THREE.InstancedMesh(flowGeo, flowMat, this.flowPaths.length * 3)
    this.flow.frustumCulled = false
    this.flowOffsets = []
    for (let i = 0; i < this.flow.count; i++) this.flowOffsets.push((i % 3) / 3 + Math.floor(i / 3) * 0.04)
    world.addStatic(this.flow, { reveal: false })
    this._flowM = new THREE.Matrix4()
    this._flowP = new THREE.Vector3()

    // Counter on the warehouse: counts up to the real daily figure the first time you get close.
    this.counter = new Counter({ width: 2.8, height: 0.8 })
    this.counter.mesh.position.set(x, 2.6, HZ - 2.05)
    this.counter.set('2.3M records / day')
    world.addStatic(this.counter.mesh)
    this.counterValue = 0
    this.counterRunning = false
    this.counterDone = false
  }

  /* ------------------------------------------------------------------ */
  /* H3 — Independent consulting: shove companies through the fund thesis */
  /* ------------------------------------------------------------------ */

  buildConsulting() {
    const { world } = this
    const x = -64

    // Gate posts either side of the mouth, with the thesis painted between them.
    const postMat = flat(palette.ink)
    for (const sx of [-2, 2]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8), postMat)
      p.position.set(x + sx, 0.7, MOUTH)
      world.addStatic(p)
    }
    const decal = floorLabel('FUND THESIS', { width: 4, height: 1, color: palette.stencil, fontSize: 0.42, weight: 900 })
    decal.position.set(x, 0.03, MOUTH)
    world.addStatic(decal, { reveal: false })

    const ballGeo = new THREE.SphereGeometry(0.45, 12, 9)
    const bodies = []
    for (let i = 0; i < 9; i++) {
      const col = i % 3
      const row = Math.floor(i / 3)
      bodies.push(world.physics.sphere({
        radius: 0.45, mass: 0.8,
        position: [x - 1.2 + col * 1.2, 0.45, HZ - 1.6 + row * 1.2],
      }))
    }
    for (const b of bodies) { b.material = world.physics.materials.object; b.linearDamping = 0.12 }
    this.balls = new InstancedProps(world, {
      geometry: ballGeo,
      material: flat(palette.cream),
      bodies,
      tag: 'ball',
      shadowRadius: { rx: 0.45, rz: 0.45 },
    })
    bodies.forEach((b) => this.track(b))

    this.scoreboard = new Counter({ width: 3, height: 0.9 })
    this.scoreboard.mesh.position.set(x, 3.4, MOUTH + 0.05)
    this.scoreboard.set('SOURCED 0 / 9')
    world.addStatic(this.scoreboard.mesh)
    this.sourced = 0

    const tally = floorLabel('4,800+ COMPANIES · 9 SOURCES', { width: 8, height: 1.2, color: palette.stencil, fontSize: 0.42, weight: 800 })
    tally.position.set(x, 0.03, MOUTH + 2.4)
    world.addStatic(tally, { reveal: false })

    this.consultingButton = new RedButton(world, {
      x: x - 6, z: -35, bodies,
      onReset: () => { this.sourced = 0; this.scoreboard.set('SOURCED 0 / 9') },
    })
  }

  /* ------------------------------------------------------------------ */
  /* H4 — DevCom: bowl through twenty-one developers                      */
  /* ------------------------------------------------------------------ */

  buildDevCom() {
    const { world } = this
    const x = -76

    const building = new THREE.Group()
    const walls = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 2), flat(palette.habitat))
    walls.position.set(x, 1.1, HZ - 3.6)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), flat(palette.cobalt))
    roof.position.set(x, 2.8, HZ - 3.6)
    roof.rotation.y = Math.PI / 4
    const sign = labelMesh('InstiApp', { width: 2.4, height: 0.6, color: palette.ink, fontSize: 0.32, weight: 800 })
    sign.position.set(x, 1.4, HZ - 2.55)
    building.add(walls, roof, sign)
    world.addStatic(building)
    const buildingBody = world.physics.box({ size: [3.2, 2.2, 2], mass: 0, position: [x, 1.1, HZ - 3.6], sleepy: false })
    buildingBody.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(buildingBody)

    const decal = floorLabel('21 DEVELOPERS', { width: 5, height: 1.1, color: palette.stencil, fontSize: 0.44, weight: 900 })
    decal.position.set(x, 0.03, MOUTH - 0.5)
    world.addStatic(decal, { reveal: false })

    // Five short rows of little people, facing the road.
    const rows = [5, 4, 5, 4, 3]
    const bodies = []
    rows.forEach((n, r) => {
      for (let i = 0; i < n; i++) {
        const px = x + (i - (n - 1) / 2) * 0.95
        const pz = HZ + 2.2 - r * 1.1
        bodies.push(world.physics.cylinder({ radiusTop: 0.24, radiusBottom: 0.24, height: FIGURE_HEIGHT, segments: 8, mass: 0.5, position: [px, FIGURE_HEIGHT / 2, pz] }))
      }
    })
    const colors = [palette.habitat, palette.cobalt]
    this.devs = new InstancedProps(world, {
      geometry: figureGeometry(),
      material: flat(palette.habitat),
      bodies,
      tag: 'figure',
      shadowRadius: { rx: 0.28, rz: 0.28 },
      colors,
    })
    bodies.forEach((b) => this.track(b))
    this.devsDown = 0

    // The lead on a podium with the MAU flag.
    const podium = new THREE.Group()
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.2), flat(palette.concrete))
    block.position.set(x - 3.4, 0.35, HZ - 3.4)
    const lead = new THREE.Mesh(figureGeometry(), flat(palette.terracotta))
    lead.position.set(x - 3.4, 0.7 + FIGURE_HEIGHT / 2, HZ - 3.4)
    const flag = labelMesh('+10% MAU', { width: 1.8, height: 0.5, color: palette.ink, fontSize: 0.24, weight: 800 })
    flag.position.set(x - 3.4, 1.9, HZ - 3.4)
    podium.add(block, lead, flag)
    world.addStatic(podium)
    const podiumBody = world.physics.box({ size: [1.2, 0.7, 1.2], mass: 0, position: [x - 3.4, 0.35, HZ - 3.4], sleepy: false })
    podiumBody.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(podiumBody)

    this.devButton = new RedButton(world, { x: x - 6, z: -35, bodies })
  }

  /* ------------------------------------------------------------------ */

  onHorn() {
    // Inside a hangar the horn echoes.
    const p = this.world.car.physics.position
    for (const h of HANGARS) {
      if (Math.abs(p.x - h.x) < 4.4 && p.z < MOUTH && p.z > HZ - 4.5) {
        setTimeoutFree(this.world, 0.08, () => this.world.sounds.horn())
        break
      }
    }
  }

  update(dt, elapsed) {
    const { world } = this
    const car = world.car.physics.position

    // Tark: ring spins, gate lamp trips on a rare cycle.
    this.otam.rotation.y += dt * 0.4
    this.lampTimer += dt
    if (this.lampTimer >= 1) {
      this.lampTimer = 0
      if (Math.random() < 0.05) {
        this.lampFlash = 0.3
        this.lamp.material = this.lampHot
        world.sounds.blip(1000)
      }
    }
    if (this.lampFlash > 0) {
      this.lampFlash -= dt
      if (this.lampFlash <= 0) this.lamp.material = this.lampCool
    }

    // Epik: beads travel down the pipes; the counter runs once you are close.
    for (let i = 0; i < this.flow.count; i++) {
      const path = this.flowPaths[Math.floor(i / 3) % this.flowPaths.length]
      const t = (this.flowOffsets[i] + elapsed * 0.35) % 1
      this._flowP.lerpVectors(path[0], path[1], t)
      this._flowM.makeTranslation(this._flowP.x, this._flowP.y, this._flowP.z)
      this.flow.setMatrixAt(i, this._flowM)
    }
    this.flow.instanceMatrix.needsUpdate = true

    if (!this.counterDone) {
      if (!this.counterRunning && Math.hypot(car.x + 52, car.z - HZ) < 16) this.counterRunning = true
      if (this.counterRunning) {
        this.counterValue = Math.min(2300000, this.counterValue + dt * 1450000)
        const n = Math.round(this.counterValue)
        this.counter.set(`${n.toLocaleString('en-US')} records / day`)
        if (n >= 2300000) {
          this.counterDone = true
          this.counter.set('2,300,000 records / day')
        }
      }
    }

    // Consulting: count the companies pushed out through the thesis gate.
    let sourced = 0
    for (const b of this.balls.bodies) if (b.position.z > MOUTH + 1) sourced++
    if (sourced !== this.sourced) {
      const gained = sourced > this.sourced
      this.sourced = sourced
      this.scoreboard.set(`SOURCED ${sourced} / 9`, { highlight: sourced === 9 })
      if (gained) {
        if (sourced === 9) { world.sounds.arpeggio(); world.ui.toast('All nine sourced.') }
        else world.sounds.ding()
      }
    }

    // DevCom: how many of the twenty-one are down.
    const down = this.devs.countDown()
    if (down !== this.devsDown) {
      this.devsDown = down
      if (down === 21) { world.sounds.arpeggio(); world.ui.toast('All 21 developers down.') }
    }
    const inside = this.contains(car.x, car.z)
    world.ui.setChip('devs', inside && down > 0 ? `DOWN ${down} / 21` : null)
  }

  onLeave() {
    this.world.ui.setChip('devs', null)
  }

  reset() {
    super.reset()
    this.sourced = 0
    this.scoreboard.set('SOURCED 0 / 9')
    this.devsDown = 0
    this.world.ui.setChip('devs', null)
  }
}

/** Frame-driven delay (no timers): schedules a callback on the world's update list. */
function setTimeoutFree(world, seconds, fn) {
  let t = 0
  const task = {
    update(dt) {
      t += dt
      if (t >= seconds) { world.removeUpdatable(task); fn() }
    },
  }
  world.addUpdatable(task)
}
