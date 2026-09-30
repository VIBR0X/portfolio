import * as THREE from 'three'

/**
 * Keeps a directional light's shadow frustum centred on the camera focus.
 * The frustum grows with zoom so the visible ground is always covered, and the target is snapped
 * to the shadow texel grid in light space so panning does not make shadow edges shimmer.
 * Pure three.js maths: no renderer needed, so it runs (and is tested) in Node.
 */
export class ShadowFollow {
  constructor(sun, { direction = new THREE.Vector3(1, 2, 1), distance = 90, base = 14, perZoom = 26, ahead = 10 } = {}) {
    this.sun = sun
    this.distance = distance
    this.base = base
    this.perZoom = perZoom
    this.ahead = ahead
    this.half = 0
    this.direction = new THREE.Vector3()
    this.toWorld = new THREE.Quaternion()
    this.toLight = new THREE.Quaternion()
    this._p = new THREE.Vector3()
    this.setDirection(direction)
    this.setExtent(this.extentFor(1))
  }

  /**
   * Point the light along `direction` (a vector from the scene towards the sun). Rebuilds the
   * light-space basis, so anything that changes the time of day goes through here rather than
   * reaching into the quaternions.
   */
  setDirection(direction) {
    this.direction.copy(direction).normalize()
    // Same basis three builds for the shadow camera: looking from the light toward the target, up = +y.
    const m = new THREE.Matrix4().lookAt(this.direction, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0))
    this.toWorld.setFromRotationMatrix(m)
    this.toLight.copy(this.toWorld).invert()
    return this
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
    // Depth range along the light, not height: with the sun 23.6° up, every extra metre of far plane
    // sweeps ~2.3 m of extra ground into the shadow pass. 130 m past the target cost ~50 draw calls at
    // the crossroads for shadows cast by objects far outside the frame; 45 m still clears the 22 m
    // tower and everything else that can throw a shadow into shot.
    cam.far = this.distance + 45
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
    // Centre the frustum on the ground the camera can actually see, not on the car. The camera looks
    // north and down, so the visible ground runs from ~34.6 m north of the focus to ~14.8 m south of
    // it at zoom 1 — its centre is about 10 m north. Aiming at the focus spent nearly half the shadow
    // map on ground below the bottom edge of the frame while the top corners fell outside it, where
    // three's frustum test returns fully lit: measured, the Education tower's shade read 189,97,56 in
    // the top-right corner against 159,73,36 mid-frame, i.e. no shadow at all. Shifting costs nothing;
    // widening the frustum instead would have cost ~40 draw calls of extra shadow-pass geometry.
    this._p.copy(focus)
    this._p.z -= this.ahead * zoom
    this._p.applyQuaternion(this.toLight)
    this._p.x = Math.round(this._p.x / t) * t
    this._p.y = Math.round(this._p.y / t) * t
    this._p.applyQuaternion(this.toWorld)
    this.sun.target.position.copy(this._p)
    this.sun.position.copy(this._p).addScaledVector(this.direction, this.distance)
    this.sun.target.updateMatrixWorld()
    this.sun.updateMatrixWorld()
  }
}
