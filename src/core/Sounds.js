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

  /* ------------------------------ one-shots ------------------------------ */

  hit(strength = 1) {
    if (!this.ctx) return
    const now = performance.now()
    if (now - this._lastHit < 60) return
    this._lastHit = now
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this._noiseBuffer
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 220 + Math.random() * 240
    bp.Q.value = 0.8
    const g = ctx.createGain()
    const v = Math.min(0.6, 0.12 + strength * 0.12)
    g.gain.setValueAtTime(v, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + Math.min(strength, 4) * 0.04)
    src.connect(bp).connect(g).connect(this.master)
    src.start(t)
    src.stop(t + 0.4)

    // low thump
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(140, t)
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15)
    const og = ctx.createGain()
    og.gain.setValueAtTime(v * 0.9, t)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    osc.connect(og).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.25)
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
