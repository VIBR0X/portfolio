import * as THREE from 'three'
import { flat, palette } from '../Materials.js'
import { bestOf } from '../Storage.js'

/**
 * Ten rings sweeping past every section, in the order they are flown. Ring 1 sits straight ahead of
 * the aircraft's take-off run — it rolls east along the avenue from (-92, -30) — and low enough
 * (14 m) that a climbing plane meets it: the course used to open at (0, 18), 104 m behind the
 * take-off line, so a visitor flew through three rings without a single one counting. Altitudes
 * clear the control tower's beacon (21.5 m) and the rocket (8.6 m), and the ceiling is 34 m.
 */
export const RING_COURSE = [
  { x: 0, z: -30, alt: 14 },    // straight off the take-off roll, over the crossroads
  { x: 48, z: -30, alt: 20 },   // east along the avenue past the test stands
  { x: 66, z: 0, alt: 20 },     // turn south
  { x: 52, z: 40, alt: 18 },    // over the playground
  { x: 4, z: 34, alt: 16 },     // west across Ground Control
  { x: 0, z: -4, alt: 16 },     // north up Runway 00
  { x: 0, z: -50, alt: 18 },    // the pipeline yard
  { x: 0, z: -84, alt: 20 },    // the control tower approach
  { x: -46, z: -92, alt: 20 },  // turn west
  { x: -72, z: -46, alt: 18 },  // back round to the hangars
]
const RADIUS = 5

/** Sky-ring air race: checkpoint order, lap timer, best time, and a landing-score grader. */
export class AirRace {
  constructor(world) {
    this.world = world
    this.nextIndex = 0
    this.lapT = 0
    this.lapActive = false
    this._prevPos = null
    this._flash = RING_COURSE.map(() => 0)
    this._buildRings()
  }

  /** Direction of travel through ring `i`, i.e. the normal of the plane it spans. */
  _ringNormal(i) {
    const r = RING_COURSE[i]
    const next = RING_COURSE[(i + 1) % RING_COURSE.length]
    return new THREE.Vector3(next.x - r.x, 0, next.z - r.z).normalize()
  }

  _buildRings() {
    const { world } = this
    const torusGeo = new THREE.TorusGeometry(RADIUS, 0.25, 8, 20)
    const discGeo = new THREE.CircleGeometry(RADIUS - 0.4, 20)
    this.rings = new THREE.InstancedMesh(torusGeo, flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.9 }), RING_COURSE.length)
    this.discs = new THREE.InstancedMesh(discGeo, flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.3, transparent: true, opacity: 0.15, side: THREE.DoubleSide }), RING_COURSE.length)
    this.rings.frustumCulled = false
    this.discs.frustumCulled = false
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3(1, 1, 1)
    RING_COURSE.forEach((r, i) => {
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._ringNormal(i))
      p.set(r.x, r.alt, r.z)
      m.compose(p, q, s)
      this.rings.setMatrixAt(i, m)
      this.discs.setMatrixAt(i, m)
    })
    this.rings.instanceMatrix.needsUpdate = true
    this.discs.instanceMatrix.needsUpdate = true
    world.addStatic(this.rings, { reveal: false, cast: false })
    world.addStatic(this.discs, { reveal: false, cast: false })
    // Ten identical glowing hoops and a chip reading "RING 3/10" told the visitor nothing about
    // WHICH hoop to aim at. The one that counts wears its own brighter, larger ring.
    this.target = new THREE.Mesh(
      new THREE.TorusGeometry(RADIUS + 0.35, 0.34, 8, 24),
      flat(palette.terracotta, { emissive: palette.terracotta, emissiveIntensity: 1.2 }),
    )
    this.target.frustumCulled = false
    this.target.visible = false
    world.addStatic(this.target, { reveal: false, cast: false })
    this._targetIndex = -1
    this.rings.visible = false
    this.discs.visible = false
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3(1, 1, 1)
  }

  /**
   * Segment/ring intersection: did prev->curr cross the next ring's plane inside its radius?
   * Tested as a segment rather than a point so a fast plane cannot tunnel through a ring.
   */
  _tryPass(prev, curr) {
    const i = this.nextIndex
    const r = RING_COURSE[i]
    const centre = new THREE.Vector3(r.x, r.alt, r.z)
    const normal = this._ringNormal(i)
    const d0 = prev.clone().sub(centre).dot(normal)
    const d1 = curr.clone().sub(centre).dot(normal)
    if ((d0 <= 0) === (d1 <= 0)) return false
    const t = d0 / (d0 - d1)
    const cross = prev.clone().lerp(curr, t)
    if (cross.distanceTo(centre) > RADIUS) return false
    this._flash[i] = 0.4
    this._pass()
    return true
  }

  _pass() {
    this.nextIndex++
    this.world.sounds.blip(1200)
    if (this.nextIndex >= RING_COURSE.length) {
      const time = this.lapT
      const best = bestOf('portfolio-air-race-lap', time)
      this.world.ui.toast(`Lap complete — ${time.toFixed(1)}s${best ? ' — new best!' : ''}`)
      this.world.sounds.arpeggio()
      this.nextIndex = 0
      this.lapActive = false
      this.lapT = 0
    }
  }

  /**
   * Abandon the attempt in progress: a crash or hopping out of the plane. Without this the
   * HUD chip stays frozen on the last ring the visitor flew through — visible on the respawned
   * parked plane and still there after switching back to the car.
   */
  abort() {
    this.nextIndex = 0
    this.lapT = 0
    this.lapActive = false
    this._prevPos = null
    this.world.ui.setChip('lap', null)
  }

  _grade(vy) {
    const a = Math.abs(vy)
    if (a < 1) return 'Butter landing'
    if (a < 2.5) return 'Smooth landing'
    return 'Landed'
  }

  /** Called from World.update while flying, right after the plane's own step. */
  onPlaneUpdate(plane, events) {
    const curr = new THREE.Vector3(plane.position.x, plane.position.y, plane.position.z)
    if (!this._prevPos) this._prevPos = curr.clone()

    if (!plane.grounded) {
      if (!this.lapActive) { this.lapActive = true; this.lapT = 0; this.nextIndex = 0 }
      this._tryPass(this._prevPos, curr)
      const next = RING_COURSE[this.nextIndex]
      const away = Math.round(Math.hypot(curr.x - next.x, curr.z - next.z))
      this.world.ui.setChip('lap', `RING ${this.nextIndex + 1}/${RING_COURSE.length} · ${away} m · ${this.lapT.toFixed(1)}s`)
    }
    this._prevPos.copy(curr)

    if (events.justLanded || events.hardLanding) {
      const vy = plane._lastVy ?? 0
      if (events.justLanded) {
        const onCentre = Math.abs(plane.position.x) < 1 ? ' · on the centreline' : ''
        this.world.ui.toast(`${this._grade(vy)} · ${Math.abs(vy).toFixed(1)} m/s${onCentre}`)
        bestOf('portfolio-air-race-landing', Math.abs(vy))
      }
      // A landing ends the attempt either way; the next take-off starts a fresh lap.
      this.lapActive = false
      this.lapT = 0
      this.nextIndex = 0
      this.world.ui.setChip('lap', null)
    }
  }

  /** Park the highlight on the ring that actually counts next. */
  _placeTarget() {
    if (this._targetIndex === this.nextIndex) return
    this._targetIndex = this.nextIndex
    const r = RING_COURSE[this.nextIndex]
    this.target.position.set(r.x, r.alt, r.z)
    this.target.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._ringNormal(this.nextIndex))
  }

  update(dt, elapsed) {
    // The rings belong to flying. Left visible while driving, one of them looms over a section and
    // covers what the visitor is meant to be reading.
    const flying = this.world.mode === 'plane'
    if (this.rings.visible !== flying) {
      this.rings.visible = flying
      this.discs.visible = flying
    }
    this._placeTarget()
    this.target.visible = flying
    if (flying) this.target.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.04)
    if (this.lapActive) this.lapT += dt
    let dirty = false
    for (let i = 0; i < this._flash.length; i++) {
      if (this._flash[i] <= 0) continue
      this._flash[i] = Math.max(0, this._flash[i] - dt)
      dirty = true
      const r = RING_COURSE[i]
      const k = 1 + this._flash[i] * 0.8
      this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._ringNormal(i))
      this._m.compose(this._p.set(r.x, r.alt, r.z), this._q, this._s.setScalar(k))
      this.discs.setMatrixAt(i, this._m)
    }
    if (dirty) this.discs.instanceMatrix.needsUpdate = true
  }
}
