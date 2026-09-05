import * as THREE from 'three'
import { palette, flat } from './Materials.js'

const GEO = new THREE.PlaneGeometry(0.28, 0.9)
GEO.rotateX(-Math.PI / 2)

/** Instanced ring buffer of fading rover tracks (dark regolith), one draw call. */
export class SkidMarks {
  constructor(world, { max = world.experience.quality === 'low' ? 40 : 80 } = {}) {
    this.world = world
    this.max = max
    this.mesh = new THREE.InstancedMesh(GEO, flat(palette.regolithDark, { transparent: true, opacity: 0.5 }), max)
    this.mesh.frustumCulled = false
    this._slots = Array.from({ length: max }, () => ({ active: false, age: 0, position: new THREE.Vector3(), yaw: 0 }))
    this._cursor = 0
    this._settled = false
    this._pos = new THREE.Vector3()
    this._q = new THREE.Quaternion()
    this._s = new THREE.Vector3(1, 1, 1)
    this._m = new THREE.Matrix4()
    this._lifetime = 6
    this._fadeStart = 5
    world.addStatic(this.mesh, { reveal: false, cast: false })
  }

  mark(position, yaw) {
    const slot = this._slots[this._cursor]
    this._cursor = (this._cursor + 1) % this.max
    slot.active = true
    slot.age = 0
    slot.position.copy(position)
    slot.yaw = yaw
  }

  update(dt) {
    // Same as the particle pool: with no marks on the ground there is nothing to rewrite, so
    // skip the per-frame buffer upload entirely.
    let anyActive = false
    for (let i = 0; i < this.max; i++) { if (this._slots[i].active) { anyActive = true; break } }
    if (!anyActive && this._settled) return
    this._settled = !anyActive

    for (let i = 0; i < this.max; i++) {
      const slot = this._slots[i]
      if (slot.active) {
        slot.age += dt
        if (slot.age >= this._lifetime) slot.active = false
      }
      if (slot.active) {
        const fade = slot.age < this._fadeStart ? 1 : 1 - (slot.age - this._fadeStart) / (this._lifetime - this._fadeStart)
        this._pos.set(slot.position.x, 0.015, slot.position.z)
        this._q.setFromEuler(new THREE.Euler(0, slot.yaw, 0))
        this._s.setScalar(Math.max(0, fade))
        this._m.compose(this._pos, this._q, this._s)
      } else {
        this._m.compose(this._pos.set(0, -10, 0), this._q, this._s.setScalar(0))
      }
      this.mesh.setMatrixAt(i, this._m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
