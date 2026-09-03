import * as THREE from 'three'

/**
 * A small board whose text is redrawn in place (one canvas, one texture, reused).
 * Used for live counters: "2,300,000 records / day", "SOURCED 4 / 9".
 */
export class Counter {
  constructor({ width = 2.6, height = 0.9, ppu = 128, background = '#FFF8EA', color = '#2B2D42', accent = '#E07A5F', fontSize = 0.26 } = {}) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = Math.round(width * ppu)
    this.canvas.height = Math.round(height * ppu)
    this.ctx = this.canvas.getContext('2d')
    this.ppu = ppu
    this.background = background
    this.color = color
    this.accent = accent
    this.fontSize = fontSize
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.generateMipmaps = false
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.texture.userData = { text: '' }
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    )
    this.value = null
  }

  /** Redraws only when the string actually changes. */
  set(text, { highlight = false } = {}) {
    if (text === this.value) return
    this.value = text
    const { ctx, canvas, ppu } = this
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = this.background
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = highlight ? this.accent : this.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = this.fontSize * ppu
    const font = (s) => `800 ${s}px "Inter", "Segoe UI", Helvetica, Arial, sans-serif`
    ctx.font = font(size)
    while (ctx.measureText(text).width > W * 0.9 && size > 8) {
      size *= 0.92
      ctx.font = font(size)
    }
    ctx.fillText(text, W / 2, H / 2)
    ctx.strokeStyle = this.accent
    ctx.lineWidth = Math.max(2, ppu * 0.04)
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth)
    this.texture.needsUpdate = true
    this.texture.userData.text = text
  }
}
