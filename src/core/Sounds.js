/**
 * All audio is synthesised with the Web Audio API: no files to load.
 * Call unlock() from a user gesture before anything else.
 */
export class Sounds {
  constructor() {
    this.ctx = null
    this.master = null
    this.muted = localStorage.getItem('portfolio-muted') === '1'
    this.engine = null
    this._lastHit = 0
    this._noiseBuffer = null
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.master.connect(this.ctx.destination)
    this._noiseBuffer = this._makeNoise()
    this._startEngine()
  }

  get ready() { return !!this.ctx }

  setMuted(muted) {
    this.muted = muted
    localStorage.setItem('portfolio-muted', muted ? '1' : '0')
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  toggleMute() {
    this.setMuted(!this.muted)
    return this.muted
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 1.5
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  /* ------------------------------ engine ------------------------------ */

  _startEngine() {
    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.value = 0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.Q.value = 2
    const osc1 = ctx.createOscillator()
    osc1.type = 'sawtooth'
    osc1.frequency.value = 55
    const osc2 = ctx.createOscillator()
    osc2.type = 'square'
    osc2.frequency.value = 27.5
    const sub = ctx.createGain()
    sub.gain.value = 0.35
    osc1.connect(filter)
    osc2.connect(sub).connect(filter)
    filter.connect(gain).connect(this.master)
    osc1.start()
    osc2.start()
    this.engine = { osc1, osc2, filter, gain }
  }

  /** speed in m/s (0..~40), throttle 0..1, boost bool */
  updateEngine(speed, throttle, boost) {
    if (!this.engine) return
    const t = this.ctx.currentTime
    const s = Math.min(speed / 32, 1)
    const base = 48 + s * 150 + throttle * 25 + (boost ? 30 : 0)
    this.engine.osc1.frequency.setTargetAtTime(base, t, 0.08)
    this.engine.osc2.frequency.setTargetAtTime(base / 2, t, 0.08)
    this.engine.filter.frequency.setTargetAtTime(300 + s * 900 + throttle * 300, t, 0.1)
    this.engine.gain.gain.setTargetAtTime(0.05 + s * 0.12 + throttle * 0.05, t, 0.1)
  }

  /** Continuous propeller drone: same graph as updateEngine, tuned higher for a buzzier plane. */
  propeller(speed, boost) {
    if (!this.engine) return
    const t = this.ctx.currentTime
    const s = Math.min(speed / 30, 1)
    const base = 90 + s * 170 + (boost ? 20 : 0)
    this.engine.osc1.frequency.setTargetAtTime(base, t, 0.06)
    this.engine.osc2.frequency.setTargetAtTime(base / 2, t, 0.06)
    this.engine.filter.frequency.setTargetAtTime(500 + s * 1200, t, 0.08)
    this.engine.gain.gain.setTargetAtTime(0.05 + s * 0.14, t, 0.08)
  }

  /** Rising sweep as the wheels leave the ground. */
  liftoff() { this.whoosh() }

  /** Low thump as the gear touches down; strength 0..1 from the descent rate. */
  touchdown(strength = 0.5) { this.hit(strength, 90, { noise: true, decay: 0.15 }) }

  /* ------------------------------ one-shots ------------------------------ */

  /**
   * Impact "tock": pitched per material (f0 in Hz), gain from impact strength (0..1).
   * Rate-limited world-wide to ~10/s.
   */
  hit(strength = 1, f0 = 180, { partial = 0, decay = 0.09, noise = false } = {}) {
    if (!this.ctx) return
    const now = performance.now()
    if (now - this._lastHit < 90) return
    this._lastHit = now
    const ctx = this.ctx
    const t = ctx.currentTime
    const v = Math.min(0.5, 0.06 + Math.min(1, strength) * 0.3)

    const tock = (freq, gain, dur) => {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(freq, t)
      o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.07)
      const g = ctx.createGain()
      g.gain.setValueAtTime(gain, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      o.connect(g).connect(this.master)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    tock(f0, v, decay)
    if (partial) tock(f0 * partial, v * 0.5, decay * 1.5)
    if (noise || f0 < 200) {
      const src = ctx.createBufferSource()
      src.buffer = this._noiseBuffer
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = f0 < 200 ? 250 : 3000
      const g = ctx.createGain()
      g.gain.setValueAtTime(v * 0.6, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
      src.connect(lp).connect(g).connect(this.master)
      src.start(t)
      src.stop(t + 0.15)
    }
  }

  /** Short square "boop" for the red buttons. */
  boop() {
    this._tone({ type: 'square', f: 300, dur: 0.08, gain: 0.12 })
  }

  /** Eight rising notes (C major) for a reset run. */
  resetRun() {
    const notes = [261.6, 293.7, 329.6, 349.2, 392, 440, 493.9, 523.3]
    notes.forEach((f, i) => this._tone({ type: 'triangle', f, dur: 0.12, gain: 0.08, at: i * 0.06 }))
  }

  ding() {
    this._tone({ type: 'sine', f: 1320, dur: 0.2, gain: 0.1 })
  }

  arpeggio() {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone({ type: 'triangle', f, dur: 0.3, gain: 0.1, at: i * 0.09 }))
  }

  blip(f = 600) {
    this._tone({ type: 'sine', f, dur: 0.06, gain: 0.08 })
  }

  whoosh() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this._noiseBuffer
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 2
    bp.frequency.setValueAtTime(400, t)
    bp.frequency.exponentialRampToValueAtTime(2000, t + 0.3)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
    src.connect(bp).connect(g).connect(this.master)
    src.start(t)
    src.stop(t + 0.35)
  }

  _tone({ type = 'sine', f = 440, dur = 0.1, gain = 0.1, at = 0 }) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + at
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  horn() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    g.gain.setValueAtTime(0.25, t + 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1400
    for (const f of [370, 466]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.connect(lp)
      o.start(t)
      o.stop(t + 0.45)
    }
    lp.connect(g).connect(this.master)
  }

  jump() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(220, t)
    o.frequency.exponentialRampToValueAtTime(660, t + 0.18)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.18, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.3)
  }

  click() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(880, t)
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.06)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.15)
  }

  reveal() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      const g = ctx.createGain()
      const start = t + i * 0.09
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(0.12, start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
      o.connect(g).connect(this.master)
      o.start(start)
      o.stop(start + 0.55)
    })
  }

  /** Short filtered noise burst for tyre screech under hard braking / drifting. */
  screech(level = 1) {
    if (!this.ctx) return
    const now = performance.now()
    if (now - (this._lastScreech || 0) < 250) return
    this._lastScreech = now
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this._noiseBuffer
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2400
    bp.Q.value = 6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.08 * level, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    src.connect(bp).connect(g).connect(this.master)
    src.start(t)
    src.stop(t + 0.35)
  }
}
