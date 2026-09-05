import * as THREE from 'three'
import { flat, palette } from './Materials.js'

const GEO = new THREE.IcosahedronGeometry(0.09, 0)

/**
 * Shared instanced burst pool: dust, prop-wash, smoke, tumbleweed pops. Slots fade by shrinking
 * to zero scale (InstancedMesh has no per-instance opacity without a custom shader), so a dead
 * slot costs a matrix write but no visible triangles. Always `max` instances; unused slots are
 * simply invisible rather than trimmed via `mesh.count`.
 */
export class Particles {
  constructor(world, { max = world.experience.quality === 'low' ? 60 : 120 } = {}) {
    this.world = world
    this.max = max
    this.mesh = new THREE.InstancedMesh(GEO, flat('#ffffff', { vertexColors: true, roughness: 1 }), max)
    this.mesh.frustumCulled = false
    this._slots = Array.from({ length: max }, () => ({
      active: false, age: 0, life: 0, size: 0.1,
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), gravity: -9, color: palette.dust,
    }))
    this._cursor = 0
    this._settled = false
    this._m = new THREE.Matrix4()
    this._s = new THREE.Vector3()
    this._q = new THREE.Quaternion()
    this._c = new THREE.Color()
    world.addStatic(this.mesh, { reveal: false, cast: false })
  }

  emit(position, { count = 8, color = palette.dust, size = 0.12, life = 0.5, spread = 0.6,
                    velocity = new THREE.Vector3(0, 1.5, 0), gravity = -9 } = {}) {
    for (let i = 0; i < count; i++) {
      const slot = this._slots[this._cursor]
      this._cursor = (this._cursor + 1) % this.max
      slot.active = true
      slot.age = 0
      slot.life = life
      slot.size = size
      slot.position.copy(position)
      slot.position.x += (Math.random() - 0.5) * spread
      slot.position.z += (Math.random() - 0.5) * spread
      slot.velocity.copy(velocity)
      slot.velocity.x += (Math.random() - 0.5) * spread
      slot.velocity.z += (Math.random() - 0.5) * spread
      slot.gravity = gravity
      slot.color = color
    }
  }

  update(dt) {
    // Nothing alive and nothing died last frame: the instance buffers already hold zero-scale
    // matrices, so skip the whole rewrite and its GPU upload rather than paying for it every
    // frame of a scene where no dust is flying.
    let anyActive = false
    for (let i = 0; i < this.max; i++) { if (this._slots[i].active) { anyActive = true; break } }
    if (!anyActive && this._settled) return
    this._settled = !anyActive

    for (let i = 0; i < this.max; i++) {
      const slot = this._slots[i]
      if (slot.active) {
        slot.age += dt
        if (slot.age >= slot.life) {
          slot.active = false
        } else {
          slot.position.addScaledVector(slot.velocity, dt)
          slot.velocity.y += slot.gravity * dt
        }
      }
      if (slot.active) {
        const k = 1 - (slot.age / slot.life) ** 2
        this._s.setScalar(Math.max(0, slot.size * k))
        this._m.compose(slot.position, this._q, this._s)
        this._c.set(slot.color)
      } else {
        this._s.setScalar(0)
        this._m.compose(slot.position, this._q, this._s)
        this._c.set('#000000')
      }
      this.mesh.setMatrixAt(i, this._m)
      this.mesh.setColorAt(i, this._c)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}
