import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Section } from './Section.js'
import { CANNON } from '../../core/Physics.js'
import { flat, palette } from '../Materials.js'
import { board } from '../Board.js'
import { floorLabel } from '../Text.js'
import { InstancedProps } from '../props/InstancedProps.js'
import { RedButton } from '../props/RedButton.js'

const LANE = { x: 62, apexZ: 33, ballZ: 45 }
const RAMP = { x: 70, z: 54, run: 6, rise: 1.7, width: 4.5 }
const HOOP = { x: 84, z: 54 }

function pinGeometry() {
  const body = new THREE.CylinderGeometry(0.16, 0.26, 1, 8)
  const head = new THREE.SphereGeometry(0.2, 8, 6)
  head.translate(0, 0.52, 0)
  return mergeGeometries([body, head])
}

function bestOf(key, value) {
  try {
    const prev = Number(localStorage.getItem(key))
    if (!prev || value < prev) { localStorage.setItem(key, String(value)); return true }
  } catch { /* storage unavailable */ }
  return false
}

/**
 * Test Range: the part of the site with no resume on it at all. Bowling, a brick wall,
 * a timed cone slalom, a ramp with a hoop, and a see-saw.
 */
export class PlaygroundSection extends Section {
  constructor(world, def) {
    super(world, def)
    this.buildSign()
    this.buildBowling()
    this.buildBricks()
    this.buildSlalom()
    this.buildRamp()
    this.buildSeesaw()
    this.buildTyres()
    this.pinsDown = 0
    this.bricksDown = 0
    this.slalom = null
    this.slalomBest = null
    this.air = null
    this.hoopArmed = true
  }

  buildSign() {
    board(this.world, {
      x: 36, z: 24, width: 6.4, height: 2.4, bottom: 1.4,
      accent: palette.lamp,
      title: 'TEST RANGE',
      body: ['I won IIT Bombay’s institute-wide Game Dev Hackathon — this bit is for fun. Nothing important lives here.'],
      titleSize: 0.5, bodySize: 0.21,
    })
  }

  buildBowling() {
    const { world } = this
    const lane = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 16), flat(palette.concrete))
    lane.position.set(LANE.x, 0.05, 38)
    world.addStatic(lane)
    for (const sx of [-2.4, 2.4]) {
      const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 16), flat(palette.cream))
      gutter.position.set(LANE.x + sx, 0.07, 38)
      world.addStatic(gutter)
    }
    const backstop = world.physics.box({ size: [4.4, 1.4, 0.4], mass: 0, position: [LANE.x, 0.7, 29], sleepy: false })
    backstop.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(backstop)
    const backMesh = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, 0.4), flat(palette.cream))
    backMesh.position.set(LANE.x, 0.7, 29)
    world.addStatic(backMesh)

    // Ten pins in a triangle, apex toward the ball.
    const bodies = []
    let row = 0
    let placed = 0
    while (placed < 10) {
      row++
      for (let i = 0; i < row && placed < 10; i++) {
        const px = LANE.x + (i - (row - 1) / 2) * 0.75
        const pz = LANE.apexZ - (row - 1) * 0.7
        bodies.push(world.physics.cylinder({ radiusTop: 0.24, radiusBottom: 0.24, height: 1, segments: 8, mass: 1.5, position: [px, 0.55, pz] }))
        placed++
      }
    }
    this.pins = new InstancedProps(world, {
      geometry: pinGeometry(),
      material: flat(palette.cream),
      bodies,
      tag: 'pin',
      shadowRadius: { rx: 0.28, rz: 0.28 },
    })
    bodies.forEach((b) => this.track(b))

    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), flat(palette.cobalt))
    const ballBody = world.physics.sphere({ radius: 0.5, mass: 6, position: [LANE.x, 0.5, LANE.ballZ] })
    ballBody.linearDamping = 0.15
    world.addDynamic(ball, ballBody, { tag: 'ball', shadowRadius: { rx: 0.5, rz: 0.5 } })
    this.track(ballBody)

    this.pinButton = new RedButton(world, { x: 58, z: 48, bodies: [...bodies, ballBody], onReset: () => { this.pinsDown = 0 } })
  }

  buildBricks() {
    const { world } = this
    const rows = world.experience.quality === 'low' ? 3 : 5
    const cols = 6
    const bodies = []
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 ? 0.6 : 0
      for (let c = 0; c < cols; c++) {
        bodies.push(world.physics.box({
          size: [1.2, 0.5, 0.6], mass: 1,
          position: [42 + (c - (cols - 1) / 2) * 1.23 + offset, 0.26 + r * 0.53, 26],
        }))
      }
    }
    for (const b of bodies) b.linearDamping = 0.05
    this.bricks = new InstancedProps(world, {
      geometry: new THREE.BoxGeometry(1.2, 0.5, 0.6),
      material: flat(palette.terracotta),
      bodies,
      tag: 'brick',
      shadowRadius: { rx: 0.7, rz: 0.4 },
      colors: [palette.terracotta, palette.clay],
    })
    bodies.forEach((b) => this.track(b))
    this.brickCount = bodies.length
    this.brickHomes = bodies.map((b) => ({ x: b.position.x, z: b.position.z }))
    this.brickButton = new RedButton(world, { x: 36, z: 26, bodies, onReset: () => { this.bricksDown = 0 } })
  }

  buildSlalom() {
    const { world } = this
    const coneGeo = mergeGeometries([
      new THREE.ConeGeometry(0.35, 0.9, 8).translate(0, 0.1, 0),
      new THREE.BoxGeometry(0.9, 0.08, 0.9).translate(0, -0.4, 0),
    ])
    const bodies = []
    for (let i = 0; i < 12; i++) {
      const x = 32 + i * 3
      const z = 54 + (i % 2 ? 0.9 : -0.9)
      bodies.push(world.physics.box({ size: [0.7, 0.9, 0.7], mass: 0.5, position: [x, 0.45, z] }))
    }
    this.cones = new InstancedProps(world, {
      geometry: coneGeo,
      material: flat(palette.terracotta),
      bodies,
      tag: 'cone',
      shadowRadius: { rx: 0.45, rz: 0.45 },
    })
    bodies.forEach((b) => this.track(b))
    this.coneHomes = bodies.map((b) => ({ x: b.position.x, z: b.position.z }))
    this.coneButton = new RedButton(world, { x: 30, z: 58, bodies, onReset: () => { this.slalom = null } })

    const start = floorLabel('SLALOM ▶', { width: 5, height: 1.2, color: '#9C8B63', fontSize: 0.44, weight: 800 })
    start.position.set(30, 0.03, 50)
    world.addStatic(start, { reveal: false })
  }

  buildRamp() {
    const { world } = this
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.lineTo(RAMP.run, 0)
    shape.lineTo(RAMP.run, RAMP.rise)
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: RAMP.width, bevelEnabled: false })
    geo.translate(-RAMP.run / 2, 0, -RAMP.width / 2)
    const mesh = new THREE.Mesh(geo, flat(palette.concrete))
    mesh.position.set(RAMP.x, 0, RAMP.z)
    world.addStatic(mesh)

    const angle = Math.atan2(RAMP.rise, RAMP.run)
    const q = new CANNON.Quaternion()
    q.setFromEuler(0, 0, angle)
    const body = world.physics.box({
      size: [Math.hypot(RAMP.run, RAMP.rise), 0.4, RAMP.width],
      mass: 0,
      position: [RAMP.x, RAMP.rise / 2 - 0.16, RAMP.z],
      quaternion: q,
      sleepy: false,
    })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)

    // Landing marks past the lip
    ;[[5, '5 m'], [10, '10 m'], [15, '15 m']].forEach(([d, text]) => {
      const mark = floorLabel(text, { width: 2.6, height: 1, color: '#9C8B63', fontSize: 0.44, weight: 900 })
      mark.position.set(RAMP.x + RAMP.run / 2 + d, 0.03, RAMP.z)
      world.addStatic(mark, { reveal: false })
    })
    const big = floorLabel('BIG AIR', { width: 5, height: 1.2, color: '#9C8B63', fontSize: 0.5, weight: 900 })
    big.position.set(RAMP.x + 23, 0.03, RAMP.z)
    world.addStatic(big, { reveal: false })

    // Hoop to fly through
    const hoop = new THREE.Group()
    hoop.position.set(HOOP.x, 0, HOOP.z)
    const torus = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 8, 20), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.5 }))
    torus.position.y = 3
    torus.rotation.y = Math.PI / 2
    hoop.add(torus)
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6), flat(palette.ink))
      foot.position.set(0, 0.6, sz * 1.6)
      hoop.add(foot)
    }
    world.addStatic(hoop)
  }

  buildSeesaw() {
    const { world } = this
    const fulcrum = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 10), flat(palette.terracotta))
    fulcrum.rotation.x = Math.PI / 2
    fulcrum.position.set(40, 0.5, 44)
    world.addStatic(fulcrum)
    const fulcrumBody = world.physics.box({ size: [1, 1, 1.6], mass: 0, position: [40, 0.5, 44], sleepy: false })
    fulcrumBody.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(fulcrumBody)

    const plank = new THREE.Mesh(new THREE.BoxGeometry(7, 0.22, 1.6), flat(palette.sage))
    const plankBody = world.physics.box({ size: [7, 0.22, 1.6], mass: 8, position: [40, 1.1, 44] })
    plankBody.angularDamping = 0.2
    world.addDynamic(plank, plankBody, { tag: 'seesaw', shadowRadius: { rx: 3.5, rz: 0.9 } })
    this.track(plankBody)

    const hinge = new CANNON.HingeConstraint(fulcrumBody, plankBody, {
      pivotA: new CANNON.Vec3(0, 0.6, 0),
      pivotB: new CANNON.Vec3(0, 0, 0),
      axisA: new CANNON.Vec3(0, 0, 1),
      axisB: new CANNON.Vec3(0, 0, 1),
      collideConnected: false,
    })
    world.physics.world.addConstraint(hinge)
  }

  /** A ring of stacked tyres marking the edge of the range. */
  buildTyres() {
    const { world } = this
    const count = world.experience.quality === 'low' ? 24 : 40
    const geo = new THREE.TorusGeometry(0.6, 0.25, 6, 10)
    geo.rotateX(Math.PI / 2)
    const mesh = new THREE.InstancedMesh(geo, flat(palette.ink), count)
    mesh.frustumCulled = false
    const m = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const stack = i % 3
      m.makeTranslation(52 + Math.cos(a) * 22, 0.25 + stack * 0.4, 40 + Math.sin(a) * 21)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
    world.addStatic(mesh, { reveal: false })
  }

  onLeave() {
    for (const id of ['pins', 'bricks', 'slalom']) this.world.ui.setChip(id, null)
  }

  reset() {
    super.reset()
    this.pinsDown = 0
    this.bricksDown = 0
    this.slalom = null
  }

  update(dt, elapsed) {
    const { world } = this
    const car = world.car.physics
    const p = car.position
    const inside = this.contains(p.x, p.z)

    // Pins
    const down = this.pins.countDown()
    if (down !== this.pinsDown) {
      if (down === 10 && this.pinsDown < 10) { world.sounds.arpeggio(); world.ui.toast('STRIKE!') }
      this.pinsDown = down
    }
    world.ui.setChip('pins', inside && down > 0 ? `PINS ${down} / 10` : null)

    // Bricks: count the ones knocked off their spot
    let bricksDown = 0
    this.bricks.bodies.forEach((b, i) => {
      const home = this.brickHomes[i]
      if (Math.hypot(b.position.x - home.x, b.position.z - home.z) > 0.3) bricksDown++
    })
    this.bricksDown = bricksDown
    world.ui.setChip('bricks', inside && bricksDown > 0 ? `BRICKS ${bricksDown} / ${this.brickCount}` : null)

    this.updateSlalom(dt, p, car)
    this.updateAir(dt, p, car)
  }

  updateSlalom(dt, p, car) {
    const { world } = this
    const onCourse = Math.abs(p.z - 54) < 6
    if (!this.slalom && onCourse && p.x > 30 && p.x < 33 && car.velocity.x > 3) {
      this.slalom = { t: 0, clean: true }
    }
    if (this.slalom) {
      this.slalom.t += dt
      // A cone knocked more than 0.3 m from home spoils the run.
      this.cones.bodies.forEach((b, i) => {
        const home = this.coneHomes[i]
        if (Math.hypot(b.position.x - home.x, b.position.z - home.z) > 0.3) this.slalom.clean = false
      })
      world.ui.setChip('slalom', `SLALOM ${this.slalom.t.toFixed(1)}s${this.slalom.clean ? '' : ' · touched'}`)
      if (p.x > 65 && onCourse) {
        const time = this.slalom.t
        const clean = this.slalom.clean
        this.slalom = null
        if (clean) {
          const best = bestOf('portfolio-slalom', time)
          world.ui.toast(`Clean slalom in ${time.toFixed(1)}s${best ? ' — new best!' : ''}`)
          world.sounds.arpeggio()
        } else {
          world.ui.toast(`Slalom ${time.toFixed(1)}s — cones down.`)
        }
        world.ui.setChip('slalom', null)
      } else if (this.slalom && (p.x < 28 || !onCourse)) {
        this.slalom = null
        world.ui.setChip('slalom', null)
      }
    }
  }

  updateAir(dt, p, car) {
    const { world } = this
    const airborne = !car.grounded && p.y > 0.9
    if (airborne && !this.air && p.x > RAMP.x - 2) {
      this.air = { t: 0, fromX: p.x, peak: p.y }
    } else if (this.air) {
      this.air.t += dt
      this.air.peak = Math.max(this.air.peak, p.y)
      if (!airborne) {
        const distance = p.x - this.air.fromX
        const time = this.air.t
        this.air = null
        if (time > 0.35 && distance > 3) {
          world.ui.toast(`AIR ${time.toFixed(1)} s · ${distance.toFixed(0)} m`)
          if (distance > 15) { world.sounds.arpeggio(); world.ui.toast('BIG AIR') }
        }
      }
    }

    // Flying through the hoop
    const throughHoop = Math.abs(p.x - HOOP.x) < 1.2 && Math.abs(p.z - HOOP.z) < 2 && p.y > 1.4 && p.y < 4.6
    if (throughHoop && this.hoopArmed && !car.grounded) {
      this.hoopArmed = false
      world.ui.toast('NICE JUMP')
      world.sounds.arpeggio()
      world.camera.shake = 0.4
    } else if (!this.hoopArmed && Math.abs(p.x - HOOP.x) > 6) {
      this.hoopArmed = true
    }
  }
}
