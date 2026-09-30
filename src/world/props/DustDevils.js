import * as THREE from 'three'
import { CANNON } from '../../core/Physics.js'
import { flat, palette } from '../Materials.js'
import { rng as seededRng } from '../Textures.js'
import { ROAD_RECTS } from '../Roads.js'
import { SECTION_DEFS } from '../sections/registry.js'
import { scatterPoints } from '../Clutter.js'

/** Column geometry and the wander rule's constants (spec §2.1). */
export const DEVIL = { height: 9, radiusTop: 1.6, radiusBottom: 0.35, turn: 0.9, margin: 6 }

const ROAD_MARGIN = 3
// A devil that finds itself inside something (only possible at spawn, or if a section is later
// placed over one) walks straight for the nearest open ground at this speed instead of wandering.
const ESCAPE_SPEED = 6
const ESCAPE_REACH = 80
const ESCAPE_RAYS = 16
const DUST_UP = new THREE.Vector3(0, 2.5, 0)

/** True when (x, z) is inside a section AABB inflated by 6 m, a road inflated by 3 m, or outside the extents minus 6 m. */
function blocked(x, z, { extents, sections = SECTION_DEFS, roads = ROAD_RECTS }) {
  const m = DEVIL.margin
  if (x < extents.x0 + m || x > extents.x1 - m || z < extents.z0 + m || z > extents.z1 - m) return true
  for (const s of sections) {
    const [x0, z0, x1, z1] = s.aabb
    if (x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m) return true
  }
  for (const r of roads) {
    if (r.disc) { if (Math.hypot(x - r.cx, z - r.cz) < r.w / 2 + ROAD_MARGIN) return true; continue }
    if (Math.abs(x - r.cx) < r.w / 2 + ROAD_MARGIN && Math.abs(z - r.cz) < r.d / 2 + ROAD_MARGIN) return true
  }
  return false
}

/** Heading (of 16 candidates) whose straight ray reaches open ground soonest; null if none does within reach. */
function escapeHeading(x, z, env) {
  let best = null
  let bestD = Infinity
  for (let k = 0; k < ESCAPE_RAYS; k++) {
    const h = (k / ESCAPE_RAYS) * Math.PI * 2
    const cx = Math.cos(h)
    const sz = Math.sin(h)
    for (let d = 1; d <= ESCAPE_REACH && d < bestD; d += 1) {
      if (!blocked(x + cx * d, z + sz * d, env)) { bestD = d; best = h; break }
    }
  }
  return best
}

/**
 * One wander step for a dust devil `{ x, z, heading, speed, spin, phase }` — pure, so it is testable
 * without a scene. Advances along `heading`, lets the heading drift, and refuses to enter a section
 * (inflated by 6 m), a road (inflated by 3 m) or the 6 m band inside the extents: the move is undone
 * and the heading rotates at 0.9 rad/s until a direction is clear (reflected at the extents). A devil
 * already inside a blocked zone heads straight for the nearest open ground. Devils never teleport.
 */
export function stepDevil(d, dt, env, rng = Math.random) {
  if (blocked(d.x, d.z, env)) {
    if (d.escape == null) d.escape = escapeHeading(d.x, d.z, env)
    if (d.escape != null) {
      d.heading = d.escape
      d.x += Math.cos(d.heading) * ESCAPE_SPEED * dt
      d.z += Math.sin(d.heading) * ESCAPE_SPEED * dt
    } else {
      d.heading += DEVIL.turn * dt
    }
    const { extents } = env
    const m = DEVIL.margin
    d.x = Math.min(extents.x1 - m, Math.max(extents.x0 + m, d.x))
    d.z = Math.min(extents.z1 - m, Math.max(extents.z0 + m, d.z))
    return d
  }
  d.escape = null
  const nx = d.x + Math.cos(d.heading) * d.speed * dt
  const nz = d.z + Math.sin(d.heading) * d.speed * dt
  if (!blocked(nx, nz, env)) {
    d.x = nx
    d.z = nz
  } else {
    const { extents } = env
    const m = DEVIL.margin
    const outX = nx < extents.x0 + m || nx > extents.x1 - m
    const outZ = nz < extents.z0 + m || nz > extents.z1 - m
    if (outX) d.heading = Math.PI - d.heading
    if (outZ) d.heading = -d.heading
    if (!outX && !outZ) d.heading += DEVIL.turn * dt
  }
  d.heading += (rng() - 0.5) * 0.8 * dt
  return d
}

/**
 * Dust devils wandering the open regolith: one instanced, translucent, open-ended column each,
 * spinning and swaying, with a puff of dust at the base. No physics body and nothing ever pops or
 * teleports; the car gets a hop from driving through one, the plane a bank nudge.
 */
export class DustDevils {
  constructor(world, { count = world.experience.quality === 'low' ? 2 : 4 } = {}) {
    this.world = world
    this.env = { extents: world.extents, sections: SECTION_DEFS, roads: ROAD_RECTS }
    const geometry = new THREE.CylinderGeometry(DEVIL.radiusTop, DEVIL.radiusBottom, DEVIL.height, 8, 1, true)
    const material = flat(palette.regolithLight, { transparent: true, opacity: 0.32, side: THREE.DoubleSide, roughness: 1 })
    material.depthWrite = false
    const points = scatterPoints(world.extents, count, 31, { margin: 3, sectionMargin: 6 })
    this.devils = points.map((p, i) => ({
      x: p.x, z: p.z, heading: p.r * Math.PI * 2, speed: 2 + ((p.r * 7) % 1), spin: 4, phase: p.r * 6.28 + i,
      dust: i * 0.04, cooldown: 0,
    }))
    // Seeded, like every other scatter in the world: with Math.random the devils wandered a
    // different path every reload, and a translucent 9 m column drifting over the sample grid made
    // e2e-finish's acne guard flaky (0.786 on the run that caught it, 0.899 on the one before).
    this._rng = seededRng(37)
    this.mesh = new THREE.InstancedMesh(geometry, material, this.devils.length)
    this.mesh.renderOrder = 2
    this.mesh.frustumCulled = false
    this.mesh.name = 'dust-devils'
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3(1, 1, 1)
    this.devils.forEach((d, i) => this._pose(i, d, 0))
    this.mesh.instanceMatrix.needsUpdate = true
    world.addStatic(this.mesh, { reveal: false, cast: false })
  }

  _pose(i, d, t) {
    this._e.set(Math.sin(t * 1.3 + d.phase) * 0.08, d.spin * t, Math.cos(t * 1.1 + d.phase) * 0.08)
    this._q.setFromEuler(this._e)
    this._m.compose(this._p.set(d.x, DEVIL.height / 2, d.z), this._q, this._s)
    this.mesh.setMatrixAt(i, this._m)
  }

  update(dt, elapsed) {
    const { world } = this
    const focus = world.camera?.smoothTarget
    const car = world.mode === 'car' ? world.car?.physics.chassisBody : null
    const plane = world.mode === 'plane' ? world.plane : null
    for (let i = 0; i < this.devils.length; i++) {
      const d = this.devils[i]
      d.cooldown = Math.max(0, d.cooldown - dt)
      // Far from the visitor nothing is visible, so the devil simply pauses where it is.
      if (focus && Math.hypot(d.x - focus.x, d.z - focus.z) > 110) continue
      stepDevil(d, dt, this.env, this._rng)
      this._pose(i, d, elapsed)
      d.dust += dt
      if (d.dust >= 0.15) {
        d.dust -= 0.15
        world.particles?.emit(this._p.set(d.x, 0.3, d.z), { count: 3, color: palette.dust, spread: 1.5, velocity: DUST_UP, life: 1.0, gravity: -2 })
      }
      if (car && d.cooldown === 0 && Math.hypot(car.position.x - d.x, car.position.z - d.z) < 3) {
        car.applyImpulse(new CANNON.Vec3((this._rng() - 0.5) * 2.4, 2.6 * car.mass, (this._rng() - 0.5) * 2.4))
        world.sounds?.hit(0.4, 200, { noise: true })
        world.particles?.emit(this._p.set(d.x, 0.3, d.z), { count: 10, color: palette.dust, spread: 1.5, velocity: DUST_UP, life: 1.0, gravity: -2 })
        d.cooldown = 2
      }
      if (plane) {
        const p = plane.position
        if (p.y < 12 && Math.hypot(p.x - d.x, p.z - d.z) < 3) plane.physics.gust = 0.15
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
