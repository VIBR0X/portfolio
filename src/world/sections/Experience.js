import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Section } from './Section.js'
import { CANNON } from '../../core/Physics.js'
import { resume } from '../../content/resume.js'
import { flat, lampMaterial, palette } from '../Materials.js'
import { board } from '../Board.js'
import { floorLabel, labelMesh } from '../Text.js'
import { InstancedProps } from '../props/InstancedProps.js'
import { Counter } from '../props/Counter.js'
import { RedButton, resetBodies } from '../props/RedButton.js'
import { PLANE } from '../PlanePhysics.js'

/* ---------------------------------------------------------------------- */
/* Site plan                                                              */
/* ---------------------------------------------------------------------- */

/** Four bays, newest EAST (nearest the crossroads), on 16 m centres. */
const BAYS = [
  { id: 'tark', x: -38, n: '01', stencil: 'TARK · CONFIDENCE GATE' },
  { id: 'epik', x: -54, n: '02', stencil: 'EPIK · SEVEN PIPELINES' },
  { id: 'consulting', x: -70, n: '03', stencil: 'CONSULTING · NINE SOURCES' },
  { id: 'devcom', x: -86, n: '04', stencil: 'DEVCOM · 21 DEVELOPERS' },
]
const PAD_Z = -32.8      // OPEN pads, on the avenue
const DATUM_Z = -36.3    // the cream rule the whole row is measured from
const STENCIL_Z = -37.5  // bay numeral + headline stencil
const PLATE_Z = -38.9    // date plate, printed from the resume's own `period`
const RING_Z = -43.2     // apron outline centre
const BOARD_Z = -47.4    // board, in the notch between two shells

/** Which of the nine sources the LLM layer scores as a fit. Fixed and visible; never counted. */
const FIT = [false, true, false, true, false, false, false, false, true]

const near = (car, x, z, r) => Math.hypot(car.x - x, car.z - z) < r

/**
 * The car positions a bay's own models have to be readable from: its OPEN pad, the road straight
 * out in front of it, and the road in front of each neighbour. Not the whole row — sighting bay 04
 * from bay 01's pad is a 48 m look straight down the line, where every bay in between is in the
 * way by construction and no layout could ever pass.
 */
const bayViews = (x) => [[x, PAD_Z], [x, -30], [x - 16, -30], [x + 16, -30]]
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const clamp01 = (v) => clamp(v, 0, 1)

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

/** A flat rounded-rectangle outline lying in XZ, facing up (the apron borders and lane frames). */
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

function wallBody(world, body) {
  body.userData = { kind: 'wall', tag: 'wall' }
  world.physics.add(body)
  return body
}

/**
 * Bay Row.
 *
 * Four bays laid out flat on an open apron, strictly low to high from south to north: pad, ground
 * stencil, machine, board. Nothing stands behind a bay and nothing stands over one. That is not a
 * style choice — the camera sits 26·zoom metres above the car and looks north and down, so anything
 * tall in a bay throws a long shadow of dead ground behind it, and a sight-line into an enclosure
 * leaves through the roof before it reaches the back. An earlier build put these four models inside
 * drive-in hangars with an 8 m board across each mouth and none of them could be seen at all;
 * `scripts/check-exhibits.mjs` traces every model, and the car, back to every camera the player can
 * actually have, and it is what keeps this arrangement honest.
 *
 * Four bays, four verbs, four silhouettes:
 *   01 TARK        shove   — a wedge: a puck into converging jaws that decide LOCAL or LLM
 *   02 EPIK        plough  — a comb: seven drums, one per pipeline, in front of the warehouse
 *   03 CONSULTING  thread  — a lattice: nine hinged flaps in three lanes you drive through
 *   04 DEVCOM      cover   — a grid: twenty-one floor tiles to light, then a release gate
 */
export class ExperienceSection extends Section {
  constructor(world, def) {
    super(world, def)
    this._m = new THREE.Matrix4()
    this._p = new THREE.Vector3()
    this._q = new THREE.Quaternion()
    this._s = new THREE.Vector3(1, 1, 1)
    this._e = new THREE.Euler()
    this._c = new THREE.Color()
    this._xAxis = new THREE.Vector3(1, 0, 0)
    this.counters = []

    this.buildApron()
    this.buildBoards()
    this.buildFlyPad()
    this.buildTark()
    this.buildEpik()
    this.buildConsulting()
    this.buildDevcom()

    this.chip = null
  }

  /* ------------------------------------------------------------------ */
  /* Row furniture                                                       */
  /* ------------------------------------------------------------------ */

  /** Apron outlines and every flat cream marking in the row: two draw calls for four bays. */
  buildApron() {
    const { world } = this

    const rings = BAYS.map((b) => at(ringGeometry(14.0, 9.6, 0.20, 0.5), b.x, 0.025, RING_Z))
    const ringMesh = new THREE.Mesh(mergeGeometries(rings), flat(palette.cobalt))
    ringMesh.name = 'row-apron'
    world.addStatic(ringMesh, { reveal: false, cast: false })

    // Cream, flat, ≤ 0.02 m tall: the datum rule the row is measured from, a tick per bay, Tark's
    // delivery channel, and a frame around each bay's readout strip.
    // 74 m inside a 76 m apron: the rule and the two end labels must land ON the pavement, or
    // they run off the north-west corner onto bare regolith and read as a mistake.
    const marks = [at(new THREE.BoxGeometry(74, 0.02, 0.16), -62, 0.022, DATUM_Z)]
    for (const b of BAYS) marks.push(at(new THREE.BoxGeometry(0.16, 0.02, 0.9), b.x, 0.022, DATUM_Z))
    for (const cx of [-39.6, -36.4]) marks.push(at(new THREE.BoxGeometry(0.16, 0.02, 4.6), cx, 0.022, -41.9))
    marks.push(at(ringGeometry(9.0, 1.5, 0.10, 0.1), -54, 0.022, -40.0))
    marks.push(at(ringGeometry(9.6, 1.2, 0.10, 0.1), -70, 0.022, -39.9))
    marks.push(at(ringGeometry(8.2, 4.4, 0.12, 0.15), -86, 0.024, -42.0))
    const markMesh = new THREE.Mesh(mergeGeometries(marks), flat(palette.cream))
    markMesh.name = 'row-markings'
    world.addStatic(markMesh, { reveal: false, cast: false })

    // Direction is stated exactly twice, hung 1.1 m south of the datum rule's two ends, outside
    // every bay. On the rule itself both words were struck through by 0.16 m of the same cream.
    // The old 46 m "2026 ─ 2025 ─ …" line ran west-to-east while the bays run oldest-west, so it
    // labelled DevCom 2026 and Tark EARLIER. Every actual date now lives on its own bay's plate,
    // printed from `resume.experience[].period`, so there is no ordering left to get backwards.
    // West of the parked aircraft (x −95.5 … −88.5), not under it: at −96.5 the label sat in the
    // wing's shadow from every camera east of it.
    const earlier = floorLabel('◀ EARLIER', { width: 3.6, height: 0.9, fontSize: 0.46, weight: 800 })
    earlier.position.set(-98.0, 0.03, DATUM_Z + 1.1)
    world.addStatic(earlier, { reveal: false, cast: false })
    const newer = floorLabel('NEWER ▶', { width: 4.0, height: 0.9, fontSize: 0.5, weight: 800 })
    newer.position.set(-27.5, 0.03, DATUM_Z + 1.1)
    world.addStatic(newer, { reveal: false, cast: false })
  }

  buildBoards() {
    const { world } = this
    for (const bay of BAYS) {
      const job = resume.experience.find((e) => e.id === bay.id)

      const numeral = floorLabel(bay.n, { width: 1.8, height: 1.4, color: palette.cream, fontSize: 1.15, weight: 900 })
      numeral.position.set(bay.x - 6.0, 0.032, STENCIL_Z)
      world.addStatic(numeral, { reveal: false, cast: false })

      const stencil = floorLabel(bay.stencil, { width: 10, height: 1.2, fontSize: 0.78, weight: 800 })
      stencil.position.set(bay.x + 0.6, 0.03, STENCIL_Z)
      world.addStatic(stencil, { reveal: false, cast: false })

      const plate = floorLabel(job.period, { width: 5.4, height: 0.7, fontSize: 0.44, weight: 800 })
      plate.position.set(bay.x - 3.2, 0.032, PLATE_Z)
      world.addStatic(plate, { reveal: false, cast: false })

      const made = board(world, {
        // 3.9 m tall: the header band and the 1.35 m counter reserve left a 3.5 m plate only 1.06 m
        // of face for the copy, which did not fit even at the smallest type the fit allows.
        x: bay.x, z: BOARD_Z,
        width: 5.8, height: 4.5, bottom: 2.3,
        // Measured 2026-09-09: at 0.26 the body line projected 3.5-5 px of cap height from the
        // avenue at 720p, so every bay showed a visitor copy they were failing to read. The panel
        // holds the paragraphs; a board's job is to be a legible sign. scripts/check-legible.mjs
        // now fails anything under 7 px.
        titleSize: 0.74, bodySize: 0.44,
        posts: true, physics: true,
        accent: palette.cobalt, entry: bay.id,
        // 'INDEPENDENT CONSULTING' wraps to two lines at this width and pushes the body line into
        // the counter frame; 'CONSULTING' is one line and matches the apron stencil. The full name
        // survives in resume.js, the panel and the PDF.
        kicker: `Bay ${bay.n} · Experience`,
        // The live readout is mounted on the lower 1.35 m of the plate; the copy is fitted above it.
        reserveBottom: 1.35,
        title: bay.id === 'consulting' ? 'CONSULTING' : job.company.toUpperCase(),
        subtitle: job.role,
        // No body line. Measured 2026-09-09 with scripts/check-legible.mjs: these boards stand 44 m
        // from the camera at the section spawn, where a line of body copy projects 3.5-4.7 px of cap
        // height however it is set — and asking for it forced the fitter down to its minimum 0.7
        // scale, which shrank the TITLE too. Dropping it lets the fitter run the title up to a size
        // that can actually be read, and the role summary it carried is the first line of the panel
        // and of the counter below. A board this far away is a sign, not a paragraph.
      })

      // The live readout rides the board's own tilted pivot. The board leans back 30° and the
      // camera looks down 43°, which puts the panel almost exactly square to the view — the counter
      // is face-on where a +z-facing plane would be foreshortened. It also cannot occlude anything:
      // it is the northmost thing in the bay bar the board it is bolted to.
      const counter = new Counter({
        width: 5.2, height: 1.15, ppu: 128, fontSize: 0.78,
        background: palette.cream, color: palette.ink, accent: palette.terracotta,
      })
      // 0.62, not 0.80: the board body is now the role summary, which wraps to two lines and ended
      // 8 px inside the counter's frame at the old height (measured in a real browser by
      // scripts/_boardfit.mjs — dom-stub fakes measureText, so the Node audits cannot see it).
      counter.mesh.position.set(0, 0.62, 0.19)
      made.group.children[0].add(counter.mesh)
      bay.counter = counter
      bay.boardGroup = made.group
      this.counters.push(counter)

      const area = world.addArea({
        x: bay.x, z: PAD_Z, width: 5, depth: 3, label: job.company.toUpperCase(),
        color: palette.cobalt,
        onInteract: () => world.ui.togglePanel(bay.id),
      })
      area.actionLabel = 'OPEN'
    }
  }

  /**
   * The FLY pad. The world's one aircraft is parked at the west end of the avenue (`PLANE.spawn`),
   * nose east, with 92 m of straight pavement to roll down. The pad sits south of it, where a car
   * driving up actually comes to rest against its collider; `scripts/check-pads.mjs` asserts the
   * car fits at the pad's centre.
   */
  buildFlyPad() {
    const { world } = this
    const [px, , pz] = PLANE.spawn
    const area = world.addArea({
      x: px, z: pz + 3.4, width: 5, depth: 3.4, label: 'FLY',
      color: palette.lamp,
      onInteract: () => { world.mode === 'plane' ? world.exitPlane() : world.boardPlane() },
    })
    area.actionLabel = 'FLY'
    this.flyArea = area
  }

  /* ------------------------------------------------------------------ */
  /* Bay 01 — TARK: shove a decision into the confidence gate            */
  /* ------------------------------------------------------------------ */

  buildTark() {
    const { world } = this
    const X = -38

    // Two jaws converging north: a 4.4 m mouth at z −41.4 narrowing to a 2.2 m throat at −44.2.
    // 1.1 m tall, not 1.5: measured, a 1.5 m wall shadowed both cradles behind it from the road at
    // the neighbouring bay. Still well over the 0.70 m puck it funnels.
    // Each jaw is 3.008 m long along (∓0.3657, −0.9308), so the west jaw is yawed 1.1967 rad and
    // the east one 1.9449.
    const jaws = []
    for (const [cx, yaw] of [[X - 1.65, 1.1967], [X + 1.65, 1.9449]]) {
      const geo = new THREE.BoxGeometry(3.008, 1.1, 0.42)
      geo.rotateY(yaw)
      jaws.push(at(geo, cx, 0.55, -42.8))
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))
      const body = world.physics.box({ size: [3.008, 1.1, 0.42], mass: 0, position: [cx, 0.55, -42.8], quaternion: q, sleepy: false })
      body.updateAABB()
      wallBody(world, body)
    }
    const jawMesh = new THREE.Mesh(mergeGeometries(jaws), flat(palette.cobalt))
    jawMesh.name = 'tark-jaws'
    world.addStatic(jawMesh)

    // The diverter blade. Animated, never simulated: the puck is captured before it reaches the
    // blade, so nothing ever has to be pushed by it. 0.30 m across and 0.90 m tall, which is under
    // check-solids' 0.5 m footprint floor for props below 1 m — the size is load-bearing.
    this.blade = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.90, 1.90), flat(palette.terracotta))
    this.blade.position.set(X, 0.45, -44.4)
    world.addStatic(this.blade)

    // Two cradles, 0.34 m tall (under the audit's 0.4 m height floor, so no body by rule).
    const cradle = (w) => mergeGeometries([
      at(new THREE.BoxGeometry(w, 0.34, 0.22), 0, 0, -0.69),
      at(new THREE.BoxGeometry(0.22, 0.34, 1.6), -(w / 2 - 0.11), 0, 0),
      at(new THREE.BoxGeometry(0.22, 0.34, 1.6), w / 2 - 0.11, 0, 0),
    ])
    const localCradle = new THREE.Mesh(cradle(1.8), flat(palette.cream))
    localCradle.position.set(X - 3.2, 0.17, -46.1)
    const llmCradle = new THREE.Mesh(cradle(1.6), flat(palette.terracotta))
    llmCradle.position.set(X + 2.6, 0.17, -46.1)
    world.addStatic(localCradle)
    world.addStatic(llmCradle)

    for (const [text, cx] of [['LOCAL', X - 3.2], ['LLM', X + 2.6]]) {
      const tag = floorLabel(text, { width: 1.6, height: 0.4, fontSize: 0.28, weight: 800 })
      tag.position.set(cx, 0.031, -44.9)
      world.addStatic(tag, { reveal: false, cast: false })
    }

    // The LLM lane's own mast. It burns only when the confidence gate trips.
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.36, 2.2, 0.36), flat(palette.cobalt))
    post.position.set(X + 4.0, 1.1, -45.0)
    world.addStatic(post)
    wallBody(world, world.physics.box({ size: [0.36, 2.2, 0.36], mass: 0, position: [X + 4.0, 1.1, -45.0], sleepy: false }))
    this.llmHead = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.50, 0.60), lampMaterial().clone())
    this.llmHead.material.emissive = new THREE.Color(palette.ink)
    this.llmHead.material.emissiveIntensity = 0.15
    this.llmHead.position.set(X + 4.0, 2.45, -45.0)
    world.addStatic(this.llmHead)

    // Observe / Think / Act / Measure: four ground stations chasing at 4 Hz. The loop turns whether
    // or not you act, which is what makes "cycles" a real denominator rather than a count of rams.
    this.otamZ = [-40.4, -41.8, -43.2, -44.6]
    this.otam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 4)
    this.otam.name = 'otam-tiles'
    this.otam.frustumCulled = false
    this.otamZ.forEach((z, i) => {
      this._m.compose(this._p.set(X - 4.6, 0.028, z), this._q.identity(), this._s.set(1, 1, 1))
      this.otam.setMatrixAt(i, this._m)
      this.otam.setColorAt(i, this._c.set(palette.cream))
    })
    world.addStatic(this.otam, { reveal: false, cast: false })

    // Laid flat and turned a quarter turn so the letters run south → north, one per station.
    const otamText = floorLabel('O    T    A    M', { width: 5.6, height: 1.15, fontSize: 0.9, weight: 900 })
    otamText.rotation.z = Math.PI / 2
    otamText.position.set(X - 4.6, 0.031, -42.5)
    world.addStatic(otamText, { reveal: false, cast: false })

    // The puck: one heavy object, one claim at a time.
    const puck = new THREE.Group()
    puck.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.95, 14), flat(palette.cobalt)))
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.50, 0.04, 14), flat(palette.terracotta))
    cap.position.y = 0.495
    puck.add(cap)
    // 0.95 m tall and 3.5 kg, both measured: at 0.70 m and 9 kg the car simply drove up onto the
    // puck and everything stalled 2 m short of the throat, every time. Tall enough not to be
    // climbed, light enough that a shove carries it past the capture line on its own momentum.
    this.puckBody = world.physics.cylinder({ radiusTop: 0.55, radiusBottom: 0.55, height: 0.95, segments: 14, mass: 3.5, position: [X, 0.475, -39.6] })
    this.puckBody.material = world.physics.materials.object
    this.puckBody.linearDamping = 0.05
    this.puckBody.angularDamping = 0.4
    world.addDynamic(puck, this.puckBody, { tag: 'drum', shadowRadius: { rx: 0.55, rz: 0.55 } })
    this.track(this.puckBody)

    this.tarkButton = new RedButton(world, {
      x: X + 5.0, z: -41.6, radius: 0.9, bodies: [this.puckBody],
      onReset: () => { this.tark.run = null; this.tark.failT = 0; this.tark.hotT = 0; this.tark.armed = true; this.blade.rotation.y = 0 },
    })

    this.tark = this.freshTark()
  }

  freshTark() {
    return { cycles: 0, acts: 0, llm: 0, phase: 0, phaseT: 0, run: null, failT: 0, hotT: 0, blipT: 0, cycle: 0, forceTrip: false, armed: true }
  }

  /* ------------------------------------------------------------------ */
  /* Bay 02 — EPIK: plough the seven pipelines                           */
  /* ------------------------------------------------------------------ */

  buildEpik() {
    const { world } = this
    const X = -54

    const warehouse = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.8, 2.4), flat(palette.habitat))
    warehouse.position.set(X, 0.9, -44.6)
    world.addStatic(warehouse)
    wallBody(world, world.physics.box({ size: [6.4, 1.8, 2.4], mass: 0, position: [X, 0.9, -44.6], sleepy: false }))

    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.20, 2.7), flat(palette.cobalt))
    roof.position.set(X, 1.90, -44.6)
    world.addStatic(roof)

    const sign = labelMesh('BigQuery', { width: 3.0, height: 0.55, fontSize: 0.34, weight: 800, color: palette.ink })
    sign.position.set(X, 0.95, -43.37)
    world.addStatic(sign, { reveal: false })

    // Throughput, drawn as a bar across the shed face: one seventh per pipeline still standing.
    this.flowBar = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.20, 0.10), flat(palette.cream))
    this.flowBar.position.set(X, 1.50, -43.36)
    world.addStatic(this.flowBar)

    // Ambient motion visible from the road: a shuttle running the shed roof, slowed by every
    // pipeline that is down and stopped dead at 0/7.
    this.shuttle = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.30), flat(palette.cream))
    this.shuttle.position.set(X - 3.0, 2.15, -44.6)
    world.addStatic(this.shuttle)

    const drumBodies = []
    this.drumHome = []
    for (let i = 0; i < 7; i++) {
      const x = -57.6 + i * 1.2
      this.drumHome.push([x, -41.4])
      const body = world.physics.cylinder({ radiusTop: 0.55, radiusBottom: 0.55, height: 1.15, segments: 14, mass: 3.2, position: [x, 0.575, -41.4] })
      body.material = world.physics.materials.object
      body.linearDamping = 0.12
      drumBodies.push(body)
    }
    this.drums = new InstancedProps(world, {
      geometry: new THREE.CylinderGeometry(0.55, 0.55, 1.15, 14),
      material: flat(palette.cream),
      bodies: drumBodies,
      tag: 'drum',
      shadowRadius: { rx: 0.55, rz: 0.55 },
    })
    // Five cobalt, then the two terracotta ones from the second bullet: real-time pricing and
    // supply–demand. InstancedProps' `colors` option cycles, so it cannot do 5 + 2.
    for (let i = 0; i < 7; i++) this.drums.mesh.setColorAt(i, this._c.set(i < 5 ? palette.cobalt : palette.terracotta))
    this.drums.mesh.instanceColor.needsUpdate = true
    drumBodies.forEach((b) => this.track(b))
    this.drumBodies = drumBodies

    this.laneTiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.95, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 7)
    this.laneTiles.name = 'epik-lane-tiles'
    this.laneTiles.frustumCulled = false
    for (let i = 0; i < 7; i++) {
      this._m.compose(this._p.set(-57.6 + i * 1.2, 0.028, -40.0), this._q.identity(), this._s.set(1, 1, 1))
      this.laneTiles.setMatrixAt(i, this._m)
    }
    world.addStatic(this.laneTiles, { reveal: false, cast: false })

    // 0.4 m east of the last drum's home, or the drum spawns standing on the button's plate.
    this.epikButton = new RedButton(world, { x: -48.6, z: -41.6, radius: 0.9, bodies: drumBodies })

    this.epik = this.freshEpik()
    this.paintEpik(7)
  }

  freshEpik() {
    return { live: -1, idle: 0, shuttleX: -3.0, cycle: 0, lastToast: 7 }
  }

  /* ------------------------------------------------------------------ */
  /* Bay 03 — CONSULTING: thread the nine-source screen                  */
  /* ------------------------------------------------------------------ */

  buildConsulting() {
    const { world } = this
    const X = -70
    this.consRowZ = [-40.8, -43.6, -46.4]
    this.consLaneX = [-73.4, -70.0, -66.6]
    this.consPivotY = [1.45, 1.90, 2.35]

    // Four lane rails and three hinge bars, one merged cobalt cage.
    const cage = []
    for (const rx of [-75.1, -71.7, -68.3, -64.9]) {
      cage.push(at(new THREE.BoxGeometry(0.36, 2.55, 6.4), rx, 1.275, -43.6))
      wallBody(world, world.physics.box({ size: [0.36, 2.55, 6.4], mass: 0, position: [rx, 1.275, -43.6], sleepy: false }))
    }
    this.consRowZ.forEach((z, r) => cage.push(at(new THREE.BoxGeometry(10.4, 0.14, 0.14), X, this.consPivotY[r] + 0.07, z)))
    const cageMesh = new THREE.Mesh(mergeGeometries(cage), flat(palette.cobalt))
    cageMesh.name = 'consulting-cage'
    world.addStatic(cageMesh)

    // Nine flaps, hung from their top edge in three tiers so no row hides the one behind it.
    // 0.16 m thick and 1.15 m tall: under check-solids' 0.2 m footprint floor for props a metre or
    // taller, so they carry no bodies by rule. They swing clear before contact rather than being
    // simulated — a 0.16 m dynamic panel is half the thickness the car needs not to punch through.
    const flapGeo = new THREE.BoxGeometry(2.9, 1.15, 0.16)
    flapGeo.translate(0, -0.575, 0)
    this.flaps = new THREE.InstancedMesh(flapGeo, flat(palette.cream), 9)
    this.flaps.name = 'consulting-flaps'
    this.flaps.frustumCulled = false
    world.addStatic(this.flaps)

    this.cells = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 9)
    this.cells.name = 'consulting-cells'
    this.cells.frustumCulled = false
    for (let i = 0; i < 9; i++) {
      this._m.compose(this._p.set(-74.2 + i * 1.05, 0.028, -39.9), this._q.identity(), this._s.set(1, 1, 1))
      this.cells.setMatrixAt(i, this._m)
    }
    world.addStatic(this.cells, { reveal: false, cast: false })

    this.cons = this.freshCons()
    this.poseFlaps()
    this.paintCells()
  }

  freshCons() {
    return {
      flap: Array.from({ length: 9 }, () => ({ state: 'closed', t: 0, crawled: false, scoreT: -1, scored: false })),
      n: 0, runT: 0, running: false, doneT: 0, cycle: 0,
      best: this.cons?.best ?? Infinity, lastRun: this.cons?.lastRun ?? 0,
    }
  }

  /* ------------------------------------------------------------------ */
  /* Bay 04 — DEVCOM: cover the release floor, then ship                 */
  /* ------------------------------------------------------------------ */

  buildDevcom() {
    const { world } = this
    const X = -86
    this.tileAt = []
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 7; c++) this.tileAt.push([X + (c - 3) * 1.15, -40.6 - r * 1.4])
    }
    this.tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 21)
    this.tiles.name = 'devcom-tiles'
    this.tiles.frustumCulled = false
    this.tileAt.forEach(([x, z], i) => {
      this._m.compose(this._p.set(x, 0.028, z), this._q.identity(), this._s.set(1, 1, 1))
      this.tiles.setMatrixAt(i, this._m)
    })
    world.addStatic(this.tiles, { reveal: false, cast: false })

    // No lintel across the gate: a bar at this depth would hide the counter from every camera.
    // Two free-standing pylons sit outside the counter's column instead.
    const pylons = []
    for (const px of [X - 2.9, X + 2.9]) {
      pylons.push(at(new THREE.BoxGeometry(0.5, 2.4, 0.5), px, 1.2, -44.8))
      wallBody(world, world.physics.box({ size: [0.5, 2.4, 0.5], mass: 0, position: [px, 1.2, -44.8], sleepy: false }))
    }
    const pylonMesh = new THREE.Mesh(mergeGeometries(pylons), flat(palette.cobalt))
    pylonMesh.name = 'devcom-pylons'
    world.addStatic(pylonMesh)

    this.pylonHeads = [X - 2.9, X + 2.9].map((px) => {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.50, 0.60), lampMaterial().clone())
      head.position.set(px, 2.65, -44.8)
      world.addStatic(head)
      return head
    })

    const caption = floorLabel('RELEASE ▲', { width: 3.6, height: 0.9, fontSize: 0.55, weight: 800 })
    caption.position.set(X, 0.03, -44.4)
    world.addStatic(caption, { reveal: false, cast: false })

    this.dev = this.freshDevcom()
    this.paintTiles()
  }

  freshDevcom() {
    return {
      lit: new Array(21).fill(false), n: 0, runT: 0, running: false, shipT: 0, cycle: 0, wasNorth: false,
      releases: this.dev?.releases ?? 0, best: this.dev?.best ?? Infinity, elected: this.dev?.elected ?? false,
    }
  }

  /* ------------------------------------------------------------------ */
  /* Painting helpers                                                    */
  /* ------------------------------------------------------------------ */

  paintEpik(live) {
    for (let i = 0; i < 7; i++) {
      const on = this.drumLive(i)
      this._c.set(on ? (i < 5 ? palette.cream : palette.terracotta) : palette.ink)
      this.laneTiles.setColorAt(i, this._c)
    }
    this.laneTiles.instanceColor.needsUpdate = true
    this.flowBar.scale.x = Math.max(0.001, live / 7)
    this.flowBar.position.x = -56.9 + 2.9 * (live / 7)
  }

  drumLive(i) {
    const p = this.drums.proxies[i]
    this._p.set(0, 1, 0).applyQuaternion(p.quaternion)
    if (this._p.y <= 0.6) return false
    const [hx, hz] = this.drumHome[i]
    return Math.hypot(p.position.x - hx, p.position.z - hz) < 1.6
  }

  poseFlaps() {
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3)
      const lane = i % 3
      const f = this.cons.flap[i]
      let a = 0
      if (f.state === 'opening') a = 1.745 * clamp01(f.t / 0.22)
      else if (f.state === 'open') a = 1.745
      else if (f.state === 'closing') a = 1.745 * (1 - clamp01(f.t / 0.5))
      this._q.setFromAxisAngle(this._xAxis, a)
      // Every row hangs to the same 0.30 m sill, so the back rows are stretched to reach it. At a
      // uniform 1.15 m the third row's sill sat at 1.20 m — a 1.2 m car passed clean underneath and
      // the flap opened for nothing. Stretching also makes the far rows physically bigger, which
      // pays back the perspective they lose.
      this._m.compose(
        this._p.set(this.consLaneX[lane], this.consPivotY[row], this.consRowZ[row]),
        this._q,
        this._s.set(1, (this.consPivotY[row] - 0.30) / 1.15, 1),
      )
      this.flaps.setMatrixAt(i, this._m)
      this.flaps.setColorAt(i, this._c.set(f.crawled ? palette.cobalt : palette.cream))
    }
    this.flaps.instanceMatrix.needsUpdate = true
    this.flaps.instanceColor.needsUpdate = true
  }

  paintCells() {
    for (let i = 0; i < 9; i++) {
      const f = this.cons.flap[i]
      // Crawled, then scored: the LLM layer never runs before the crawler has been through.
      const col = f.scored ? (FIT[i] ? palette.terracotta : palette.ink) : f.crawled ? palette.cobalt : palette.cream
      this.cells.setColorAt(i, this._c.set(col))
    }
    this.cells.instanceColor.needsUpdate = true
  }

  paintTiles() {
    for (let i = 0; i < 21; i++) this.tiles.setColorAt(i, this._c.set(this.dev.lit[i] ? palette.cobalt : palette.cream))
    this.tiles.instanceColor.needsUpdate = true
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                              */
  /* ------------------------------------------------------------------ */

  update(dt, elapsed) {
    const { world } = this
    const car = world.car.physics.position
    const vel = world.car.physics.velocity

    if (this.flyArea) {
      const label = world.mode === 'plane' ? 'LAND' : 'FLY'
      this.flyArea.actionLabel = label
      this.flyArea.label = label
    }

    this.updateTark(dt, car)
    this.updateEpik(dt, car)
    this.updateConsulting(dt, car, vel)
    this.updateDevcom(dt, elapsed, car, vel)
    this.updateChip(car)
  }

  /* ---- 01 Tark ---- */

  updateTark(dt, car) {
    const { world } = this
    const t = this.tark
    const X = -38

    // The heartbeat runs whether or not you act — that is what makes "cycles" a denominator.
    if (near(car, X, -43, 14)) {
      t.phaseT += dt
      if (t.phaseT >= 0.25) {
        t.phaseT -= 0.25
        t.phase = (t.phase + 1) % 4
        if (t.phase === 0) t.cycles++
        for (let i = 0; i < 4; i++) this.otam.setColorAt(i, this._c.set(i === t.phase ? palette.lamp : palette.cream))
        this.otam.instanceColor.needsUpdate = true
        if (near(car, X, -43, 9)) world.sounds.blip(460 + t.phase * 70)
      }
    }

    // Capture: one claim per action. A second shove while a run is live does nothing at all, and
    // the claim only re-arms once the puck is back south of the throat — the cradles sit inside the
    // capture band, so without the latch the machine claimed the same resting puck every frame.
    const p = this.puckBody.position
    if (p.z > -42.6) t.armed = true
    if (!t.run && t.armed && t.failT <= 0 && p.z < -43.4 && p.z > -46.5) {
      t.armed = false
      const v = this.puckBody.velocity.length()
      const off = Math.abs(p.x - X)
      t.acts++
      if (off > 1.05) {
        // Arrived wedged: no valid reading, so the machine refuses rather than guessing.
        t.failT = 1.2
        this.blade.rotation.y = 0
        world.sounds.hit(0.5, 180, { noise: true })
        t.run = { lane: 'local', t: 0, from: [p.x, p.y, p.z], hold: true }
      } else {
        const conf = 1 - clamp01(off / 1.3) * 0.7 - clamp01((v - 7) / 8) * 0.5
        const lane = (!t.forceTrip && conf >= 0.55) ? 'local' : 'llm'
        t.forceTrip = false
        if (lane === 'llm') {
          t.llm++
          t.hotT = 1.0
          world.sounds.blip(1180)
          if (t.llm === 1) world.ui.toast('Confidence gate tripped. That is the LLM call.', 2600)
        }
        this.blade.rotation.y = lane === 'local' ? 0.56 : -0.56
        t.run = { lane, t: 0, from: [p.x, p.y, p.z], hold: false }
        this.puckBody.type = CANNON.Body.KINEMATIC
        this.puckBody.velocity.setZero()
        this.puckBody.angularVelocity.setZero()
        this.puckBody.wakeUp()
      }
    }

    if (t.failT > 0) {
      t.failT -= dt
      if (t.failT <= 0 && t.run?.hold) { t.run = null; this.blade.rotation.y = 0 }
    }

    // The glide home: a kinematic arc into the cradle, released asleep on the cradle floor.
    if (t.run && !t.run.hold) {
      t.run.t += dt
      const k = clamp01(t.run.t / 1.1)
      const local = t.run.lane === 'local'
      const [x0, y0, z0] = t.run.from
      const x1 = X + (local ? -1.6 : 1.6)
      const x2 = X + (local ? -3.2 : 2.6)
      const j = 1 - k
      this.puckBody.position.set(
        j * j * x0 + 2 * j * k * x1 + k * k * x2,
        j * j * y0 + 2 * j * k * 0.85 + k * k * 0.475,
        j * j * z0 + 2 * j * k * -45.2 + k * k * -46.1,
      )
      this.puckBody.updateAABB()
      if (k >= 1) {
        this.puckBody.type = CANNON.Body.DYNAMIC
        this.puckBody.velocity.setZero()
        this.puckBody.angularVelocity.setZero()
        this.puckBody.updateMassProperties()
        this.puckBody.sleep()
        world.sounds.hit(0.4, 200)
        t.run = null
        this.blade.rotation.y = 0
      }
    }

    if (t.hotT > 0) t.hotT = Math.max(0, t.hotT - dt)
    this.llmHead.material.emissive.set(t.hotT > 0 ? palette.terracotta : palette.ink)
    this.llmHead.material.emissiveIntensity = t.hotT > 0 ? 1.5 : 0.15

    t.cycle += dt
    const slot = Math.floor(t.cycle / 2.2) % 2
    const rate = t.cycles ? (t.llm / t.cycles) * 100 : 0
    let text
    let hot = false
    if (t.failT > 0) { text = 'FAIL CLSD'; hot = true }
    else if (t.hotT > 0) { text = 'GATE TRIP'; hot = true }
    else if (t.cycles >= 40 && rate > 5) { text = slot ? `LLM ${rate.toFixed(1)}%` : 'OVER SPEC'; hot = true }
    else if (t.cycles >= 200) text = slot ? `OTAM ${Math.min(9999, t.cycles)}` : `LLM ${rate.toFixed(1)}%`
    else text = slot ? `LOCAL ${Math.min(999, t.acts - t.llm)}` : `LLM ${Math.min(999, t.llm)}`
    BAYS[0].counter.set(text, { highlight: hot })
  }

  /* ---- 02 Epik ---- */

  updateEpik(dt, car) {
    const { world } = this
    const e = this.epik
    let live = 0
    for (let i = 0; i < 7; i++) if (this.drumLive(i)) live++

    if (live !== e.live) {
      const gained = e.live >= 0 && live > e.live
      e.live = live
      this.paintEpik(live)
      if (gained) world.sounds.ding()
      if (live === 7 && e.lastToast !== 7) {
        e.lastToast = 7
        world.sounds.arpeggio()
        world.ui.toast('Seven pipelines: 2.3M records a day, reporting in minutes.', 2800)
      }
      if (live < 7) e.lastToast = live
      e.idle = 0
    } else if (live < 7) {
      e.idle += dt
      // The row's resting state is never seven toppled pipelines under a board that says he built
      // seven: once you have driven away and nothing has moved, they stand back up.
      if (e.idle > 22 && !near(car, -54, -42, 16)) { resetBodies(world, this.drumBodies); e.idle = 0 }
    }

    e.shuttleX += dt * 1.6 * (live / 7)
    if (e.shuttleX > 3.0) e.shuttleX -= 6.0
    this.shuttle.position.x = -54 + e.shuttleX

    e.cycle += dt
    const slot = Math.floor(e.cycle / 2.4) % 3
    if (live === 7) BAYS[1].counter.set(slot === 0 ? '7 / 7 UP' : slot === 1 ? '2.3M/DAY' : 'MINUTES', { highlight: slot === 1 })
    else BAYS[1].counter.set(`${live} / 7 UP`)
  }

  /* ---- 03 Consulting ---- */

  updateConsulting(dt, car, vel) {
    const { world } = this
    const c = this.cons
    let cellsChanged = false

    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3)
      const lane = i % 3
      const f = c.flap[i]
      const rowZ = this.consRowZ[row]
      const inLane = Math.abs(car.x - this.consLaneX[lane]) < 1.5
      // Opens on approach from either side: a flap the car can pass through unopened reads as a
      // ghost, and the trigger is the only thing holding the illusion up.
      const coming = inLane && Math.abs(car.z - rowZ) < 1.9 && (vel.z < -1 || Math.abs(car.z - rowZ) < 0.9)

      if (f.state === 'closed' && coming) { f.state = 'opening'; f.t = 0; world.sounds.blip(560 + i * 35) }
      else if (f.state === 'opening') { f.t += dt; if (f.t >= 0.22) { f.state = 'open'; f.t = 0 } }
      else if (f.state === 'open') {
        f.t += dt
        if (f.t >= 0.9 && !coming) {
          f.state = 'closing'
          f.t = 0
          world.sounds.hit(0.35, 300, { noise: true })
          if (!f.crawled && car.z < rowZ && inLane) {
            f.crawled = true
            f.scoreT = 0
            c.n++
            if (!c.running) { c.running = true; c.runT = 0 }
            cellsChanged = true
          }
        }
      } else if (f.state === 'closing') { f.t += dt; if (f.t >= 0.5) { f.state = 'closed'; f.t = 0 } }

      if (f.scoreT >= 0 && !f.scored) {
        f.scoreT += dt
        if (f.scoreT >= 1.1) {
          f.scored = true
          cellsChanged = true
          if (FIT[i]) world.sounds.ding()
          else world.sounds.blip(320)
        }
      }
    }

    this.poseFlaps()
    if (cellsChanged) this.paintCells()

    if (c.running) c.runT += dt
    if (c.doneT === 0 && c.n === 9 && c.flap.every((f) => f.scored)) {
      c.doneT = 0.0001
      c.running = false
      c.lastRun = Math.round(c.runT)
      c.best = Math.min(c.best, c.lastRun)
      world.sounds.arpeggio()
      world.ui.toast('Nine registry sources crawled — 4,800+ companies scored against the thesis.', 3000)
    }
    if (c.doneT > 0) {
      c.doneT += dt
      if (c.doneT > 5) {
        for (const f of c.flap) { f.crawled = false; f.scored = false; f.scoreT = -1 }
        c.n = 0
        c.doneT = 0
        c.runT = 0
        this.poseFlaps()
        this.paintCells()
      }
    }

    c.cycle += dt
    const slot = Math.floor(c.cycle / 2.2) % 3
    if (c.doneT > 0) {
      const best = c.best === Infinity ? c.lastRun : c.best
      BAYS[2].counter.set(slot === 0 ? '4,800+' : slot === 1 ? `RUN ${Math.min(999, c.lastRun)}s` : `BEST ${Math.min(999, best)}s`, { highlight: slot === 0 })
    } else BAYS[2].counter.set(`SRC ${c.n} / 9`)
  }

  /* ---- 04 DevCom ---- */

  updateDevcom(dt, elapsed, car, vel) {
    const { world } = this
    const d = this.dev
    const X = -86

    if (!d.elected && this.contains(car.x, car.z) && Math.abs(car.x - X) < 8) {
      d.elected = true
      world.ui.toast('Elected to lead 21 developers.', 2600)
    }

    if (d.shipT === 0 && world.car.physics.grounded) {
      for (let i = 0; i < 21; i++) {
        if (d.lit[i]) continue
        const [tx, tz] = this.tileAt[i]
        if (Math.hypot(car.x - tx, car.z - tz) < 0.70) {
          d.lit[i] = true
          d.n++
          if (!d.running) { d.running = true; d.runT = 0 }
          world.sounds.blip(500 + i * 14)
          this.paintTiles()
        }
      }
    }
    if (d.running && d.shipT === 0) d.runT += dt

    // The release gate physically refuses to fire below 21/21: a release cycle ships when everyone
    // is in, or not at all.
    const north = car.z < -44.8
    if (north && !d.wasNorth && Math.abs(car.x - X) < 2.4 && vel.z < -0.5) {
      if (d.n === 21 && d.shipT === 0) {
        d.releases++
        d.best = Math.min(d.best, Math.round(d.runT))
        d.shipT = 0.0001
        d.running = false
        world.sounds.arpeggio()
        const s1 = resume.experience.find((e) => e.id === 'devcom').stats[1]
        world.ui.toast(`Shipped. ${s1.value} ${s1.label}.`, 3000)
      } else if (d.n < 21) world.sounds.boop()
    }
    d.wasNorth = north

    if (d.shipT > 0) {
      d.shipT += dt
      if (d.shipT > 2.5 && d.n > 0) {
        d.lit.fill(false)
        d.n = 0
        this.paintTiles()
      }
      if (d.shipT > 8) { d.shipT = 0; d.runT = 0 }
    }

    const armed = d.n === 21
    for (let i = 0; i < 2; i++) {
      const head = this.pylonHeads[i]
      if (armed) { head.material.emissive.set(palette.terracotta); head.material.emissiveIntensity = 1.6 }
      else {
        head.material.emissive.set(palette.lamp)
        head.material.emissiveIntensity = ((elapsed + i * 0.6) % 2) < 0.15 ? 1.6 : 0.15
      }
    }

    d.cycle += dt
    const slot = Math.floor(d.cycle / 2.2) % 4
    if (d.shipT > 0) {
      const best = d.best === Infinity ? 0 : d.best
      BAYS[3].counter.set(
        slot === 0 ? '+10% MAU' : slot === 1 ? '5,000+' : slot === 2 ? `RELEASE ${Math.min(99, d.releases)}` : `BEST ${Math.min(999, best)}s`,
        { highlight: slot === 0 },
      )
    } else if (armed) BAYS[3].counter.set(slot % 2 ? 'GATE OPEN' : '21 / 21', { highlight: true })
    else BAYS[3].counter.set(`${d.n} / 21`)
  }

  /* ---- HUD ---- */

  updateChip(car) {
    const { world } = this
    if (!this.contains(car.x, car.z)) return
    let bay = BAYS[0]
    for (const b of BAYS) if (Math.abs(car.x - b.x) < Math.abs(car.x - bay.x)) bay = b
    let text
    if (bay.id === 'tark') {
      const t = this.tark
      text = `TARK · ${t.llm} LLM CALL${t.llm === 1 ? '' : 'S'} IN ${t.cycles} CYCLE${t.cycles === 1 ? '' : 'S'} · GATE UNDER 5%`
    } else if (bay.id === 'epik') {
      const live = Math.max(0, this.epik.live)
      text = live === 7
        ? (this.drumLive(5) && this.drumLive(6)
            ? 'EPIK · 7 / 7 PIPELINES · REAL-TIME PRICING'
            : 'EPIK · 7 / 7 PIPELINES · REPORTING IN MINUTES')
        : `EPIK · ${live} / 7 PIPELINES`
    } else if (bay.id === 'consulting') {
      text = `CONSULTING · ${this.cons.n} / 9 SOURCES · LLM SCORED`
    } else {
      text = this.dev.n === 21 ? 'DEVCOM · TEAM READY — DRIVE THROUGH THE GATE' : `DEVCOM · ${this.dev.n} / 21 DEVELOPERS`
    }
    if (text !== this.chip) { this.chip = text; world.ui.setChip('bay', text) }
  }

  /* ------------------------------------------------------------------ */

  onHorn() {
    const p = this.world.car.physics.position
    if (near(p, -38, -43, 12)) this.tark.forceTrip = true
    if (near(p, -70, -43, 12)) for (const f of this.cons.flap) if (f.state === 'closed') { f.state = 'opening'; f.t = 0 }
  }

  onLeave() {
    this.chip = null
    this.world.ui.setChip('bay', null)
  }

  reset() {
    super.reset()
    this.tark = this.freshTark()
    this.epik = this.freshEpik()
    this.cons = this.freshCons()
    this.dev = this.freshDevcom()
    this.blade.rotation.y = 0
    this.poseFlaps()
    this.paintCells()
    this.paintTiles()
    this.paintEpik(7)
    this.onLeave()
  }

  /* ------------------------------------------------------------------ */
  /* What scripts/check-exhibits.mjs traces                              */
  /* ------------------------------------------------------------------ */

  /** Every point a visitor is meant to be looking at, 0.05–0.35 m proud of its surface. */
  get exhibits() {
    return [
      { label: 'Tark puck', x: -38.0, y: 1.00, z: -39.6, spread: 1.0, dz: 0.5, views: bayViews(-38) },
      { label: 'Tark throat', x: -38.0, y: 0.55, z: -43.4, spread: 0.8, dz: 0.3, views: bayViews(-38) },
      { label: 'Tark LOCAL cradle', x: -41.2, y: 0.40, z: -45.7, spread: 0.7, dz: 0.3, views: bayViews(-38) },
      { label: 'Tark LLM cradle', x: -35.4, y: 0.40, z: -45.7, spread: 0.6, dz: 0.3, views: bayViews(-38) },
      { label: 'Tark LLM head', x: -34.0, y: 2.80, z: -44.6, spread: 0.35, dz: 0.2, views: bayViews(-38) },
      { label: 'Tark O/T/A/M rail', x: -42.6, y: 0.06, z: -42.5, spread: 0.5, dz: 1.9, views: bayViews(-38) },
      { label: 'Epik drum rank', x: -54.0, y: 1.20, z: -40.8, spread: 2.4, dz: 0.3, views: bayViews(-54) },
      { label: 'Epik lane tiles', x: -54.0, y: 0.06, z: -40.0, spread: 3.0, dz: 0.5, views: bayViews(-54) },
      { label: 'Epik flow bar', x: -54.0, y: 1.50, z: -43.26, spread: 2.6, dz: 0.04, views: bayViews(-54) },
      { label: 'Consulting row 1', x: -70.0, y: 0.95, z: -40.45, spread: 3.4, dz: 0.2, views: bayViews(-70) },
      { label: 'Consulting row 2', x: -70.0, y: 1.40, z: -43.25, spread: 3.4, dz: 0.2, views: bayViews(-70) },
      { label: 'Consulting row 3', x: -70.0, y: 1.85, z: -46.05, spread: 3.4, dz: 0.2, views: bayViews(-70) },
      { label: 'Consulting scoring', x: -70.0, y: 0.06, z: -39.9, spread: 3.6, dz: 0.4, views: bayViews(-70) },
      { label: 'DevCom tile grid', x: -86.0, y: 0.06, z: -42.0, spread: 3.4, dz: 1.4, views: bayViews(-86) },
      { label: 'DevCom pylon heads', x: -86.0, y: 2.95, z: -44.5, spread: 2.9, dz: 0.2, views: bayViews(-86) },
    ]
  }

  /** Car positions those exhibits have to be visible from. */
  get viewpoints() {
    return BAYS.flatMap((b) => bayViews(b.x))
  }

  /** Where the car itself must stay visible — the original defect was an invisible CAR. */
  get driveable() {
    return [
      { label: 'apron', x0: -92, z0: -45, x1: -32, z1: -38.5 },
      { label: 'avenue', x0: -98, z0: -35, x1: -24, z1: -25 },
    ]
  }
}
