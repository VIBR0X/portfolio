import * as THREE from 'three'
import { flat, palette } from '../Materials.js'
import { bestOf } from '../Storage.js'

/**
 * Ten rings sweeping past every section. Altitudes clear the control tower's beacon (21.5 m) and
 * the rocket (14 m); the ring near the tower is offset laterally rather than flown over.
 */
export const RING_COURSE = [
  { x: 0, z: 18, alt: 14 },
  { x: 0, z: -30, alt: 20 },
  { x: -60, z: -40, alt: 22 },
  { x: -60, z: -20, alt: 20 },
  { x: 60, z: -30, alt: 22 },
  { x: 60, z: -10, alt: 20 },
  { x: 0, z: -70, alt: 18 },
  { x: 20, z: -95, alt: 20 },
  { x: 52, z: 44, alt: 18 },
  { x: 0, z: 30, alt: 15 },
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
      this.world.ui.setChip('lap', `RING ${this.nextIndex + 1}/${RING_COURSE.length} · ${this.lapT.toFixed(1)}s`)
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

  update(dt) {
    // The rings belong to flying. Left visible while driving, the first one looms over the spawn
    // and covers the name on the runway, which is the first thing a visitor sees.
    const flying = this.world.mode === 'plane'
    if (this.rings.visible !== flying) {
      this.rings.visible = flying
      this.discs.visible = flying
    }
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
