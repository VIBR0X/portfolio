import * as THREE from 'three'
import { palette } from './Materials.js'

/**
 * Blob shadows: one InstancedMesh of soft radial discs that follow registered objects.
 * Cheap replacement for shadow maps; fades as the object rises.
 */
export class BlobShadows {
  constructor(scene, { max = 200 } = {}) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64)
    g.addColorStop(0, 'rgba(107,78,46,0.34)')
    g.addColorStop(0.55, 'rgba(107,78,46,0.18)')
    g.addColorStop(1, 'rgba(107,78,46,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false, color: palette.shadow })
    const geo = new THREE.CircleGeometry(1, 16)
    geo.rotateX(-Math.PI / 2)
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

  /** target: any object with .position (THREE or CANNON). */
  add(target, { rx = 1, rz = rx, baseY = 0 } = {}) {
    if (this.items.length >= this.max) return null
    const item = { target, rx, rz, baseY, enabled: true }
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
      const k = Math.max(0.15, 1 - Math.min(h, 4) / 4)
      this._p.set(p.x, 0.045, p.z)
      this._s.set(item.rx * (0.6 + 0.4 * k), 1, item.rz * (0.6 + 0.4 * k))
      this._m.compose(this._p, this._q, this._s)
      this.mesh.setMatrixAt(n, this._m)
      n++
      if (n >= this.max) break
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
