import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Section } from './Section.js'
import { CANNON } from '../../core/Physics.js'
import { flat, palette } from '../Materials.js'
import { board } from '../Board.js'
import { floorLabel } from '../Text.js'
import { InstancedProps } from '../props/InstancedProps.js'
import { RedButton } from '../props/RedButton.js'
import { bestOf } from '../Storage.js'
import { clearOfRoutes } from '../Roads.js'

const LANE = { x: 62, apexZ: 33, ballZ: 45 }
const RAMP = { x: 70, z: 54, run: 6, rise: 1.7, width: 4.5 }
const HOOP = { x: 84, z: 54 }
const SIGN = { x: 36, z: 24, width: 6.4 }
/** Reset buttons, by the props they reset. `RedButton` defaults to a 1.3 m trigger radius. */
const BUTTONS = { pins: { x: 58, z: 48 }, bricks: { x: 36, z: 26 }, cones: { x: 30, z: 58 } }
const BUTTON_R = 1.3

const TYRE_R = 0.85
/**
 * How far a tyre stack must sit outside a carriageway. Half the rover's 1.96 m wheel track plus
 * the tyre's own radius, so a rover using the very edge of the road still clears the stack.
 */
const TYRE_ROAD_CLEAR = TYRE_R + 0.98

/**
 * Footprints the ring must not be laid on, taken from the same constants that place the props —
 * never measured by hand, so moving a prop moves its gap with it.
 */
const TYRE_OBSTACLES = [
  { cx: RAMP.x, cz: RAMP.z, w: RAMP.run, d: RAMP.width },
  { cx: HOOP.x, cz: HOOP.z, w: 4, d: 4 },
  { cx: SIGN.x, cz: SIGN.z, w: SIGN.width + 0.4, d: 1 },
  ...Object.values(BUTTONS).map((b) => ({ cx: b.x, cz: b.z, w: BUTTON_R * 2, d: BUTTON_R * 2 })),
]

/**
 * May a tyre stack stand at (x, z)?
 *
 * Not if it would block a through route, and not if it would sit on a prop. Both tests are
 * derived — routes from `ROAD_RECTS`, props from the constants above — because this ring has
 * twice been laid over something it should not have been: three stacks inside the jump ramp, one
 * of them 0.54 m proud of the deck, which made the ramp unclimbable; and seven across the south
 * avenue, which sealed the only road into the range. Hand-measured exclusion rectangles fixed
 * both and would have gone stale the next time a road or a prop moved.
 *
 * Aprons are deliberately not consulted: the ring marks the edge of the playground apron, so it
 * necessarily stands on it.
 */
function tyreBlocked(x, z) {
  if (!clearOfRoutes(x, z, TYRE_ROAD_CLEAR)) return true
  return TYRE_OBSTACLES.some((o) => Math.abs(x - o.cx) < o.w / 2 + TYRE_R && Math.abs(z - o.cz) < o.d / 2 + TYRE_R)
}

const PIN_HEIGHT = 1

/** Pin geometry centred on its collider: origin in the middle, base at -PIN_HEIGHT / 2. */
function pinGeometry() {
  const half = PIN_HEIGHT / 2
  const headRadius = 0.13
  const bodyHeight = PIN_HEIGHT - headRadius * 2
  const body = new THREE.CylinderGeometry(0.15, 0.25, bodyHeight, 8)
  body.translate(0, -half + bodyHeight / 2, 0)
  const head = new THREE.SphereGeometry(headRadius, 8, 6)
  head.translate(0, half - headRadius, 0)
  return mergeGeometries([body, head])
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
      x: SIGN.x, z: SIGN.z, width: SIGN.width, height: 2.9, bottom: 1.4,
      accent: palette.lamp,
      kicker: 'Playground',
      title: 'TEST RANGE',
      subtitle: 'No CV here',
      body: ['Bowling, a brick wall, a cone slalom, a ramp with a hoop and a see-saw. Built for its own sake.'],
      titleSize: 0.5, bodySize: 0.21,
    })
  }

  buildBowling() {
    const { world } = this
    const lane = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 16), flat(palette.concrete))
    lane.position.set(LANE.x, 0.05, 38)
    world.addStatic(lane)
    for (const sx of [-2.4, 2.4]) {
      const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 16), flat(palette.habitat))
      gutter.position.set(LANE.x + sx, 0.07, 38)
      world.addStatic(gutter)
    }
    const backstop = world.physics.box({ size: [4.4, 1.4, 0.4], mass: 0, position: [LANE.x, 0.7, 29], sleepy: false })
    backstop.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(backstop)
    const backMesh = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, 0.4), flat(palette.habitat))
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
        bodies.push(world.physics.cylinder({ radiusTop: 0.24, radiusBottom: 0.24, height: PIN_HEIGHT, segments: 8, mass: 1.5, position: [px, PIN_HEIGHT / 2, pz] }))
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

    this.pinButton = new RedButton(world, { ...BUTTONS.pins, bodies: [...bodies, ballBody], onReset: () => { this.pinsDown = 0 } })
  }

  buildBricks() {
    const { world } = this
    const rows = world.experience.quality === 'low' ? 3 : 5
    const cols = 6
    const bodies = []
    for (let r = 0; r < rows; r++) {
      // A third-brick bond: at a half-brick offset the end brick of every even row overhung the
      // row below by half its width and tipped off at start-up.
      const offset = r % 2 ? 0.4 : 0
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
      material: flat(palette.clay),
      bodies,
      tag: 'brick',
      shadowRadius: { rx: 0.7, rz: 0.4 },
    })
    // Cream mortar: a thin bed under each brick and a joint up its left end, riding on the brick's
    // own transform, so the courses and the running bond read from above instead of one clay block.
    const mortarGeo = mergeGeometries([
      new THREE.BoxGeometry(1.26, 0.07, 0.66).translate(0, -0.215, 0),
      new THREE.BoxGeometry(0.07, 0.5, 0.66).translate(-0.595, 0, 0),
    ])
    this.mortar = new THREE.InstancedMesh(mortarGeo, flat(palette.cream), bodies.length)
    this.mortar.name = 'instanced-props' // part of the brick crowd: its bodies are the bricks' proxies
    this.mortar.frustumCulled = false
    const m = new THREE.Matrix4()
    bodies.forEach((b, i) => { m.makeTranslation(b.position.x, b.position.y, b.position.z); this.mortar.setMatrixAt(i, m) })
    this.mortar.instanceMatrix.needsUpdate = true
    world.addStatic(this.mortar, { reveal: false })
    bodies.forEach((b) => this.track(b))
    this.brickCount = bodies.length
    this.brickHomes = bodies.map((b) => ({ x: b.position.x, z: b.position.z }))
    this.brickButton = new RedButton(world, { ...BUTTONS.bricks, bodies, onReset: () => { this.bricksDown = 0 } })
  }

  buildSlalom() {
    const { world } = this
    // Cone body plus a narrow base: from the high camera a wide base reads as a flat square.
    const coneGeo = mergeGeometries([
      new THREE.ConeGeometry(0.3, 1.05, 8).translate(0, 0.08, 0),
      new THREE.BoxGeometry(0.62, 0.1, 0.62).translate(0, -0.4, 0),
    ])
    const bandGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.16, 8).translate(0, -0.02, 0)
    const bodies = []
    for (let i = 0; i < 12; i++) {
      // Starts at 33 so the second cone clears the tyre stack at (34.3, 54.1) by 1.9 m.
      const x = 33 + i * 3
      const z = 54 + (i % 2 ? 0.9 : -0.9)
      bodies.push(world.physics.box({ size: [0.7, 0.9, 0.7], mass: 0.5, position: [x, 0.45, z] }))
    }
    this.cones = new InstancedProps(world, {
      geometry: coneGeo,
      material: flat(palette.terracotta),
      bodies,
      tag: 'cone',
      shadowRadius: { rx: 0.4, rz: 0.4 },
    })
    // The reflective band, drawn as a second instanced pass over the same transforms.
    this.coneBands = new THREE.InstancedMesh(bandGeo, flat(palette.cream), bodies.length)
    this.coneBands.frustumCulled = false
    world.addStatic(this.coneBands, { reveal: false })
    bodies.forEach((b) => this.track(b))
    this.coneHomes = bodies.map((b) => ({ x: b.position.x, z: b.position.z }))
    this.coneButton = new RedButton(world, { ...BUTTONS.cones, bodies, onReset: () => { this.slalom = null } })

    const start = floorLabel('SLALOM ▶', { width: 5, height: 1.2, color: palette.stencil, fontSize: 0.44, weight: 800 })
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
      const mark = floorLabel(text, { width: 2.6, height: 1, color: palette.stencil, fontSize: 0.44, weight: 900 })
      mark.position.set(RAMP.x + RAMP.run / 2 + d, 0.03, RAMP.z)
      world.addStatic(mark, { reveal: false })
    })
    const big = floorLabel('BIG AIR', { width: 5, height: 1.2, color: palette.stencil, fontSize: 0.5, weight: 900 })
    big.position.set(RAMP.x + 23, 0.03, RAMP.z)
    world.addStatic(big, { reveal: false })

    // Hoop to fly through, on two ink feet that are solid.
    const hoop = new THREE.Group()
    hoop.position.set(HOOP.x, 0, HOOP.z)
    const torus = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 8, 20), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.5 }))
    torus.position.y = 3
    torus.rotation.y = Math.PI / 2
    hoop.add(torus)
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.2, 0.32), flat(palette.ink))
      foot.position.set(0, 0.6, sz * 1.6)
      hoop.add(foot)
      const footBody = world.physics.box({ size: [0.32, 1.2, 0.32], mass: 0, position: [HOOP.x, 0.6, HOOP.z + sz * 1.6], sleepy: false })
      footBody.userData = { kind: 'wall', tag: 'wall' }
      world.physics.add(footBody)
    }
    world.addStatic(hoop)
  }

  buildSeesaw() {
    const { world } = this
    const fulcrum = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 10), flat(palette.cobalt))
    fulcrum.rotation.x = Math.PI / 2
    fulcrum.position.set(40, 0.5, 44)
    world.addStatic(fulcrum)
    const fulcrumBody = world.physics.box({ size: [1, 1, 1.6], mass: 0, position: [40, 0.5, 44], sleepy: false })
    fulcrumBody.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(fulcrumBody)

    const plank = new THREE.Mesh(new THREE.BoxGeometry(7, 0.22, 1.6), flat(palette.steel))
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

  /**
   * A ring of stacked tyres marking the edge of the range: one, two or three tyres per slot,
   * one instanced draw call, and one static cylinder per stack so the ring is solid.
   */
  buildTyres() {
    const { world } = this
    const slots = world.experience.quality === 'low' ? 24 : 40
    const geo = new THREE.TorusGeometry(0.6, 0.25, 6, 10)
    geo.rotateX(Math.PI / 2)

    const kept = []
    for (let i = 0; i < slots; i++) {
      const a = (i / slots) * Math.PI * 2
      const x = 52 + Math.cos(a) * 25
      const z = 40 + Math.sin(a) * 20
      if (tyreBlocked(x, z)) continue
      kept.push({ x, z, stack: i % 3 })
    }
    // Counted from the slots that survive: an InstancedMesh sized for all of them would leave the
    // dropped slots' matrices zero-filled, which renders as degenerate geometry rather than nothing.
    const count = kept.reduce((n, k) => n + 1 + k.stack, 0)
    const mesh = new THREE.InstancedMesh(geo, flat(palette.ink), count)
    mesh.name = 'tyres'
    mesh.frustumCulled = false
    const m = new THREE.Matrix4()
    let n = 0
    for (const { x, z, stack } of kept) {
      for (let k = 0; k <= stack; k++) {
        m.makeTranslation(x, 0.25 + k * 0.4, z)
        mesh.setMatrixAt(n++, m)
      }
      const height = 0.5 + 0.4 * stack
      const body = world.physics.cylinder({ radiusTop: 0.85, radiusBottom: 0.85, height, segments: 8, mass: 0, position: [x, height / 2, z], sleepy: false })
      body.userData = { kind: 'wall', tag: 'wall' }
      world.physics.add(body)
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

    this.updateConeBands()
    this.updateSlalom(dt, p, car)
    this.updateAir(dt, p, car)
  }

  /** Keep the cone bands riding on the cones, and the mortar on the bricks. */
  updateConeBands() {
    const m = new THREE.Matrix4()
    for (let i = 0; i < this.cones.proxies.length; i++) {
      const proxy = this.cones.proxies[i]
      m.compose(proxy.position, proxy.quaternion, proxy.scale)
      this.coneBands.setMatrixAt(i, m)
    }
    this.coneBands.instanceMatrix.needsUpdate = true
    for (let i = 0; i < this.bricks.proxies.length; i++) {
      const proxy = this.bricks.proxies[i]
      m.compose(proxy.position, proxy.quaternion, proxy.scale)
      this.mortar.setMatrixAt(i, m)
    }
    this.mortar.instanceMatrix.needsUpdate = true
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
      world.ui.setChip('slalom', `SLALOM ${this.slalom.t.toFixed(1)} s${this.slalom.clean ? '' : ' · touched'}`)
      if (p.x > 65 && onCourse) {
        const time = this.slalom.t
        const clean = this.slalom.clean
        this.slalom = null
        if (clean) {
          const best = bestOf('portfolio-slalom', time)
          world.ui.toast(`Clean slalom in ${time.toFixed(1)} s${best ? ' — new best!' : ''}`)
          world.sounds.arpeggio()
        } else {
          world.ui.toast(`Slalom ${time.toFixed(1)} s — cones down.`)
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
