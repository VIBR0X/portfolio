import * as THREE from 'three'
import { EventEmitter } from './EventEmitter.js'
import { palette } from '../world/Materials.js'

/**
 * Owns the renderer, scene, camera, lights and the frame loop.
 * Emits 'update' (dt, elapsed) every frame before rendering and 'resize' on viewport change.
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
    this.renderer.shadowMap.enabled = false
    this.renderer.setClearColor(new THREE.Color(palette.haze))

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(palette.haze)
    const low = this.quality === 'low'
    this.scene.fog = new THREE.Fog(palette.haze, low ? 70 : 90, low ? 130 : 170)

    this.camera = new THREE.PerspectiveCamera(40, this.sizes.width / this.sizes.height, 1, 260)
    this.camera.position.set(0, 19, 14)
    this.camera.lookAt(0, 0, 0)
    this.scene.add(this.camera)

    this.setLights()

    this.timer = new THREE.Timer()
    this.elapsed = 0
    this.running = false
    this._frame = this._frame.bind(this)

    window.addEventListener('resize', () => this.resize())
    document.addEventListener('visibilitychange', () => {
      // Timer clamps the next delta after a hidden tab; nothing else needed.
      if (!document.hidden && this.running) this.timer.reset()
    })
  }

  setLights() {
    // Toon materials + two lights; no shadow maps (blob shadows do the grounding).
    this.hemi = new THREE.HemisphereLight(0xfff3dc, 0xd9b27a, 1.1)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xffffff, 0.7)
    this.sun.position.set(1, 2, 1).multiplyScalar(40)
    this.sun.castShadow = false
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
  }

  /** Kept for API compatibility with the loop; lights are static now. */
  setShadowCentre() {}

  resize() {
    this.sizes.width = window.innerWidth
    this.sizes.height = window.innerHeight
    this.isSmall = this.sizes.width < 768
    this.camera.aspect = this.sizes.width / this.sizes.height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.sizes.width, this.sizes.height)
    this.emit('resize', this.sizes)
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
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), 1 / 20)
    this.elapsed += dt
    this.emit('update', dt, this.elapsed)
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this._frame)
  }
}
