import * as THREE from 'three'

/**
 * Fixed-orientation chase camera: pans to follow a target, never rotates with it
 * (the same dollhouse feel as bruno-simon.com). Mouse wheel / pinch zooms.
 */
export class FollowCamera {
  constructor(experience, { offset = new THREE.Vector3(-11, 24, 17), zoom = 1, minZoom = 0.55, maxZoom = 1.8 } = {}) {
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
      this._tmp.set(velocity.x, 0, velocity.z).multiplyScalar(0.28)
      this.lookAhead.lerp(this._tmp, 1 - Math.exp(-dt * 2.5))
    }
    const k = 1 - Math.exp(-dt * 5)
    this.smoothTarget.lerp(this.target, k)
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-dt * 6))
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5)
    this._apply()
  }

  _apply() {
    const focus = this._tmp.copy(this.smoothTarget).add(this.lookAhead)
    const aspectBoost = this.experience.isSmall ? 1.35 : 1
    this.camera.position.copy(focus).addScaledVector(this.baseOffset, this.zoom * aspectBoost)
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3
    }
    this.camera.lookAt(focus)
  }
}
