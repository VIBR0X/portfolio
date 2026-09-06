import * as THREE from 'three'
import { mergeGeometries as mergeBuffers } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Section } from './Section.js'
import { resume } from '../../content/resume.js'
import { CANNON } from '../../core/Physics.js'
import { flat, lampMaterial, palette } from '../Materials.js'
import { board } from '../Board.js'
import { labelMesh, floorLabel } from '../Text.js'
import { Counter } from '../props/Counter.js'
import { figureGeometry, FIGURE_HEIGHT } from '../props/Hangar.js'
import { relayBeacon } from '../props/Beacon.js'
import { rocketStep } from './rocketLaunch.js'

/**
 * The four test stands, west to east, with the plain-language stencil painted in front of each.
 * `sub` is the board's subtitle: the 12 m ground stencil can carry a long line, but a subtitle over
 * ~28 characters wraps onto a second line of the 7 m panel and pushes the tag line onto the corner
 * marks (measured on 02 and 04 in Chrome), so those two get a shorter one and all four lay out alike.
 */
export const STANDS = [
  { id: 'screening', x: 28, stencil: 'MED BAY · LLM READS SLIPS' },
  { id: 'instiapp', x: 46, stencil: 'CAMPUS GATE · 5,000 STUDENTS A DAY', sub: 'CAMPUS GATE · 5,000 A DAY' },
  { id: 'trading', x: 64, stencil: 'TRADING FLOOR · DQN AGENT' },
  { id: 'drone', x: 82, stencil: 'DRONE RANGE · ON-BOARD AUTONOMY', sub: 'DRONE RANGE · AUTONOMY' },
]
/**
 * The stand boards' panel and type sizes, shared with the layout test. `titleSize` 0.4 keeps every
 * title on one line of the 7 m panel (at 0.5 two of them wrapped); `bodySize` 0.34 sets the tag line
 * and, ×1.05, the subtitle — which is why a subtitle over ~28 characters needs a shorter `sub`.
 */
export const BOARD = { width: 7, titleSize: 0.4, bodySize: 0.34 }
const SLAB_Z = -42
const SLAB_TOP = 0.3
const ROCKET_X = 96
const ROCKET_Z = -30
const PEDESTAL_TOP = 0.6
const GANTRY_X = 100.6
const TAU = Math.PI * 2

const near = (car, x, z, r) => Math.hypot(car.x - x, car.z - z) < r
const clamp01 = (v) => Math.min(1, Math.max(0, v))

const easeOut = (k) => 1 - (1 - k) * (1 - k)
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k))

/**
 * Sideways drift of the descending rocket, in metres from the pad centre (`ROCKET_X`).
 *
 * It swings WEST (negative), away from the service gantry: the +x fin reaches out to x + 1.75, and
 * an eastward swing put it 0.55 m inside the 7 m and 3.5 m walkways (which start at x 98.4) for 74
 * measured frames of every flight. It also fades to zero over the last 2.5 m of the fall, so the
 * rocket arrives centred on the pedestal instead of being snapped 0.43 m sideways onto it at y 0.
 */
export const descentDrift = (t, y) => -1.2 * Math.sin(0.8 * t) * clamp01(y / 2.5)

function seeded(seed) {
  let s = seed
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** A flat rounded-rectangle ring lying in XZ, facing up (the slab border). */
function ringGeometry(w, d, thickness, r) {
  const outer = roundedRectShape(w, d, r)
  outer.holes.push(roundedRectShape(w - thickness * 2, d - thickness * 2, Math.max(0.05, r - thickness)))
  const geo = new THREE.ShapeGeometry(outer, 6)
  geo.rotateX(-Math.PI / 2)
  return geo
}

function at(geo, x, y, z) {
  geo.translate(x, y, z)
  return geo
}

/** Merge same-material parts into one draw call; RoundedBoxGeometry is non-indexed, so everything is. */
function mergeGeometries(geometries) {
  return mergeBuffers(geometries.map((g) => (g.index ? g.toNonIndexed() : g)))
}

function wallBody(world, body) {
  body.userData = { kind: 'wall', tag: 'wall' }
  world.physics.add(body)
  return body
}

/**
 * Four numbered test stands in a row on the north side of the avenue, one working model each,
 * boards behind, stencils in front, OPEN pads on the avenue; and the range's sounding rocket on a
 * static mount at the east end, with a LAUNCH pad that really does fly it.
 */
export class ProjectsSection extends Section {
  constructor(world, def) {
    super(world, def)
    this.rng = seeded(11)
    this._m = new THREE.Matrix4()
    this._p = new THREE.Vector3()
    this._q = new THREE.Quaternion()
    this._s = new THREE.Vector3(1, 1, 1)
    this._e = new THREE.Euler()
    this._c = new THREE.Color()
    this._up = new THREE.Vector3(0, 1, 0)
    this._smokeV = new THREE.Vector3()
    this.buildStands()
    this.buildScreening()
    this.buildGate()
    this.buildTrading()
    this.buildDrone()
    this.buildRocket()
    this.buildLaunchPad()
    this.rocket = { state: 'idle', t: 0, y: 0, cooldown: 0 }
    this._lastCountdownSec = null
    this._launchedFx = false
    this._smokeT = 0
    this._descendT = 0
    this._rocketPrev = { x: ROCKET_X, y: 0 }
    this._clampOpen = 0
    this._umbilical = 0
    this._chute = 0
    this._chuteFall = 0
  }

  /* ------------------------------------------------------------------ */
  /* Stands: slabs, borders, numerals, stencils, boards, pads             */
  /* ------------------------------------------------------------------ */

  buildStands() {
    const { world } = this
    const slabs = []
    const borders = []
    STANDS.forEach((stand, i) => {
      const project = resume.projects.find((p) => p.id === stand.id)
      slabs.push(at(new RoundedBoxGeometry(9, 0.3, 9, 2, 0.08), stand.x, 0.15, SLAB_Z))
      borders.push(at(ringGeometry(8.4, 8.4, 0.18, 0.4), stand.x, 0.315, SLAB_Z))
      wallBody(world, world.physics.box({ size: [9, 0.3, 9], mass: 0, position: [stand.x, 0.15, SLAB_Z], sleepy: false }))

      const numeral = floorLabel(String(i + 1).padStart(2, '0'), { width: 2.4, height: 1.8, color: palette.cream, fontSize: 1.3, weight: 900 })
      numeral.position.set(stand.x - 2.9, 0.32, -38.4)
      world.addStatic(numeral, { reveal: false, cast: false })

      const stencil = floorLabel(stand.stencil, { width: 12, height: 1.4, color: palette.stencil, fontSize: 0.85, weight: 800 })
      stencil.position.set(stand.x, 0.03, -36.8)
      world.addStatic(stencil, { reveal: false, cast: false })

      board(world, {
        x: stand.x, z: -47.2, height: 2.6, bottom: 2.6, posts: true, physics: true,
        accent: palette.terracotta, entry: stand.id,
        title: project.title.toUpperCase(),
        subtitle: stand.sub || stand.stencil,
        body: [project.tags.join(' · ')],
        ...BOARD,
      })

      const area = world.addArea({
        x: stand.x, z: -33, width: 5, depth: 3, label: project.title.toUpperCase(),
        color: palette.terracotta,
        onInteract: () => world.ui.togglePanel(stand.id),
      })
      area.actionLabel = 'OPEN'
    })
    const slabMesh = new THREE.Mesh(mergeGeometries(slabs), flat(palette.basalt))
    slabMesh.name = 'stands'
    world.addStatic(slabMesh, { reveal: false })
    const borderMesh = new THREE.Mesh(mergeGeometries(borders), flat(palette.cream))
    borderMesh.name = 'stand-borders'
    world.addStatic(borderMesh, { reveal: false, cast: false })
  }

  /* ------------------------------------------------------------------ */
  /* Stand 01 — field clinic + slip reader                               */
  /* ------------------------------------------------------------------ */

  buildScreening() {
    const { world } = this
    const X = STANDS[0].x
    const g = new THREE.Group()
    g.position.set(X, SLAB_TOP, SLAB_Z)

    const module = new THREE.Mesh(new RoundedBoxGeometry(4.2, 2.6, 3.4, 2, 0.18), flat(palette.habitat))
    module.position.set(0, 1.3, -1.0)
    g.add(module)

    // Cobalt: roof lip, airlock door, scanner crossbar.
    g.add(new THREE.Mesh(mergeGeometries([
      at(new THREE.BoxGeometry(4.4, 0.16, 3.6), 0, 2.68, -1.0),
      at(new RoundedBoxGeometry(0.9, 1.7, 0.06, 2, 0.04), 1.1, 1.05, 0.73),
      at(new THREE.BoxGeometry(0.08, 0.1, 1.2), 0.9, 1.85, 1.9),
    ]), flat(palette.cobalt)))

    // Ink: dish stem, scanner posts, SLM unit.
    g.add(new THREE.Mesh(mergeGeometries([
      at(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), 1.4, 2.9, -1.8),
      at(new THREE.BoxGeometry(0.08, 1.3, 0.08), 0.9, 1.2, 1.35),
      at(new THREE.BoxGeometry(0.08, 1.3, 0.08), 0.9, 1.2, 2.45),
      at(new RoundedBoxGeometry(0.9, 0.9, 0.9, 2, 0.15), 2.45, 1.0, 1.9),
    ]), flat(palette.ink)))

    // Cream: roof dish (an inverted shallow cap, both sides lit) and the door handle.
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 4, 0, TAU, 0, 0.5), flat(palette.cream, { side: THREE.DoubleSide }))
    dish.rotation.x = Math.PI
    dish.position.set(1.4, 2.95 + 0.45, -1.8)
    g.add(dish)
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.07), flat(palette.cream))
    handle.position.set(1.2, 1.05, 0.77)
    g.add(handle)

    const cross = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(1.2, 0.32, 0.06), new THREE.BoxGeometry(0.32, 1.2, 0.06),
    ]), flat(palette.terracotta))
    cross.position.set(-0.9, 1.6, 0.73)
    g.add(cross)

    const bench = new THREE.Mesh(new RoundedBoxGeometry(6.0, 0.55, 1.0, 2, 0.08), flat(palette.concrete))
    bench.position.set(0, 0.275, 1.9)
    g.add(bench)

    const slm = labelMesh('SLM', { width: 0.7, height: 0.4, color: palette.cream, fontSize: 0.3, weight: 900 })
    slm.position.set(2.45, 1.0, 2.36)
    g.add(slm)

    this.gateBead = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lampMaterial().clone())
    this.gateBead.position.set(0.9, 1.75, 1.9)
    this.slmBead = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lampMaterial().clone())
    this.slmBead.position.set(2.45, 1.53, 1.9)
    g.add(this.gateBead, this.slmBead)
    world.addStatic(g)

    // Slips ride the bench as a 6 m belt: 8 slips 0.75 m apart, visible between x −2.7 and +2.0,
    // cream until the scanner at x 0.9 reads them cobalt.
    this.slips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.7, 0.03), flat('#FFFFFF'), 8)
    this.slips.frustumCulled = false
    this.slips.position.set(X, SLAB_TOP, SLAB_Z)
    this._slipX = new Array(8).fill(-3)
    this.belt = 0
    this.sprint = 0
    this.gatePulse = 0
    this.poseSlips()
    world.addStatic(this.slips, { reveal: false })

    wallBody(world, world.physics.box({ size: [4.2, 2.6, 3.4], mass: 0, position: [X, 1.6, -43], sleepy: false }))
    wallBody(world, world.physics.box({ size: [6.0, 0.55, 1.0], mass: 0, position: [X, 0.575, -40.1], sleepy: false }))
  }

  poseSlips() {
    const cream = new THREE.Color(palette.cream)
    const cobalt = new THREE.Color(palette.cobalt)
    let crossed = false
    for (let i = 0; i < 8; i++) {
      const u = (this.belt + i * 0.75) % 6
      const x = -2.7 + u
      const prevX = this._slipX[i]
      if (prevX < 0.9 && x >= 0.9 && x - prevX < 1) crossed = true
      this._slipX[i] = x
      const s = x > 2.0 ? 0 : Math.min(1, (x + 2.7) / 0.1, (2.0 - x) / 0.1)
      this._p.set(x, 0.9, 1.9)
      this._e.set(-0.2, 0, 0)
      this._q.setFromEuler(this._e)
      this._s.setScalar(Math.max(0.0001, s))
      this._m.compose(this._p, this._q, this._s)
      this.slips.setMatrixAt(i, this._m)
      this.slips.setColorAt(i, this._c.lerpColors(cream, cobalt, clamp01((x - 0.9) / 0.125)))
    }
    this.slips.instanceMatrix.needsUpdate = true
    this.slips.instanceColor.needsUpdate = true
    return crossed
  }

  /* ------------------------------------------------------------------ */
  /* Stand 02 — campus gate + turnstiles + student stream                */
  /* ------------------------------------------------------------------ */

  buildGate() {
    const { world } = this
    const X = STANDS[1].x
    const g = new THREE.Group()
    g.position.set(X, SLAB_TOP, SLAB_Z)
    const lanes = [-1.2, 0, 1.2]

    const cobalt = []
    for (const sx of [-1, 1]) cobalt.push(at(new RoundedBoxGeometry(0.7, 3.4, 0.7, 2, 0.1), sx * 2.6, 1.7, 0))
    for (const lx of lanes) cobalt.push(at(new THREE.BoxGeometry(0.22, 0.32, 0.12), lx, 0.95, 0.1))
    g.add(new THREE.Mesh(mergeGeometries(cobalt), flat(palette.cobalt)))

    const lintel = new THREE.Mesh(new RoundedBoxGeometry(6.0, 0.55, 0.8, 2, 0.08), flat(palette.cream))
    lintel.position.set(0, 3.45, 0)
    g.add(lintel)
    const sign = labelMesh('CAMPUS GATE · TAP YOUR ID', { width: 4.8, height: 0.42, color: palette.ink, fontSize: 0.3, weight: 800 })
    sign.position.set(0, 3.45, 0.41)
    g.add(sign)

    // 4.4 × 1.1 at 0.5 m type, with the short text: '5,000+ STUDENTS TODAY' at 3.2 × 0.8 was shrunk
    // to fit and read as a 6 px smudge from the camera 26 m away, while the 0.3 m lintel sign below
    // it was legible. Bottom edge 3.85 (local) clears the lintel top at 3.725.
    this.counter = new Counter({ width: 4.4, height: 1.1, background: palette.cream, color: palette.ink, accent: palette.terracotta, fontSize: 0.5 })
    this.counter.mesh.position.set(0, 4.4, 0)
    this.counter.set('0 TODAY')
    g.add(this.counter.mesh)
    this.students = 0

    const ink = []
    for (const lx of lanes) ink.push(at(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 8), lx, 0.5, 0))
    for (const rx of [-1.8, -0.6, 0.6, 1.8]) ink.push(at(new THREE.BoxGeometry(0.05, 0.9, 1.6), rx, 0.45, 0))
    g.add(new THREE.Mesh(mergeGeometries(ink), flat(palette.ink)))

    this.readerBeads = lanes.map((lx) => {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lampMaterial().clone())
      bead.position.set(lx, 1.15, 0.1)
      g.add(bead)
      return bead
    })

    // Tripod arms: three spokes at 120°, one instance per lane, each spun about Y as students pass.
    const spokes = []
    for (let k = 0; k < 3; k++) {
      const spoke = at(new THREE.BoxGeometry(0.06, 0.06, 0.6), 0, 0, 0.3)
      spoke.rotateY((k / 3) * TAU)
      spokes.push(spoke)
    }
    this.tripods = new THREE.InstancedMesh(mergeGeometries(spokes), flat(palette.ink), 3)
    this.tripodRot = [0, 0, 0]
    this.tripodTarget = [0, 0, 0]
    this.beadFlash = [0, 0, 0]
    for (let l = 0; l < 3; l++) {
      this._m.compose(this._p.set(lanes[l], 0.95, 0), this._q.identity(), this._s.set(1, 1, 1))
      this.tripods.setMatrixAt(l, this._m)
    }
    g.add(this.tripods)
    world.addStatic(g)

    // Twelve students, four per lane 2.1 m apart, walking −z through the gate.
    this.walkers = new THREE.InstancedMesh(figureGeometry(), flat('#FFFFFF'), 12)
    this.walkers.name = 'students'
    this.walkers.frustumCulled = false
    this.walkers.position.set(X, SLAB_TOP, SLAB_Z)
    const colours = [palette.cobalt, palette.steel, palette.cream, '#4E6C93'].map((c) => new THREE.Color(c))
    for (let i = 0; i < 12; i++) this.walkers.setColorAt(i, colours[i % 4])
    this.walkers.instanceColor.needsUpdate = true
    this.lanes = lanes
    this.laneOffset = [0, 0.7, 1.4]
    this.walk = 0
    this._walkZ = new Array(12).fill(5)
    this._blipT = 0
    this.poseStudents(0)
    world.addStatic(this.walkers, { reveal: false })

    for (const bx of [43.4, 48.6]) wallBody(world, world.physics.box({ size: [0.7, 3.4, 0.7], mass: 0, position: [bx, 2.0, SLAB_Z], sleepy: false }))
    wallBody(world, world.physics.box({ size: [4.0, 1.0, 1.7], mass: 0, position: [X, 0.8, SLAB_Z], sleepy: false }))
  }

  /** Poses every student; returns the lanes whose turnstile a student just crossed. */
  poseStudents(elapsed) {
    const crossed = []
    const half = (FIGURE_HEIGHT / 2) * 1.4
    for (let i = 0; i < 12; i++) {
      const lane = i % 3
      const k = Math.floor(i / 3)
      const z = 4.2 - ((this.walk + k * 2.1 + this.laneOffset[lane]) % 8.4)
      const prev = this._walkZ[i]
      if (prev > 0 && z <= 0 && prev - z < 1) crossed.push(lane)
      this._walkZ[i] = z
      const s = Math.min(1, (4.2 - z) / 0.27, (z + 4.2) / 0.27)
      this._p.set(this.lanes[lane], half + 0.03 * Math.sin(8 * elapsed + i), z)
      this._q.setFromAxisAngle(this._up, Math.PI)
      this._s.setScalar(Math.max(0.0001, s * 1.4))
      this._m.compose(this._p, this._q, this._s)
      this.walkers.setMatrixAt(i, this._m)
    }
    this.walkers.instanceMatrix.needsUpdate = true
    return crossed
  }

  /* ------------------------------------------------------------------ */
  /* Stand 03 — trading screen + robot trader                            */
  /* ------------------------------------------------------------------ */

  buildTrading() {
    const { world } = this
    const X = STANDS[2].x
    const g = new THREE.Group()
    g.position.set(X, SLAB_TOP, SLAB_Z)

    // Screen: frame pivoted at its bottom edge and tilted 0.17 rad back.
    const pivot = new THREE.Group()
    pivot.position.set(0, 0.7, -0.8)
    pivot.rotation.x = -0.17
    const frame = new THREE.Mesh(new RoundedBoxGeometry(6.4, 3.2, 0.3, 2, 0.1), flat(palette.ink))
    frame.position.y = 1.6
    pivot.add(frame)
    const display = new THREE.Mesh(mergeGeometries([
      at(new THREE.BoxGeometry(6.0, 2.8, 0.04), 0, 0, 0.16),
      at(new THREE.BoxGeometry(5.6, 0.03, 0.02), 0, -1.2, 0.19),
      ...[0, 1, 2, 3, 4, 5].map((k) => at(new THREE.BoxGeometry(0.02, 0.12, 0.02), -2.7 + k * 1.08, -1.2, 0.19)),
    ]), flat(palette.cream))
    frame.add(display)
    this.priceLine = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.07, 0.03), flat('#FFFFFF'), 40)
    this.priceLine.position.z = 0.2
    frame.add(this.priceLine)
    this.nowCursor = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.2, 0.02), lampMaterial().clone())
    this.nowCursor.position.set(2.85, 0, 0.19)
    frame.add(this.nowCursor)
    g.add(pivot)

    g.add(new THREE.Mesh(mergeGeometries([
      at(new RoundedBoxGeometry(0.5, 0.8, 0.5, 2, 0.06), -2.4, 0.4, -0.8),
      at(new RoundedBoxGeometry(0.5, 0.8, 0.5, 2, 0.06), 2.4, 0.4, -0.8),
      at(new THREE.CylinderGeometry(0.35, 0.4, 0.5, 8), 0, 0.25, 1.6),
    ]), flat(palette.concrete)))

    const robotBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 10), flat(palette.cobalt))
    robotBody.position.set(0, 0.95, 1.6)
    g.add(robotBody)
    const arm = new THREE.BoxGeometry(0.7, 0.08, 0.08)
    arm.rotateZ(0.9)
    arm.translate(0.55, 1.45, 1.6)
    g.add(new THREE.Mesh(mergeGeometries([at(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8), 0, 1.55, 1.6), arm]), flat(palette.ink)))

    this.robotHead = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.7, 0.8, 2, 0.12), flat(palette.ink))
    this.robotHead.position.set(0, 2.05, 1.6)
    const eyes = new THREE.Mesh(mergeGeometries([
      at(new THREE.SphereGeometry(0.09, 8, 6), -0.2, 0.05, 0.41),
      at(new THREE.SphereGeometry(0.09, 8, 6), 0.2, 0.05, 0.41),
    ]), lampMaterial().clone())
    this.robotHead.add(eyes)
    g.add(this.robotHead)

    this.paddle = new THREE.Group()
    this.paddle.position.set(0.75, 1.7, 1.6)
    this.paddle.add(new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.38, 0.04, 2, 0.03), flat(palette.cream)))
    const buy = labelMesh('BUY', { width: 0.5, height: 0.3, color: palette.cobalt, fontSize: 0.22, weight: 900 })
    buy.position.z = 0.025
    const sell = labelMesh('SELL', { width: 0.5, height: 0.3, color: palette.clay, fontSize: 0.22, weight: 900 })
    sell.position.z = -0.025
    sell.rotation.y = Math.PI
    this.paddle.add(buy, sell)
    g.add(this.paddle)
    world.addStatic(g)

    this.series = []
    let v = 1.45
    for (let i = 0; i < 41; i++) { v = this.nextPrice(v); this.series.push(v) }
    this.posePrices()
    this.tickT = 0
    this.paddleFrom = 0
    this.paddleTo = 0
    this.paddleT = 1
    this.nod = 0
    this._screenFocus = new THREE.Vector3(X, 2.5, -42.8)
    this._robotTarget = new THREE.Vector3()

    wallBody(world, world.physics.box({ size: [6.4, 3.8, 1.2], mass: 0, position: [X, 2.2, -42.8], sleepy: false }))
    wallBody(world, world.physics.cylinder({ radiusTop: 0.55, radiusBottom: 0.55, height: 2.4, segments: 10, mass: 0, position: [X, 1.5, -40.4], sleepy: false }))
  }

  nextPrice(v) {
    const u1 = Math.max(1e-6, this.rng())
    const u2 = this.rng()
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2)
    return Math.min(2.4, Math.max(0.5, v + 0.35 * (1.45 - v) + gauss * 0.25))
  }

  posePrices() {
    const dx = 5.4 / 40
    for (let i = 0; i < 40; i++) {
      const x0 = -2.7 + i * dx
      const y0 = this.series[i] - 1.4
      const y1 = this.series[i + 1] - 1.4
      const dy = y1 - y0
      this._p.set(x0 + dx / 2, (y0 + y1) / 2, 0)
      this._e.set(0, 0, Math.atan2(dy, dx))
      this._q.setFromEuler(this._e)
      this._s.set(Math.hypot(dx, dy), 1, 1)
      this._m.compose(this._p, this._q, this._s)
      this.priceLine.setMatrixAt(i, this._m)
      this.priceLine.setColorAt(i, this._c.set(dy >= 0 ? palette.cobalt : palette.terracotta))
    }
    this.priceLine.instanceMatrix.needsUpdate = true
    this.priceLine.instanceColor.needsUpdate = true
  }

  /** Flip the paddle to BUY (0) or SELL (π); `force` toggles regardless of the trend. */
  flipPaddle(to, car) {
    if (to === this.paddleTo) return
    this.paddleFrom = this.paddle.rotation.y
    this.paddleTo = to
    this.paddleT = 0
    this.nod = 0.25
    if (near(car, STANDS[2].x, SLAB_Z, 14)) this.world.sounds.blip(700)
  }

  /* ------------------------------------------------------------------ */
  /* Stand 04 — obstacle course + drone                                  */
  /* ------------------------------------------------------------------ */

  buildDrone() {
    const { world } = this
    const X = STANDS[3].x
    const pylons = new THREE.Mesh(mergeGeometries([
      at(new THREE.CylinderGeometry(0.32, 0.4, 3.0, 8), X - 2, 1.8, SLAB_Z),
      at(new THREE.CylinderGeometry(0.32, 0.4, 3.0, 8), X + 2, 1.8, SLAB_Z),
    ]), flat(palette.cobalt))
    world.addStatic(pylons, { reveal: false })
    const ringA = new THREE.TorusGeometry(2.0, 0.05, 4, 32)
    ringA.rotateX(Math.PI / 2)
    const ringB = ringA.clone()
    const paint = new THREE.Mesh(mergeGeometries([
      at(ringA, X - 2, 0.32, SLAB_Z),
      at(ringB, X + 2, 0.32, SLAB_Z),
      at(new THREE.BoxGeometry(0.5, 0.08, 0.5), X - 2, 1.9, SLAB_Z),
      at(new THREE.BoxGeometry(0.5, 0.08, 0.5), X + 2, 1.9, SLAB_Z),
    ]), flat(palette.cream))
    world.addStatic(paint, { reveal: false, cast: false })
    this.pylonCaps = [X - 2, X + 2].map((px) => {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lampMaterial().clone())
      cap.position.set(px, 3.4, SLAB_Z)
      world.addStatic(cap, { reveal: false, cast: false })
      return cap
    })
    this.capFlash = [0, 0]
    const home = floorLabel('H', { width: 2.2, height: 2.2, color: palette.cream, fontSize: 1.6, weight: 900 })
    home.position.set(X, 0.33, SLAB_Z)
    world.addStatic(home, { reveal: false, cast: false })

    const g = new THREE.Group()
    g.name = 'drone'
    g.position.set(X, 2.7, SLAB_Z)
    g.rotation.order = 'YXZ'
    const shell = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.16, 1.0, 2, 0.06), flat(palette.habitat))
    shell.position.y = 0.08
    g.add(shell)
    const ink = [at(new RoundedBoxGeometry(0.9, 0.14, 0.9, 2, 0.05), 0, -0.07, 0)]
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const armGeo = new THREE.BoxGeometry(1.5, 0.07, 0.09)
      armGeo.rotateY(a)
      ink.push(armGeo)
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) ink.push(at(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 8), sx * 0.62, 0.08, sz * 0.62))
      ink.push(at(new THREE.BoxGeometry(0.06, 0.06, 0.9), sx * 0.35, -0.24, 0))
      for (const sz of [-1, 1]) ink.push(at(new THREE.BoxGeometry(0.05, 0.14, 0.05), sx * 0.35, -0.17, sz * 0.3))
    }
    g.add(new THREE.Mesh(mergeGeometries(ink), flat(palette.ink)))
    this.rotors = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.44, 0.44, 0.02, 14), flat(palette.glass, { transparent: true, opacity: 0.5 }), 4)
    this.rotorSpin = 0
    this.poseRotors()
    g.add(this.rotors)
    this.gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lampMaterial().clone())
    this.gimbal.position.set(0, -0.2, 0.3)
    g.add(this.gimbal)
    // Camera frustum: apex at the gimbal, base toward the ground.
    const frustumGeo = new THREE.ConeGeometry(0.7, 1.4, 4, 1, true)
    frustumGeo.translate(0, -0.9, 0.3)
    const frustum = new THREE.Mesh(frustumGeo, flat(palette.glass, { transparent: true, opacity: 0.22, side: THREE.DoubleSide }))
    frustum.material.depthWrite = false
    frustum.renderOrder = 1
    g.add(frustum)
    this.drone = g
    world.addStatic(g)
    frustum.castShadow = false
    this.rotors.castShadow = false
    this.droneA = 0
    this.droneLobe = 0
    this.droneRoll = 0
    this._droneCentre = new THREE.Vector3()
    this._droneHeading = new THREE.Vector3()

    for (const px of [X - 2, X + 2]) wallBody(world, world.physics.cylinder({ radiusTop: 0.4, radiusBottom: 0.4, height: 3, segments: 8, mass: 0, position: [px, 1.8, SLAB_Z], sleepy: false }))
  }

  poseRotors() {
    let i = 0
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this._p.set(sx * 0.62, 0.17, sz * 0.62)
        this._q.setFromAxisAngle(this._up, this.rotorSpin * sx * sz)
        this._s.set(1, 1, 1)
        this._m.compose(this._p, this._q, this._s)
        this.rotors.setMatrixAt(i++, this._m)
      }
    }
    this.rotors.instanceMatrix.needsUpdate = true
  }

  /* ------------------------------------------------------------------ */
  /* Rocket: static mount, clamps, gantry, umbilical, the flying group   */
  /* ------------------------------------------------------------------ */

  buildRocket() {
    const { world } = this
    const mount = new THREE.Group()
    mount.position.set(ROCKET_X, 0, ROCKET_Z)
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.6, 12), flat(palette.concrete))
    pedestal.position.y = 0.3
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.08, 4, 24), flat(palette.terracotta))
    ring.rotation.x = Math.PI / 2
    ring.position.y = PEDESTAL_TOP
    const trench = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.25, 6, 16), flat(palette.ink))
    trench.rotation.x = Math.PI / 2
    trench.position.y = 0.55
    mount.add(pedestal, ring, trench)
    // Four clamp arms at the 45° points (between the fins), each hinged at the pedestal top and
    // opened outward about its tangential axis before lift-off.
    this.clamps = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4
      const clamp = new THREE.Group()
      clamp.position.set(Math.cos(a) * 1.35, PEDESTAL_TOP, Math.sin(a) * 1.35)
      clamp.rotation.y = -a
      const arm = new THREE.Mesh(new RoundedBoxGeometry(0.24, 1.1, 0.4, 2, 0.05), flat(palette.ink))
      arm.position.y = 0.55
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.42), flat(palette.cream))
      pad.position.y = 1.17
      clamp.add(arm, pad)
      mount.add(clamp)
      this.clamps.push(clamp)
    }
    world.addStatic(mount, { reveal: false })
    const padLabel = floorLabel('LAUNCH PAD 1', { width: 4, height: 0.6, color: palette.cream, fontSize: 0.4, weight: 800 })
    padLabel.position.set(ROCKET_X, 0.03, -26.6)
    world.addStatic(padLabel, { reveal: false, cast: false })
    wallBody(world, world.physics.cylinder({ radiusTop: 2.2, radiusBottom: 2.6, height: 0.6, segments: 12, mass: 0, position: [ROCKET_X, 0.3, ROCKET_Z], sleepy: false }))

    // Service gantry east of the pad: uprights, cross braces, three walkways reaching west to 98.4.
    const gantryParts = []
    for (const dz of [-0.35, 0.35]) gantryParts.push(at(new THREE.BoxGeometry(0.22, 12, 0.22), GANTRY_X, 6, ROCKET_Z + dz))
    for (let i = 0; i < 6; i++) {
      const brace = new THREE.BoxGeometry(0.12, 0.12, 0.9)
      brace.rotateX(Math.PI / 4)
      gantryParts.push(at(brace, GANTRY_X, 1.2 + i * 2, ROCKET_Z))
    }
    world.addStatic(new THREE.Mesh(mergeGeometries(gantryParts), flat(palette.concrete)), { reveal: false })
    const walkParts = [3.5, 7, 10.5].map((y) => at(new THREE.BoxGeometry(2.1, 0.12, 0.6), 99.45, y, ROCKET_Z))
    world.addStatic(new THREE.Mesh(mergeGeometries(walkParts), flat(palette.steel)), { reveal: false })
    this.umbilical = new THREE.Group()
    this.umbilical.position.set(GANTRY_X, 5.8, ROCKET_Z)
    const umbArm = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 0.2), flat(palette.cobalt))
    umbArm.position.x = -1.85
    this.umbilical.add(umbArm)
    world.addStatic(this.umbilical, { reveal: false })
    relayBeacon(world, { x: GANTRY_X, y: 12.3, z: ROCKET_Z, phase: 1.4 })
    wallBody(world, world.physics.box({ size: [0.7, 12, 1.0], mass: 0, position: [GANTRY_X, 6, ROCKET_Z], sleepy: false }))

    // The rocket itself: an 8 m sounding rocket sitting on the pedestal. Only this group flies.
    const g = new THREE.Group()
    g.position.set(ROCKET_X, PEDESTAL_TOP, ROCKET_Z)
    this.rocketBell = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 12, 1, true), flat(palette.ink, { side: THREE.DoubleSide, emissive: palette.lamp, emissiveIntensity: 0 }).clone())
    this.rocketBell.position.y = 0.35
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 5.4, 12), flat(palette.habitat))
    body.position.y = 3.4
    const bands = new THREE.Mesh(mergeGeometries([
      at(new THREE.CylinderGeometry(0.83, 0.83, 0.3, 12), 0, 2.2, 0),
      at(new THREE.CylinderGeometry(0.83, 0.83, 0.3, 12), 0, 4.8, 0),
    ]), flat(palette.cobalt))
    const accent = [at(new THREE.ConeGeometry(0.8, 1.8, 12), 0, 7.0, 0)]
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU
      const fin = new THREE.BoxGeometry(1.0, 1.5, 0.14)
      fin.translate(1.25, 1.45, 0)
      fin.rotateY(-a)
      accent.push(fin)
    }
    const nose = new THREE.Mesh(mergeGeometries(accent), flat(palette.terracotta))
    const gridParts = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4
      for (const cross of [new THREE.BoxGeometry(0.45, 0.45, 0.05), new THREE.BoxGeometry(0.05, 0.45, 0.45)]) {
        cross.translate(0.95, 5.5, 0)
        cross.rotateY(-a)
        gridParts.push(cross)
      }
    }
    const gridFins = new THREE.Mesh(mergeGeometries(gridParts), flat(palette.ink))
    const reg = labelMesh('VT-1', { width: 0.9, height: 0.35, color: palette.ink, fontSize: 0.28, weight: 900 })
    reg.position.set(0, 4.0, 0.81)
    this.rocketTip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lampMaterial().clone())
    this.rocketTip.position.y = 8.0
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 8), lampMaterial().clone())
    this.flame.material.emissiveIntensity = 2
    this.flame.position.y = -0.9
    this.flame.visible = false
    g.add(this.rocketBell, body, bands, nose, gridFins, reg, this.rocketTip, this.flame)

    // Parachute, grown from the nose: canopy with two terracotta gores and four shroud lines.
    const chute = new THREE.Group()
    chute.position.y = 7.6
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.2, 8, 1, true), flat(palette.cream, { side: THREE.DoubleSide }))
    canopy.position.y = 9.3 - 7.6
    const gores = new THREE.Mesh(mergeGeometries([
      new THREE.ConeGeometry(2.01, 2.2, 8, 1, true, 0, Math.PI / 4),
      new THREE.ConeGeometry(2.01, 2.2, 8, 1, true, Math.PI, Math.PI / 4),
    ]), flat(palette.terracotta, { side: THREE.DoubleSide }))
    gores.position.y = 9.3 - 7.6
    const lines = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 8
      const from = new THREE.Vector3(0, 0, 0)
      const to = new THREE.Vector3(Math.cos(a) * 2.0, 8.2 - 7.6, Math.sin(a) * 2.0)
      const dir = to.clone().sub(from)
      const line = new THREE.CylinderGeometry(0.02, 0.02, dir.length(), 4)
      line.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(this._up, dir.clone().normalize()))
      line.translate(to.x / 2, to.y / 2, to.z / 2)
      lines.push(line)
    }
    chute.add(canopy, gores, new THREE.Mesh(mergeGeometries(lines), flat(palette.ink)))
    chute.visible = false
    chute.scale.setScalar(0.2)
    this.rocketParachute = chute
    g.add(chute)
    this.rocketGroup = g
    world.addStatic(g, { reveal: false })

    // Kinematic body: rides with the rocket, so a car parked against the pad is pushed rather than
    // clipped, and the empty pad is never a phantom wall. Mass 0 + kind wall keeps it in
    // `staticSolids`, so the plane can still crash into it.
    this.rocketBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Cylinder(1, 1, 8, 10) })
    this.rocketBody.position.set(ROCKET_X, 4.6, ROCKET_Z)
    this.rocketBody.allowSleep = false
    this.rocketBody.updateAABB()
    wallBody(world, this.rocketBody)
  }

  /** A pad beside the rocket that starts the countdown. */
  buildLaunchPad() {
    const area = this.world.addArea({
      x: 90, z: ROCKET_Z, width: 4.5, depth: 3, label: 'LAUNCH',
      color: palette.terracotta,
      onInteract: () => this.armRocket(),
    })
    area.actionLabel = 'LAUNCH'
  }

  armRocket() {
    if (this.rocket.state !== 'idle' || this.rocket.cooldown > 0) return
    this.rocket = { ...this.rocket, state: 'countdown', t: 0 }
    this.disturbed = true
    this.world.ui.toast('3 · 2 · 1 …')
    this.world.sounds.blip(880)
  }

  /** R while the rocket is airborne brings it straight back onto the pedestal. */
  reset() {
    if (this.rocket.state !== 'idle') this.recoverRocket({ cooldown: 6 })
    super.reset()
  }

  onHorn() {
    const car = this.world.car.physics.position
    if (near(car, STANDS[0].x, SLAB_Z, 14)) this.sprint = 3
    if (near(car, STANDS[1].x, SLAB_Z, 14)) {
      for (let l = 0; l < 3; l++) this.tripodTarget[l] += TAU
      this.students = Math.min(5000, this.students + 100)
      this.world.sounds.ding()
    }
    if (near(car, STANDS[2].x, SLAB_Z, 14)) this.flipPaddle(this.paddleTo === 0 ? Math.PI : 0, car)
    if (near(car, STANDS[3].x, SLAB_Z, 12)) {
      this.droneRoll = 0.6
      this.world.sounds.blip(1400)
    }
    if (near(car, ROCKET_X, ROCKET_Z, 14)) this.armRocket()
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                               */
  /* ------------------------------------------------------------------ */

  update(dt, elapsed) {
    const car = this.world.car.physics.position
    this.updateScreening(dt, elapsed, car)
    this.updateGate(dt, elapsed, car)
    this.updateTrading(dt, elapsed, car)
    this.updateDrone(dt, elapsed, car)
    this.updateRocket(dt, elapsed, car)
  }

  updateScreening(dt, elapsed, car) {
    const { sounds } = this.world
    if (this.sprint > 0) this.sprint = Math.max(0, this.sprint - dt)
    this.belt += dt * 0.5 * (this.sprint > 0 ? 3 : 1)
    if (this.poseSlips()) {
      this.gatePulse = 0.3
      if (near(car, STANDS[0].x, SLAB_Z, 14)) sounds.blip(1200)
    }
    if (this.gatePulse > 0) {
      this.gatePulse = Math.max(0, this.gatePulse - dt)
      this.gateBead.material.emissiveIntensity = 0.4 + Math.sin(Math.PI * (1 - this.gatePulse / 0.3))
    } else {
      this.gateBead.material.emissiveIntensity = 0.4
    }
    this.slmBead.material.emissiveIntensity = 0.6 + 0.3 * Math.sin(elapsed * TAU * 1.5)
  }

  updateGate(dt, elapsed, car) {
    const { sounds } = this.world
    this.walk += dt * 0.9
    this._blipT = Math.max(0, this._blipT - dt)
    for (const lane of this.poseStudents(elapsed)) {
      this.tripodTarget[lane] += TAU / 3
      this.beadFlash[lane] = 0.2
      if (near(car, STANDS[1].x, SLAB_Z, 14) && this._blipT === 0) {
        sounds.blip(900)
        this._blipT = 0.25
      }
    }
    const k = 1 - Math.exp(-dt * 12)
    for (let l = 0; l < 3; l++) {
      this.tripodRot[l] += (this.tripodTarget[l] - this.tripodRot[l]) * k
      this._p.set(this.lanes[l], 0.95, 0)
      this._q.setFromAxisAngle(this._up, this.tripodRot[l])
      this._s.set(1, 1, 1)
      this._m.compose(this._p, this._q, this._s)
      this.tripods.setMatrixAt(l, this._m)
      this.beadFlash[l] = Math.max(0, this.beadFlash[l] - dt)
      this.readerBeads[l].material.emissiveIntensity = this.beadFlash[l] > 0 ? 1.4 : 0.5
    }
    this.tripods.instanceMatrix.needsUpdate = true

    if (this.students < 5000 && near(car, STANDS[1].x, SLAB_Z, 18)) this.students = Math.min(5000, this.students + 1000 * dt)
    if (this.students >= 5000) this.counter.set('5,000+ TODAY', { highlight: true })
    else this.counter.set(`${Math.floor(this.students).toLocaleString('en-US')} TODAY`)
  }

  updateTrading(dt, elapsed, car) {
    this.tickT += dt
    if (this.tickT >= 0.4) {
      this.tickT -= 0.4
      this.series.shift()
      this.series.push(this.nextPrice(this.series[this.series.length - 1]))
      this.posePrices()
      const [a, b, c] = this.series.slice(-3)
      if (c > b && b > a) this.flipPaddle(0, car)
      else if (c < b && b < a) this.flipPaddle(Math.PI, car)
    }
    if (this.paddleT < 1) {
      this.paddleT = Math.min(1, this.paddleT + dt / 0.3)
      this.paddle.rotation.y = this.paddleFrom + (this.paddleTo - this.paddleFrom) * easeInOut(this.paddleT)
    }
    this.nowCursor.material.emissiveIntensity = 0.8 + 0.6 * Math.max(0, Math.sin(elapsed * 4))

    if (near(car, STANDS[2].x, SLAB_Z, 16)) this._robotTarget.set(car.x, 2.2, car.z)
    else this._robotTarget.copy(this._screenFocus)
    this.robotHead.lookAt(this._robotTarget)
    if (this.nod > 0) {
      this.nod = Math.max(0, this.nod - dt)
      this.robotHead.rotateX(0.15 * Math.sin(Math.PI * (1 - this.nod / 0.25)))
    }
  }

  updateDrone(dt, elapsed, car) {
    const prevA = this.droneA
    this.droneA += dt * 0.7
    if (this.droneA >= TAU) { this.droneA -= TAU; this.droneLobe = 1 - this.droneLobe }
    const a = this.droneA
    const X = STANDS[3].x
    const lobeX = this.droneLobe === 0 ? X - 2 : X + 2
    const sign = this.droneLobe === 0 ? 1 : -1
    const px = lobeX + sign * 2 * Math.cos(a)
    const pz = SLAB_Z + 2 * Math.sin(a)
    const tx = -sign * Math.sin(a)
    const tz = Math.cos(a)
    const p = this.drone.position
    p.set(px, SLAB_TOP + 2.4 + 0.3 * Math.sin(2 * a), pz)
    const yaw = Math.atan2(tx, tz)
    // Right-hand vector of the heading; bank toward whichever side the lobe centre is on.
    const side = Math.sign((lobeX - px) * tz - (SLAB_Z - pz) * tx)
    let roll = -0.25 * side
    if (this.droneRoll > 0) {
      this.droneRoll = Math.max(0, this.droneRoll - dt)
      roll += (1 - this.droneRoll / 0.6) * TAU
    }
    this.drone.rotation.set(0, yaw, roll)
    // Passing the outer side of each pylon lights its cap: obstacle avoidance you can see.
    if (prevA < Math.PI && a >= Math.PI) this.capFlash[this.droneLobe] = 0.4
    for (let i = 0; i < 2; i++) {
      this.capFlash[i] = Math.max(0, this.capFlash[i] - dt)
      this.pylonCaps[i].material.emissiveIntensity = this.capFlash[i] > 0 ? 1.4 : 0.5
    }
    this.rotorSpin += dt * 40
    this.poseRotors()
  }

  /** Countdown, lift-off, coast and a parachute back onto the pedestal. */
  updateRocket(dt, elapsed, car) {
    const { world } = this
    const prev = this.rocket.state
    this.rocket = rocketStep(this.rocket, dt)
    const { state, t } = this.rocket
    const g = this.rocketGroup

    if (state === 'countdown') {
      const secLeft = Math.max(1, Math.ceil(3 - t))
      world.ui.setChip('rocket', `T-${secLeft}`)
      if (secLeft !== this._lastCountdownSec) {
        this._lastCountdownSec = secLeft
        world.sounds.blip(660 + (3 - secLeft) * 220)
      }
      this.rocketTip.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(elapsed * 12))
      this.rocketBell.material.emissiveIntensity = (t / 3) * 1.4
      if (t >= 2.4) { this._clampTarget = 1; this._umbTarget = 1 }
    }

    if (state === 'ascending') {
      if (!this._launchedFx) {
        this._launchedFx = true
        world.sounds.whoosh()
        world.ui.setChip('rocket', 'LIFT-OFF')
        this.flame.visible = true
        if (!world.reducedMotion && near(car, ROCKET_X, ROCKET_Z, 25)) world.camera.shake = 0.5
      }
      this.rocketBell.material.emissiveIntensity = 1.4
      this.flame.scale.y = 1 + 0.2 * Math.sin(elapsed * TAU * 30)
      // Smoke follows the rocket: a trail from the bell, plus the pad dust cloud for the first
      // 0.8 s. Particle `size` scales a 0.09 m blob, so 3.5 / 4.5 give 0.3–0.4 m puffs.
      this._smokeT += dt
      while (this._smokeT >= 0.06) {
        this._smokeT -= 0.06
        world.particles?.emit(this._p.set(g.position.x, g.position.y + 0.2, g.position.z), {
          count: 5, color: '#D9B08C', spread: 1.0, life: 1.4, size: 3.5,
          velocity: this._smokeV.set(0, -3, 0), gravity: 1.0,
        })
        if (t < 0.8) {
          world.particles?.emit(this._p.set(ROCKET_X, 0.9, ROCKET_Z), {
            count: 8, color: '#C98B5F', spread: 3.2, life: 1.8, size: 4.5,
            velocity: this._smokeV.set(0, 0.8, 0), gravity: 0.5,
          })
        }
      }
    }

    if (state === 'coasting' || state === 'descending') {
      if (this.flame.visible) {
        this.flame.visible = false
        this.rocketBell.material.emissiveIntensity = 0
        this.rocketParachute.visible = true
        this._chute = 0
      }
      this._chute = Math.min(1, this._chute + dt / 0.3)
      this.rocketParachute.scale.setScalar(0.2 + 0.8 * easeOut(this._chute))
      if (state === 'descending') this._descendT += dt
    }

    if (state !== 'idle') {
      const x = state === 'descending' ? ROCKET_X + descentDrift(this._descendT, this.rocket.y) : ROCKET_X
      g.position.set(x, PEDESTAL_TOP + this.rocket.y, ROCKET_Z)
      if (dt > 0) this.rocketBody.velocity.set((x - this._rocketPrev.x) / dt, (this.rocket.y - this._rocketPrev.y) / dt, 0)
      this.rocketBody.position.set(x, 4.6 + this.rocket.y, ROCKET_Z)
      this.rocketBody.updateAABB()
      this._rocketPrev.x = x
      this._rocketPrev.y = this.rocket.y
      // Lift and pull back the camera so the whole flight stays in frame, if the visitor is near enough to be watching.
      if (near(car, ROCKET_X, ROCKET_Z, 45)) {
        world.requestFocusAltitude(Math.min(7.2, this.rocket.y * 0.8))
        world.requestMinZoom(1)
      }
    }

    if (state === 'idle' && prev === 'descending') {
      world.sounds.hit(0.6, 90, { noise: true })
      world.ui.toast('Recovered.')
      this.recoverRocket()
    }

    // The parachute collapses onto the pedestal over 0.25 s instead of blinking out in one frame.
    if (this._chuteFall > 0) {
      this._chuteFall = Math.max(0, this._chuteFall - dt)
      const k = this._chuteFall / 0.25
      this.rocketParachute.scale.setScalar(0.2 + 0.8 * k * k)
      this.rocketParachute.visible = this._chuteFall > 0
    }

    // Clamp arms hinge outward and the umbilical swings back before lift-off; both return on landing.
    this._clampOpen += ((this._clampTarget || 0) - this._clampOpen) * (1 - Math.exp(-dt * 8))
    this._umbilical += ((this._umbTarget || 0) - this._umbilical) * (1 - Math.exp(-dt * 6))
    for (const clamp of this.clamps) clamp.rotation.z = -this._clampOpen
    this.umbilical.rotation.y = this._umbilical * 1.05
  }

  /** Settle the rocket exactly on the pedestal and put the pad back the way it was. */
  recoverRocket({ cooldown = null } = {}) {
    if (cooldown !== null) this.rocket = { state: 'idle', t: 0, y: 0, cooldown }
    this.rocketGroup.position.set(ROCKET_X, PEDESTAL_TOP, ROCKET_Z)
    this.rocketBody.velocity.set(0, 0, 0)
    this.rocketBody.position.set(ROCKET_X, 4.6, ROCKET_Z)
    this._rocketPrev.x = ROCKET_X
    this._rocketPrev.y = 0
    this._chuteFall = this.rocketParachute.visible ? 0.25 : 0
    if (this._chuteFall === 0) {
      this.rocketParachute.visible = false
      this.rocketParachute.scale.setScalar(0.2)
    }
    this.flame.visible = false
    this.rocketBell.material.emissiveIntensity = 0
    this.rocketTip.material.emissiveIntensity = 1
    this._clampTarget = 0
    this._umbTarget = 0
    this._descendT = 0
    this._smokeT = 0
    this._launchedFx = false
    this._lastCountdownSec = null
    this.disturbed = false
    this.world.ui.setChip('rocket', null)
  }
}
