import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { EventEmitter } from './EventEmitter.js'
import { ShadowFollow } from './ShadowFollow.js'
import { palette, ENV_INTENSITY } from '../world/Materials.js'
import { skyGradient, environmentScene } from '../world/Textures.js'

/**
 * Light budget. three divides light intensities by π in the shader, so a white surface facing the sun
 * receives ≈ sun·0.82/π + hemi/π + env. Tuned so lit sand ≈ its own albedo (no clipping, no tone
 * mapping) and shadowed sand ≈ 60–70 % of that. Tuning knobs live here and in Materials.ENV_INTENSITY.
 */
export const LIGHTING = { sun: 1.2, hemi: 1.0, sunColor: '#FFF4E0', skyColor: '#FFF3DC', groundColor: '#D9B27A', direction: [1, 2, 1] }
export const SHADOW = { high: { size: 2048 }, low: { size: 1024 }, bias: -0.0004, normalBias: 0.03 }
export const AO = { radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1.5, samples: 16, blendIntensity: 0.9 }
/** Auto-quality: an average frame above `effectsMs` drops AO; above `lowMs` on the re-sample drops resolution. */
export const QUALITY = { delay: 2.5, window: 3, effectsMs: 18, lowMs: 22 }

/**
 * Owns the renderer, scene, camera, lights, environment, post-processing and the frame loop.
 * Emits 'update' (dt, elapsed) before rendering, 'rendered' after, 'resize' on viewport change,
 * 'effects' (bool) when the AO pass is toggled and 'quality' ('low') when resolution drops.
 */
export class Experience extends EventEmitter {
  constructor({ canvas }) {
    super()
    this.canvas = canvas
    this.isTouch = window.matchMedia('(pointer: coarse)').matches
    this.isSmall = window.innerWidth < 768
    this.quality = this.isTouch || this.isSmall ? 'low' : 'high'
    this.sizes = { width: window.innerWidth, height: window.innerHeight, pixelRatio: Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1.5 : 2) }

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false })
    this.renderer.setPixelRatio(this.sizes.pixelRatio)
    this.renderer.setSize(this.sizes.width, this.sizes.height)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.shadowMap.enabled = true
    // PCFSoftShadowMap is deprecated in three 0.185 and silently downgrades to this; VSMShadowMap is
    // unsuitable because it forces every shadow receiver to also cast (see constants.js).
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.setClearColor(new THREE.Color(palette.haze))
    // Each composer pass would otherwise reset the counters, leaving only the last fullscreen quad.
    this.renderer.info.autoReset = false

    this.scene = new THREE.Scene()
    this.scene.background = skyGradient()
    const low = this.quality === 'low'
    this.scene.fog = new THREE.Fog(palette.haze, low ? 70 : 90, low ? 130 : 170)

    this.camera = new THREE.PerspectiveCamera(40, this.sizes.width / this.sizes.height, 1, 260)
    this.camera.position.set(0, 26, 28)
    this.camera.lookAt(0, 0, 0)
    this.scene.add(this.camera)

    this.setLights()
    this.setEnvironment()
    this.effects = false
    this.composer = null
    this.ao = null
    this.setComposer()

    this.timer = new THREE.Timer()
    this.elapsed = 0
    this.running = false
    this.lowQuality = false
    this._sample = null
    this._frame = this._frame.bind(this)

    window.addEventListener('resize', () => this.resize())
    document.addEventListener('visibilitychange', () => {
      // Timer clamps the next delta after a hidden tab; nothing else needed.
      if (!document.hidden && this.running) this.timer.reset()
    })
  }

  setLights() {
    this.hemi = new THREE.HemisphereLight(LIGHTING.skyColor, LIGHTING.groundColor, LIGHTING.hemi)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(LIGHTING.sunColor, LIGHTING.sun)
    this.sun.castShadow = true
    const s = SHADOW[this.quality]
    this.sun.shadow.mapSize.set(s.size, s.size)
    this.sun.shadow.bias = SHADOW.bias
    this.sun.shadow.normalBias = SHADOW.normalBias
    this.scene.add(this.sun, this.sun.target)
    this.shadowFollow = new ShadowFollow(this.sun, { direction: new THREE.Vector3(...LIGHTING.direction) })
    this.shadowFollow.aim(new THREE.Vector3(0, 0, 0), 1)
  }

  /** Soft sky/ground light from a generated dome, prefiltered once; the source scene is thrown away. */
  setEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const env = environmentScene({ sunDir: new THREE.Vector3(...LIGHTING.direction).normalize() })
    this.scene.environment = pmrem.fromScene(env, 0.04).texture
    // A standard material's own envMapIntensity is ignored while scene.environment is set and the
    // material has no envMap of its own (WebGLRenderer overwrites the uniform), so the scene-level
    // value is the one that actually drives environment lighting. Keep both from one constant.
    this.scene.environmentIntensity = ENV_INTENSITY
    pmrem.dispose()
    env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose() })
  }

  /** Multisampled composer: render → half-resolution GTAO → output (sRGB). Effects start on for every tier. */
  setComposer() {
    const { width, height, pixelRatio } = this.sizes
    const target = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(width, height)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    const ao = new GTAOPass(this.scene, this.camera, Math.ceil((width * pixelRatio) / 2), Math.ceil((height * pixelRatio) / 2))
    const setSize = ao.setSize.bind(ao)
    ao.setSize = (w, h) => setSize(Math.ceil(w / 2), Math.ceil(h / 2)) // AO buffers at half resolution, blended at full
    const render = ao.render.bind(ao)
    ao.render = (...args) => {
      // The AO pass re-renders the scene for normals and depth; keep the sky out of that buffer.
      const bg = this.scene.background
      this.scene.background = null
      render(...args)
      this.scene.background = bg
    }
    ao.updateGtaoMaterial({ radius: AO.radius, distanceExponent: AO.distanceExponent, thickness: AO.thickness, scale: AO.scale, samples: AO.samples })
    ao.blendIntensity = AO.blendIntensity
    this.composer.addPass(ao)
    this.composer.addPass(new OutputPass())
    this.ao = ao
    this.effects = true
  }

  /** Toggle the post-processing chain (AO). Off = plain renderer.render, as before this pass existed. */
  setEffects(on) {
    if (this.effects === on) return
    this.effects = on
    this.emit('effects', on)
  }

  resize() {
    this.sizes.width = window.innerWidth
    this.sizes.height = window.innerHeight
    this.isSmall = this.sizes.width < 768
    this.camera.aspect = this.sizes.width / this.sizes.height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.sizes.width, this.sizes.height)
    this.composer?.setSize(this.sizes.width, this.sizes.height)
    this.emit('resize', this.sizes)
  }

  /**
   * Auto-quality: after `delay` s, average frame time over `window` s.
   * Step 1: above `effectsMs` with AO on → AO off, sample again. Step 2: above `lowMs` → pixel ratio 1,
   * 1024 shadow map, nearer fog. Never re-raised (spec §11).
   */
  sampleQuality({ delay = QUALITY.delay, window = QUALITY.window, effectsMs = QUALITY.effectsMs, lowMs = QUALITY.lowMs } = {}) {
    this._sample = { delay, window, effectsMs, lowMs, t: 0, frames: 0, acc: 0, step: 0 }
  }

  setLowQuality() {
    if (this.lowQuality) return
    this.lowQuality = true
    this.sizes.pixelRatio = 1
    this.renderer.setPixelRatio(1)
    this.composer?.setPixelRatio(1)
    this.composer?.setSize(this.sizes.width, this.sizes.height)
    if (this.sun.shadow.mapSize.x > 1024) {
      this.sun.shadow.mapSize.set(1024, 1024)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
    this.scene.fog.near = 60
    this.scene.fog.far = 110
    this.emit('quality', 'low')
  }

  /** RGB bytes of the last frame at CSS pixel (x, y) from the top-left. Call from a 'rendered' listener. */
  readPixel(x, y) {
    const gl = this.renderer.getContext()
    const pr = this.renderer.getPixelRatio()
    const out = new Uint8Array(4)
    gl.readPixels(Math.round(x * pr), Math.round((this.sizes.height - y) * pr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
    return [out[0], out[1], out[2]]
  }

  start() {
    if (this.running) return
    this.running = true
    this.timer.reset()
    requestAnimationFrame(this._frame)
  }

  stop() {
    this.running = false
  }

  _frame() {
    if (!this.running) return
    this.renderer.info.reset()
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), 1 / 20)
    this.elapsed += dt
    this.emit('update', dt, this.elapsed)
    if (this.effects && this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
    this.emit('rendered')
    if (this._sample) {
      const q = this._sample
      q.t += dt
      if (q.t > q.delay) {
        q.frames++
        q.acc += dt
        if (q.acc >= q.window) {
          const avgMs = (q.acc / q.frames) * 1000
          if (q.step === 0 && avgMs > q.effectsMs && this.effects) {
            this.setEffects(false)
            q.step = 1
            q.frames = 0
            q.acc = 0
          } else {
            if (avgMs > q.lowMs) this.setLowQuality()
            this._sample = null
          }
        }
      }
    }
    requestAnimationFrame(this._frame)
  }
}
