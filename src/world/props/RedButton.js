import * as THREE from 'three'
import { CANNON } from '../../core/Physics.js'
import { flat, palette } from '../Materials.js'
import { easeOutBack } from '../Reveal.js'

const baseGeo = new THREE.CylinderGeometry(0.85, 1.0, 0.3, 16)
const domeGeo = new THREE.SphereGeometry(0.72, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2)

/**
 * Big red reset button you drive over. `bodies` is an array of cannon bodies whose
 * `userData.home` (set by world.addDynamic) is the pose to restore.
 */
export class RedButton {
  constructor(world, { x, z, bodies = [], onReset = null, radius = 1.3 }) {
    this.world = world
    this.x = x
    this.z = z
    this.radius = radius
    this.bodies = bodies
    this.onReset = onReset
    this.cooldown = 0
    this.press = 0
    this.tween = null

    this.group = new THREE.Group()
    this.group.position.set(x, 0, z)
    const base = new THREE.Mesh(baseGeo, flat(palette.cream))
    base.position.y = 0.15
    this.dome = new THREE.Mesh(domeGeo, flat(palette.terracotta))
    this.dome.position.y = 0.3
    this.group.add(base, this.dome)
    world.addStatic(this.group)
    world.addUpdatable(this)
  }

  setBodies(bodies) {
    this.bodies = bodies
  }

  trigger() {
    if (this.cooldown > 0) return
    this.cooldown = 0.6
    this.press = 0.16
    this.world.sounds.boop?.()
    resetBodies(this.world, this.bodies)
    this.onReset?.()
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt)
    if (this.press > 0) {
      this.press -= dt
      const t = 1 - Math.max(0, this.press) / 0.16
      this.dome.scale.y = 1 - 0.45 * Math.sin(t * Math.PI)
    } else {
      this.dome.scale.y = 1
    }
    const p = this.world.car.physics.position
    const inside = Math.hypot(p.x - this.x, p.z - this.z) < this.radius
    if (inside && !this.wasInside) this.trigger()
    this.wasInside = inside
  }
}

/**
 * Tween bodies back to `userData.home` (kinematic glide with stagger), then release them asleep.
 */
export function resetBodies(world, bodies, { duration = 0.4, stagger = 0.025 } = {}) {
  const items = bodies.filter((b) => b.userData?.home)
  if (!items.length) return
  const runs = items.map((body, i) => ({
    body,
    start: i * stagger,
    p0: body.position.clone(),
    q0: body.quaternion.clone(),
    p1: body.userData.home.p,
    q1: body.userData.home.q,
    done: false,
  }))
  for (const r of runs) {
    r.body.type = CANNON.Body.KINEMATIC
    r.body.velocity.setZero()
    r.body.angularVelocity.setZero()
    r.body.wakeUp()
  }
  let t = 0
  const tmpQ = new CANNON.Quaternion()
  const updatable = {
    update(dt) {
      t += dt
      let pending = 0
      for (const r of runs) {
        if (r.done) continue
        const local = (t - r.start) / duration
        if (local < 0) { pending++; continue }
        const k = Math.min(1, local)
        const e = easeOutBack(k)
        r.body.position.set(
          r.p0.x + (r.p1.x - r.p0.x) * e,
          r.p0.y + (r.p1.y - r.p0.y) * e,
          r.p0.z + (r.p1.z - r.p0.z) * e,
        )
        r.q0.slerp(r.q1, Math.min(1, k), tmpQ)
        r.body.quaternion.copy(tmpQ)
        if (k >= 1) {
          r.done = true
          r.body.position.copy(r.p1)
          r.body.quaternion.copy(r.q1)
          r.body.type = CANNON.Body.DYNAMIC
          r.body.velocity.setZero()
          r.body.angularVelocity.setZero()
          r.body.updateMassProperties()
          r.body.sleep()
        } else pending++
      }
      if (pending === 0) world.removeUpdatable(updatable)
    },
  }
  world.addUpdatable(updatable)
  world.sounds.resetRun?.()
}
