import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, palette } from '../Materials.js'

// In the gap between the boundary wall and the hill ring (the hills sit 8-18 m further out and
// reach about 7.5 m), with a hub well above the hill line so the rotors read against the sky.
// Closer in, the camera's downward tilt clipped the blades; further out, the hills hid them.
const OUT = 20
const HUB_HEIGHT = 13

/** Four along the north edge and four along the west edge, out past the wall. Pure and testable. */
export function turbinePositions(extents) {
  const positions = []
  for (let i = 0; i < 4; i++) {
    positions.push({ x: extents.x0 + ((i + 0.5) / 4) * (extents.x1 - extents.x0), z: extents.z0 - OUT })
  }
  for (let i = 0; i < 4; i++) {
    positions.push({ x: extents.x0 - OUT, z: extents.z0 + ((i + 0.5) / 4) * (extents.z1 - extents.z0) })
  }
  return positions
}

/** Wind turbines turning slowly on the hill ring, visible over the fog. */
export class Turbines {
  constructor(world) {
    this.world = world
    const positions = turbinePositions(world.extents)
    this.positions = positions

    const towerParts = []
    for (const p of positions) {
      const tower = new THREE.CylinderGeometry(0.3, 0.6, HUB_HEIGHT, 8)
      tower.translate(p.x, HUB_HEIGHT / 2, p.z)
      towerParts.push(tower)
      const nacelle = new THREE.BoxGeometry(0.9, 0.7, 2)
      nacelle.translate(p.x, HUB_HEIGHT, p.z)
      towerParts.push(nacelle)
    }
    world.addStatic(new THREE.Mesh(mergeGeometries(towerParts), flat(palette.cream)), { reveal: false })

    const blade = new THREE.BoxGeometry(0.2, 4.2, 0.45)
    blade.translate(0, 2.2, 0)
    this.blades = new THREE.InstancedMesh(blade, flat(palette.cream), positions.length * 3)
    this.blades.frustumCulled = false
    world.addStatic(this.blades, { reveal: false })

    this.angles = positions.map((_, i) => i * 0.4)
    this.speeds = positions.map((_, i) => 0.6 + (i % 3) * 0.15)
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3(1, 1, 1)
  }

  update(dt) {
    let idx = 0
    for (let t = 0; t < this.positions.length; t++) {
      const p = this.positions[t]
      this.angles[t] += this.speeds[t] * dt
      for (let b = 0; b < 3; b++) {
        this._e.set(0, 0, this.angles[t] + (b / 3) * Math.PI * 2)
        this._q.setFromEuler(this._e)
        this._m.compose(this._p.set(p.x, HUB_HEIGHT, p.z), this._q, this._s)
        this.blades.setMatrixAt(idx, this._m)
        idx++
      }
    }
    this.blades.instanceMatrix.needsUpdate = true
  }
}
