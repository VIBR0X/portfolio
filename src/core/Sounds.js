/**
 * All audio is synthesised with the Web Audio API: no files to load.
 * Call unlock() from a user gesture before anything else.
 */
const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, value) => { try { localStorage.setItem(key, value) } catch { /* storage blocked */ } }

export class Sounds {
  constructor() {
    this.ctx = null
    this.master = null
    // Safari with site data blocked throws on any localStorage access, and this runs inside
    // `new Sounds()` during boot, so an unguarded read fails the whole site to the text resume.
    this.muted = read('portfolio-muted') === '1'
    this.engine = null
    this._lastHit = 0
    this._noiseBuffer = null
    this.wind = null
    /** World x the camera is looking at; set per frame by World.update so panning tracks the view. */
    this.listenerX = 0
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
    // 17 blip sites, 8 impact sites, the engine drone and the reveal arpeggio all summed into one
    // 0.8 gain and clipped wherever several fired at once (Bay Row with seven pipelines running).
    this.limiter = this.ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -14
    this.limiter.knee.value = 20
    this.limiter.ratio.value = 6
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.18
    this.master.connect(this.limiter).connect(this.ctx.destination)
    this._noiseBuffer = this._makeNoise()
    this._startEngine()
    this._startWind()
  }

  /**
   * Thin-atmosphere bed: a low pressure layer you stop noticing, and a wind layer that rises with
   * speed and altitude. Two nodes off the noise buffer that already exists. Without it the world is
   * completely silent whenever the car is parked.
   */
  _startWind() {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this._noiseBuffer
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 320
    lp.Q.value = 0.7
    const bed = ctx.createGain()
    bed.gain.value = 0.012

    const src2 = ctx.createBufferSource()
    src2.buffer = this._noiseBuffer
    src2.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900
    bp.Q.value = 0.7
    const gust = ctx.createGain()
    gust.gain.value = 0.004

    src.connect(lp).connect(bed).connect(this.master)
    src2.connect(bp).connect(gust).connect(this.master)
    src.start()
    src2.start()
    this.wind = { bed, gust, bp }
  }

  /** Per frame from World.update: speed in m/s, altitude in m, `near` 0..1 for dust-devil proximity. */
  updateWind(speed = 0, altitude = 0, near = 0) {
    if (!this.wind) return
    const t = this.ctx.currentTime
    const s = Math.min(speed / 34, 1)
    const a = Math.min(altitude / 34, 1)
    this.wind.gust.gain.setTargetAtTime(0.004 + s * 0.018 + a * 0.02 + near * 0.03, t, 0.2)
    this.wind.bp.frequency.setTargetAtTime(760 + s * 420 + near * 300, t, 0.3)
  }

  /**
   * Where a sound sits in the stereo field. The camera never rotates, so world x IS screen x and one
   * panner per one-shot places every impact correctly with no listener maths at all. `x` is the world
   * x of the source and `listenerX` is set once per frame from the camera focus.
   */
  _dest(x) {
    if (x === undefined || !this.ctx.createStereoPanner) return this.master
    const pan = this.ctx.createStereoPanner()
    pan.pan.value = Math.max(-0.8, Math.min(0.8, (x - this.listenerX) / 26))
    pan.connect(this.master)
    return pan
  }

  get ready() { return !!this.ctx }

  /** Let a backgrounded tab go quiet; the render loop already listens for this. */
  setHidden(hidden) {
    if (!this.ctx) return
    if (hidden) this.ctx.suspend()
    else if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  setMuted(muted) {
    this.muted = muted
    write('portfolio-muted', muted ? '1' : '0')
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
    // The floor used to be 0.05, so an unmuted parked buggy droned for as long as the tab was open.
    const idle = speed < 0.5 && throttle < 0.02
    this.engine.gain.gain.setTargetAtTime(idle ? 0.012 : 0.05 + s * 0.12 + throttle * 0.05, t, idle ? 0.5 : 0.1)
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
  hit(strength = 1, f0 = 180, { partial = 0, decay = 0.09, noise = false, x } = {}) {
    if (!this.ctx) return
    const now = performance.now()
    if (now - this._lastHit < 90) return
    this._lastHit = now
    const ctx = this.ctx
    const t = ctx.currentTime
    const v = Math.min(0.5, 0.06 + Math.min(1, strength) * 0.3)
    const dest = this._dest(x)

    const tock = (freq, gain, dur) => {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(freq, t)
      o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.07)
      const g = ctx.createGain()
      g.gain.setValueAtTime(gain, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      o.connect(g).connect(dest)
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
  boop(x) {
    this._tone({ type: 'square', f: 300, dur: 0.08, gain: 0.12, x })
  }

  /** Eight rising notes (C major) for a reset run. */
  resetRun() {
    const notes = [261.6, 293.7, 329.6, 349.2, 392, 440, 493.9, 523.3]
    notes.forEach((f, i) => this._tone({ type: 'triangle', f, dur: 0.12, gain: 0.08, at: i * 0.06 }))
  }

  ding(x) {
    this._tone({ type: 'sine', f: 1320, dur: 0.2, gain: 0.1, x })
  }

  arpeggio() {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone({ type: 'triangle', f, dur: 0.3, gain: 0.1, at: i * 0.09 }))
  }

  blip(f = 600, x) {
    this._tone({ type: 'sine', f, dur: 0.06, gain: 0.08, x })
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

  _tone({ type = 'sine', f = 440, dur = 0.1, gain = 0.1, at = 0, x }) {
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
    o.connect(g).connect(this._dest(x))
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
