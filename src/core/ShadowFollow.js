import * as THREE from 'three'

/**
 * Keeps a directional light's shadow frustum centred on the camera focus.
 * The frustum grows with zoom so the visible ground is always covered, and the target is snapped
 * to the shadow texel grid in light space so panning does not make shadow edges shimmer.
 * Pure three.js maths: no renderer needed, so it runs (and is tested) in Node.
 */
export class ShadowFollow {
  constructor(sun, { direction = new THREE.Vector3(1, 2, 1), distance = 90, base = 14, perZoom = 26 } = {}) {
    this.sun = sun
    this.direction = direction.clone().normalize()
    this.distance = distance
    this.base = base
    this.perZoom = perZoom
    this.half = 0
    // Same basis three builds for the shadow camera: looking from the light toward the target, up = +y.
    const m = new THREE.Matrix4().lookAt(this.direction, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0))
    this.toWorld = new THREE.Quaternion().setFromRotationMatrix(m)
    this.toLight = this.toWorld.clone().invert()
    this._p = new THREE.Vector3()
    this.setExtent(this.extentFor(1))
  }

  extentFor(zoom) {
    return this.perZoom * zoom + this.base
  }

  setExtent(half) {
    this.half = half
    const cam = this.sun.shadow.camera
    cam.left = -half
    cam.right = half
    cam.top = half
    cam.bottom = -half
    cam.near = 1
    cam.far = this.distance + 130
    cam.updateProjectionMatrix()
  }

  /**
   * World-space size of one shadow texel across the current frustum.
   * Snapping uses this on the light's x/y axes only: the shadow camera is orthographic, so motion
   * along the light direction shifts depth without changing which texel a fragment lands in.
   */
  get texel() {
    return (2 * this.half) / this.sun.shadow.mapSize.x
  }

  /** Centre the frustum on `focus` for the given camera zoom. Call once per frame. */
  aim(focus, zoom = 1) {
    const half = this.extentFor(zoom)
    if (Math.abs(half - this.half) > 0.5) this.setExtent(half)
    const t = this.texel
    this._p.copy(focus).applyQuaternion(this.toLight)
    this._p.x = Math.round(this._p.x / t) * t
    this._p.y = Math.round(this._p.y / t) * t
    this._p.applyQuaternion(this.toWorld)
    this.sun.target.position.copy(this._p)
    this.sun.position.copy(this._p).addScaledVector(this.direction, this.distance)
    this.sun.target.updateMatrixWorld()
    this.sun.updateMatrixWorld()
  }
}
