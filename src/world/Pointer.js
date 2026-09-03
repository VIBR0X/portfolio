import * as THREE from 'three'

/**
 * Click-to-open: every board and pad can be opened with the mouse from any distance, so a
 * visitor who does not want to drive is never blocked. A drag (camera zoom, or a stray swipe)
 * is not a click, so movement past a few pixels cancels it.
 */
export class Pointer {
  constructor(world) {
    this.world = world
    this.camera = world.experience.camera
    this.canvas = world.experience.canvas
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.targets = []
    this.objects = []
    this.enabled = true
    this._down = null
    this._hoverAt = 0
    this._hovering = false

    const canvas = this.canvas
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && e.isPrimary === false) return
      this._down = { x: e.clientX, y: e.clientY, id: e.pointerId }
    })
    canvas.addEventListener('pointerup', (e) => {
      const down = this._down
      this._down = null
      if (!down || down.id !== e.pointerId) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return
      this._click(e)
    })
    canvas.addEventListener('pointercancel', () => { this._down = null })
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return
      const now = performance.now()
      if (now - this._hoverAt < 90) return
      this._hoverAt = now
      this._hover(e)
    })
  }

  /**
   * @param object any Object3D; a hit on it or any descendant fires `action`
   * @param action () => void
   * @param label optional text for the hover tooltip
   */
  add(object, action, label = '') {
    this.targets.push({ object, action, label })
    object.traverse((o) => { if (o.isMesh) this.objects.push(o) })
    return object
  }

  _pick(event) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.objects, false)
    if (!hits.length) return null
    const hit = hits[0].object
    return this.targets.find((t) => {
      let o = hit
      while (o) {
        if (o === t.object) return true
        o = o.parent
      }
      return false
    }) || null
  }

  _click(event) {
    if (!this.enabled || !this.world.started) return
    const target = this._pick(event)
    if (!target) return
    this.world.sounds.click()
    target.action()
  }

  _hover(event) {
    if (!this.enabled || !this.world.started) return
    const target = this._pick(event)
    const hovering = !!target
    if (hovering !== this._hovering) {
      this._hovering = hovering
      this.canvas.style.cursor = hovering ? 'pointer' : ''
    }
  }
}
