import * as THREE from 'three'

/**
 * A crowd of identical dynamic props drawn in ONE InstancedMesh but simulated as separate bodies.
 * Each body drives a hidden proxy Object3D (so it still gets reveal, blob shadows, impact sounds
 * and a home pose for resets); this class copies those transforms into instance matrices.
 */
export class InstancedProps {
  constructor(world, { geometry, material, bodies, tag = 'default', shadowRadius = null, colors = null, offsetY = 0 }) {
    this.world = world
    this.offsetY = offsetY
    this.mesh = new THREE.InstancedMesh(geometry, material, bodies.length)
    this.mesh.frustumCulled = false
    if (colors) {
      const c = new THREE.Color()
      bodies.forEach((_, i) => this.mesh.setColorAt(i, c.set(colors[i % colors.length])))
      this.mesh.instanceColor.needsUpdate = true
    }
    this.bodies = bodies
    this.proxies = bodies.map((body) => {
      const proxy = new THREE.Object3D()
      proxy.position.copy(body.position)
      proxy.quaternion.copy(body.quaternion)
      world.addDynamic(proxy, body, { tag, shadowRadius })
      return proxy
    })
    world.addStatic(this.mesh, { reveal: false })
    world.addUpdatable(this)
    this._m = new THREE.Matrix4()
    this._off = new THREE.Vector3(0, offsetY, 0)
    this._p = new THREE.Vector3()
  }

  /** Count of bodies whose local up axis has tipped past `limit` (i.e. knocked over). */
  countDown(limit = 0.5) {
    let n = 0
    for (const p of this.proxies) {
      this._p.set(0, 1, 0).applyQuaternion(p.quaternion)
      if (this._p.y < limit) n++
    }
    return n
  }

  update() {
    for (let i = 0; i < this.proxies.length; i++) {
      const p = this.proxies[i]
      this._p.copy(this._off).applyQuaternion(p.quaternion).add(p.position)
      this._m.compose(this._p, p.quaternion, p.scale)
      this.mesh.setMatrixAt(i, this._m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
