export class EventEmitter {
  constructor() {
    this._listeners = new Map()
  }

  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, new Set())
    this._listeners.get(name).add(fn)
    return () => this.off(name, fn)
  }

  off(name, fn) {
    this._listeners.get(name)?.delete(fn)
  }

  emit(name, ...args) {
    const set = this._listeners.get(name)
    if (!set) return
    for (const fn of [...set]) fn(...args)
  }
}
