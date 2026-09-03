/**
 * Staggered "pop in" reveal after the start screen, in the spirit of bruno-simon.com.
 * Objects are registered hidden (scale 0, invisible; bodies kept out of the physics world),
 * then animate to scale 1 in delay order. Dynamic bodies join the world at their reveal time.
 */
export class Reveal {
  constructor(physics) {
    this.physics = physics
    this.items = []
    this.started = false
    this.time = 0
    this.done = false
    this.stagger = 0.02
    this.duration = 0.45
    this.radius = 70
  }

  register(object, { body = null, delay = 0, mesh = null } = {}) {
    object.visible = false
    object.userData.revealScale = object.scale.clone()
    object.scale.setScalar(0.0001)
    this.items.push({ object, body, delay, mesh: mesh || object, revealed: false, progress: 0 })
  }

  /** Register with an automatic delay based on distance from the origin (spreads the wave outwards). */
  registerByDistance(object, opts = {}) {
    const p = object.position
    const d = Math.hypot(p.x, p.z)
    if (d > this.radius && !opts.body) return null // far statics sit in the fog; show them straight away
    return this.register(object, { ...opts, delay: (opts.delay ?? 0) + d * 0.012 })
  }

  start() {
    this.started = true
    this.time = 0
    this.items.sort((a, b) => a.delay - b.delay)
  }

  /** Immediately show everything (used when the visitor skips the intro, or for a11y). */
  finish() {
    for (const item of this.items) this._complete(item)
    this.started = true
    this.done = true
  }

  _complete(item) {
    if (item.revealed && item.progress >= 1) return
    item.revealed = true
    item.progress = 1
    item.object.visible = true
    item.object.scale.copy(item.object.userData.revealScale)
    if (item.body && !item.bodyAdded) {
      item.bodyAdded = true
      this.physics.add(item.body, item.mesh)
    }
  }

  update(dt) {
    if (!this.started || this.done) return
    this.time += dt
    let pending = 0
    for (const item of this.items) {
      if (item.progress >= 1) continue
      const local = this.time - item.delay
      if (local < 0) { pending++; continue }
      if (!item.revealed) {
        item.revealed = true
        item.object.visible = true
        if (item.body && !item.bodyAdded) {
          item.bodyAdded = true
          this.physics.add(item.body, item.mesh)
        }
      }
      item.progress = Math.min(1, local / this.duration)
      const s = easeOutBack(item.progress)
      const base = item.object.userData.revealScale
      item.object.scale.set(base.x * s, base.y * s, base.z * s)
      if (item.progress >= 1) item.object.scale.copy(base)
      else pending++
    }
    if (pending === 0) this.done = true
  }
}

export function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
