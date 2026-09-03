/**
 * Base class for world sections. Subclasses build props in the constructor using the World API
 * and may override update(dt, elapsed), onEnter(), onLeave(), reset().
 */
export class Section {
  constructor(world, def) {
    this.world = world
    this.def = def
    this.id = def.id
    this.disturbed = false
    this.resetHandlers = []
    this.resetBodies = []
  }

  /** Entry for the map / teleport overlay. */
  get map() {
    const { def } = this
    return { id: def.id, label: def.short, hint: def.hint, color: def.color, x: def.spawn[0], z: def.spawn[1], yaw: def.yaw }
  }

  contains(x, z) {
    const [x0, z0, x1, z1] = this.def.aabb
    return x >= x0 && x <= x1 && z >= z0 && z <= z1
  }

  /** Register a body whose home pose should be restored by reset(). */
  track(body) {
    this.resetBodies.push(body)
    return body
  }

  onReset(fn) {
    this.resetHandlers.push(fn)
  }

  /** Called by R inside the section and by the map's "reset" buttons. */
  reset() {
    if (this.resetBodies.length) this.world.resetBodies(this.resetBodies)
    for (const fn of this.resetHandlers) fn()
    this.disturbed = false
  }

  update() {}
  onEnter() {}
  onLeave() {}
}
