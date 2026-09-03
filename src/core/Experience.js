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
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(palette.sand)
    this.scene.fog = new THREE.Fog(palette.sand, 70, 160)

    this.camera = new THREE.PerspectiveCamera(32, this.sizes.width / this.sizes.height, 1, 500)
    this.camera.position.set(-12, 24, 18)
    this.camera.lookAt(0, 0, 0)
    this.scene.add(this.camera)

    this.setLights()

    this.clock = new THREE.Clock(false)
    this.elapsed = 0
    this.running = false
    this._frame = this._frame.bind(this)

    window.addEventListener('resize', () => this.resize())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clock.stop()
      else if (this.running) this.clock.start()
    })
  }

  setLights() {
    this.hemi = new THREE.HemisphereLight('#fff4e0', '#e0d4c0', 1.35)
    this.scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight('#fff3dc', 2.1)
    this.sun.position.set(18, 34, 12)
    this.sun.castShadow = true
    const s = this.quality === 'low' ? 1024 : 2048
    this.sun.shadow.mapSize.set(s, s)
    this.sun.shadow.camera.near = 5
    this.sun.shadow.camera.far = 120
    const r = 42
    this.sun.shadow.camera.left = -r
    this.sun.shadow.camera.right = r
    this.sun.shadow.camera.top = r
    this.sun.shadow.camera.bottom = -r
    this.sun.shadow.bias = -0.0008
    this.sun.shadow.normalBias = 0.05
    this.sun.shadow.radius = 4
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.ambient = new THREE.AmbientLight('#ffffff', 0.25)
    this.scene.add(this.ambient)
  }

  /** Keep the shadow frustum centred on a moving point (the car). */
  setShadowCentre(x, z) {
    this.sun.position.set(x + 18, 34, z + 12)
    this.sun.target.position.set(x, 0, z)
    this.sun.target.updateMatrixWorld()
  }

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
    this.clock.start()
    requestAnimationFrame(this._frame)
  }

  stop() {
    this.running = false
    this.clock.stop()
  }

  _frame() {
    if (!this.running) return
    const dt = Math.min(this.clock.getDelta(), 1 / 20)
    this.elapsed += dt
    this.emit('update', dt, this.elapsed)
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this._frame)
  }
}
