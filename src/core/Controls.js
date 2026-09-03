import { EventEmitter } from './EventEmitter.js'

/**
 * Unified input: keyboard + touch joystick/buttons.
 * Continuous state: throttle (-1..1), steer (-1..1, +1 = left), boost, brake.
 * One-shot events: 'jump', 'interact', 'horn', 'map', 'mute', 'respawn', 'help', 'escape'.
 */
export class Controls extends EventEmitter {
  constructor({ isTouch }) {
    super()
    this.isTouch = isTouch
    this.keys = new Set()
    this.throttle = 0
    this.steer = 0
    this.boost = false
    this.brake = false
    this.enabled = true
    this.joystick = { active: false, x: 0, y: 0 }
    this.touchBoost = false

    window.addEventListener('keydown', (e) => this._onKey(e, true))
    window.addEventListener('keyup', (e) => this._onKey(e, false))
    window.addEventListener('blur', () => this.keys.clear())

    if (isTouch) this._buildTouchUI()
  }

  _onKey(e, down) {
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const code = e.code
    const driving = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyB']
    if (driving.includes(code)) e.preventDefault()
    if (down) {
      if (e.repeat) return
      this.keys.add(code)
      if (!this.enabled) {
        if (code === 'Escape') this.emit('escape')
        return
      }
      switch (code) {
        case 'Space': this.emit('jump'); break
        case 'Enter': case 'KeyE': this.emit('interact'); break
        case 'KeyH': this.emit('horn'); break
        case 'KeyM': this.emit('map'); break
        case 'KeyL': this.emit('mute'); break
        case 'KeyR': this.emit('respawn'); break
        case 'Escape': this.emit('escape'); break
        case 'Slash': case 'KeyC': this.emit('help'); break
        default: break
      }
    } else {
      this.keys.delete(code)
    }
  }

  update() {
    const k = this.keys
    let throttle = 0
    let steer = 0
    if (k.has('ArrowUp') || k.has('KeyW')) throttle += 1
    if (k.has('ArrowDown') || k.has('KeyS')) throttle -= 1
    if (k.has('ArrowLeft') || k.has('KeyA')) steer += 1
    if (k.has('ArrowRight') || k.has('KeyD')) steer -= 1
    this.boost = k.has('ShiftLeft') || k.has('ShiftRight') || this.touchBoost
    this.brake = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyB')

    if (this.joystick.active) {
      throttle = -this.joystick.y
      steer = -this.joystick.x
    }
    if (!this.enabled) { throttle = 0; steer = 0; this.boost = false }
    this.throttle = Math.max(-1, Math.min(1, throttle))
    this.steer = Math.max(-1, Math.min(1, steer))
  }

  /* ------------------------- touch UI ------------------------- */

  _buildTouchUI() {
    const root = document.createElement('div')
    root.className = 'touch-controls'
    root.innerHTML = `
      <div class="joystick" aria-label="Drive joystick"><div class="joystick-knob"></div></div>
      <div class="touch-buttons">
        <button type="button" class="touch-btn touch-boost" aria-label="Boost">BOOST</button>
        <button type="button" class="touch-btn touch-jump" aria-label="Jump">JUMP</button>
        <button type="button" class="touch-btn touch-horn" aria-label="Horn">HORN</button>
      </div>`
    document.body.appendChild(root)
    this.touchRoot = root

    const zone = root.querySelector('.joystick')
    const knob = root.querySelector('.joystick-knob')
    let pointerId = null
    let origin = { x: 0, y: 0 }
    const radius = 46

    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)` }

    zone.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return
      pointerId = e.pointerId
      zone.setPointerCapture(pointerId)
      const r = zone.getBoundingClientRect()
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      this.joystick.active = true
      this._moveJoystick(e, origin, radius, setKnob)
      zone.classList.add('active')
    })
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return
      this._moveJoystick(e, origin, radius, setKnob)
    })
    const release = (e) => {
      if (e.pointerId !== pointerId) return
      pointerId = null
      this.joystick.active = false
      this.joystick.x = 0
      this.joystick.y = 0
      setKnob(0, 0)
      zone.classList.remove('active')
    }
    zone.addEventListener('pointerup', release)
    zone.addEventListener('pointercancel', release)

    const boost = root.querySelector('.touch-boost')
    boost.addEventListener('pointerdown', (e) => { e.preventDefault(); this.touchBoost = true; boost.classList.add('active') })
    const boostOff = () => { this.touchBoost = false; boost.classList.remove('active') }
    boost.addEventListener('pointerup', boostOff)
    boost.addEventListener('pointercancel', boostOff)
    boost.addEventListener('pointerleave', boostOff)

    root.querySelector('.touch-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.enabled) this.emit('jump') })
    root.querySelector('.touch-horn').addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.enabled) this.emit('horn') })
  }

  _moveJoystick(e, origin, radius, setKnob) {
    let dx = e.clientX - origin.x
    let dy = e.clientY - origin.y
    const len = Math.hypot(dx, dy)
    if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius }
    setKnob(dx, dy)
    const dead = 0.12
    const nx = dx / radius
    const ny = dy / radius
    this.joystick.x = Math.abs(nx) < dead ? 0 : nx
    this.joystick.y = Math.abs(ny) < dead ? 0 : ny
  }

  setTouchVisible(visible) {
    if (this.touchRoot) this.touchRoot.classList.toggle('hidden', !visible)
  }
}
