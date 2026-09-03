import * as THREE from 'three'

/**
 * Fixed-orientation chase camera: pans to follow a target, never rotates with it
 * (the same dollhouse feel as bruno-simon.com). Mouse wheel / pinch zooms.
 */
export class FollowCamera {
  constructor(experience, { offset = new THREE.Vector3(0, 16, 17), zoom = 1, minZoom = 0.55, maxZoom = 1.9 } = {}) {
    this.experience = experience
    this.camera = experience.camera
    this.baseOffset = offset.clone()
    this.zoom = zoom
    this.targetZoom = zoom
    this.minZoom = minZoom
    this.maxZoom = maxZoom
    this.target = new THREE.Vector3()
    this.smoothTarget = new THREE.Vector3()
    this.lookAhead = new THREE.Vector3()
    this.shake = 0
    this.boosting = false
    this.nudge = new THREE.Vector3()
    this.swoop = 0 // seconds remaining of the start swoop
    this.enabled = true
    this._tmp = new THREE.Vector3()
    this._pinch = null

    const canvas = experience.canvas
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom * (1 + Math.sign(e.deltaY) * 0.08), this.minZoom, this.maxZoom)
    }, { passive: false })

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) this._pinch = { d: this._touchDist(e), zoom: this.targetZoom }
    }, { passive: true })
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this._pinch) {
        const d = this._touchDist(e)
        this.targetZoom = THREE.MathUtils.clamp(this._pinch.zoom * (this._pinch.d / d), this.minZoom, this.maxZoom)
      }
    }, { passive: true })
    canvas.addEventListener('touchend', () => { this._pinch = null })
  }

  _touchDist(e) {
    const a = e.touches[0]
    const b = e.touches[1]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1
  }

  /** Jump straight to a target without easing (used on spawn/teleport). */
  snap(position) {
    this.target.copy(position)
    this.smoothTarget.copy(position)
    this.lookAhead.set(0, 0, 0)
    this.zoom = this.targetZoom
    this._apply()
  }

  update(dt, targetPosition, velocity) {
    if (!this.enabled) return
    this.target.copy(targetPosition)
    if (velocity) {
      this._tmp.set(velocity.x, 0, velocity.z).multiplyScalar(0.35)
      this.lookAhead.lerp(this._tmp, 1 - Math.exp(-dt * 3))
    }
    const k = 1 - Math.exp(-dt * 6)
    this.smoothTarget.lerp(this.target, k)
    this.smoothTarget.y = 0.6
    const zoomTarget = this.targetZoom + (this.boosting ? 0.15 : 0)
    this.zoom += (zoomTarget - this.zoom) * (1 - Math.exp(-dt * 6))
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5)
    this._apply(dt)
  }

  /** Start the 1.6 s swoop from high above down to the follow position. */
  startSwoop(duration = 1.6) {
    this.swoop = duration
    this.swoopDuration = duration
  }

  _apply(dt = 0) {
    const focus = this._tmp.copy(this.smoothTarget).add(this.lookAhead)
    const aspectBoost = this.experience.isSmall ? 1.35 : 1
    this.camera.position.copy(focus).addScaledVector(this.baseOffset, this.zoom * aspectBoost).add(this.nudge)
    if (this.swoop > 0) {
      this.swoop = Math.max(0, this.swoop - dt)
      const t = 1 - this.swoop / this.swoopDuration
      const e = 1 - Math.pow(1 - t, 3)
      const high = new THREE.Vector3(focus.x, 60, focus.z + 40)
      this.camera.position.lerpVectors(high, this.camera.position, e)
    }
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3
    }
    this.camera.lookAt(focus)
  }
}
