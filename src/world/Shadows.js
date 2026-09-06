import * as THREE from 'three'
import { palette } from './Materials.js'

/**
 * Cheap contact shadow under moving bodies; the real shadow map does the rest. Fades as the object
 * rises: the generic disc shrinks to 0.66 of its size over the first 4 m (jumps, ramps). An item
 * registered with `altitudeCue` (the plane) is read across tens of metres instead, so it spreads
 * and lightens the way a real penumbra does: scale `1 + h/60` and opacity `clamp(1 − h/80, 0.5, 1)`.
 * The opacity is a per-instance `aAlpha` attribute folded into `diffuseColor.a` by a small
 * `onBeforeCompile` patch — `InstancedMesh` has no per-instance opacity of its own.
 *
 * The fade is half the rate spec §4 feel #2 asks for and floors at 0.5 rather than 0.25 because
 * the desktop `strength` was later halved to 0.16: measured against the regolith, `0.25 · 0.16`
 * peaks at 4/255 under the disc at the 34 m ceiling — below the grain — while `0.5 · 0.16` keeps
 * the 9/255 the ground-level disc has, now spread over three times the area.
 */
export class BlobShadows {
  constructor(scene, { max = 200, strength = 0.34 } = {}) {
    this.strength = strength
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64)
    g.addColorStop(0, `rgba(90,44,24,${strength})`)
    g.addColorStop(0.55, `rgba(90,44,24,${+(strength * 0.53).toFixed(3)})`)
    g.addColorStop(1, 'rgba(90,44,24,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false, color: palette.shadow })
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute float aAlpha;\nvarying float vAlpha;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAlpha = aAlpha;')
      shader.fragmentShader = `varying float vAlpha;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vAlpha;')
    }
    const geo = new THREE.CircleGeometry(1, 16)
    geo.rotateX(-Math.PI / 2)
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(1), 1)
    this.alpha.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aAlpha', this.alpha)
    this.mesh = new THREE.InstancedMesh(geo, mat, max)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    scene.add(this.mesh)
    this.items = []
    this.max = max
    this._m = new THREE.Matrix4()
    this._p = new THREE.Vector3()
    this._q = new THREE.Quaternion()
    this._s = new THREE.Vector3()
  }

  /** target: any object with .position (THREE or CANNON). `altitudeCue` selects the long-range fade. */
  add(target, { rx = 1, rz = rx, baseY = 0, altitudeCue = false } = {}) {
    if (this.items.length >= this.max) return null
    const item = { target, rx, rz, baseY, altitudeCue, enabled: true }
    this.items.push(item)
    return item
  }

  remove(item) {
    const i = this.items.indexOf(item)
    if (i >= 0) this.items.splice(i, 1)
  }

  update(cameraFocus = null) {
    let n = 0
    for (const item of this.items) {
      if (!item.enabled) continue
      const p = item.target.position
      if (cameraFocus && (Math.abs(p.x - cameraFocus.x) > 70 || Math.abs(p.z - cameraFocus.z) > 70)) continue
      const h = Math.max(0, p.y - item.baseY)
      let s
      let a = 1
      if (item.altitudeCue) {
        s = 1 + h / 60
        a = Math.max(0.5, Math.min(1, 1 - h / 80))
      } else {
        const k = Math.max(0.15, 1 - Math.min(h, 4) / 4)
        s = 0.6 + 0.4 * k
      }
      this._p.set(p.x, 0.045, p.z)
      this._s.set(item.rx * s, 1, item.rz * s)
      this._m.compose(this._p, this._q, this._s)
      this.mesh.setMatrixAt(n, this._m)
      this.alpha.array[n] = a
      n++
      if (n >= this.max) break
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    this.alpha.needsUpdate = true
  }
}
