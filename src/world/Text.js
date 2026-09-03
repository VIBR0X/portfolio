import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { flat } from './Materials.js'

let fontPromise = null
let font = null

export function loadFont(url = '/fonts/helvetiker_bold.typeface.json') {
  if (!fontPromise) {
    fontPromise = new Promise((resolve, reject) => {
      new FontLoader().load(url, (f) => { font = f; resolve(f) }, undefined, reject)
    })
  }
  return fontPromise
}

/** Inject an already-parsed Font (used by the Node smoke harness). */
export function setFont(f) {
  font = f
  fontPromise = Promise.resolve(f)
}

export function getFont() {
  if (!font) throw new Error('Font not loaded; call loadFont() first')
  return font
}

/**
 * Extruded 3D text, centred on its bounding box in X and Z, resting on y = 0.
 * Returns { geometry, width, height, depth }.
 */
export function textGeometry(text, { size = 1, depth = 0.4, bevel = true, curveSegments = 4 } = {}) {
  const geometry = new TextGeometry(text, {
    font: getFont(),
    size,
    depth,
    curveSegments,
    bevelEnabled: bevel,
    bevelThickness: depth * 0.12,
    bevelSize: size * 0.03,
    bevelSegments: 2,
  })
  geometry.computeBoundingBox()
  const bb = geometry.boundingBox
  const width = bb.max.x - bb.min.x
  const height = bb.max.y - bb.min.y
  const d = bb.max.z - bb.min.z
  geometry.translate(-bb.min.x - width / 2, -bb.min.y, -bb.min.z - d / 2)
  return { geometry, width, height, depth: d }
}

export function textMesh(text, { color = '#2b2a33', ...opts } = {}) {
  const { geometry, width, height, depth } = textGeometry(text, opts)
  const mesh = new THREE.Mesh(geometry, flat(color))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.size = { width, height, depth }
  return mesh
}

/* ---------------------------------------------------------------------- */
/* Canvas boards: crisp 2D text rendered to a texture on a plane.          */
/* ---------------------------------------------------------------------- */

const FONT_STACK = '"Inter", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif'

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Builds a CanvasTexture containing a title, optional subtitle and body lines.
 * `width`/`height` are in world units; the canvas resolution is derived from `ppu` (pixels per unit).
 */
export function makeBoardTexture({
  title = '',
  subtitle = '',
  body = [],
  footer = '',
  width = 6,
  height = 3.5,
  ppu = 96,
  background = '#fbfaf7',
  titleColor = '#2b2a33',
  textColor = '#4a4856',
  accent = '#ff6b57',
  align = 'left',
  titleSize = 0.42,
  bodySize = 0.22,
  padding = 0.35,
  radius = 0.25,
  border = null,
} = {}) {
  const W = Math.round(width * ppu)
  const H = Math.round(height * ppu)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.clearRect(0, 0, W, H)
  roundRect(ctx, 0, 0, W, H, radius * ppu)
  ctx.fillStyle = background
  ctx.fill()
  if (border) {
    ctx.lineWidth = Math.max(2, ppu * 0.06)
    ctx.strokeStyle = border
    roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth, radius * ppu)
    ctx.stroke()
  }

  const pad = padding * ppu
  let y = pad
  const x = align === 'center' ? W / 2 : pad
  ctx.textAlign = align === 'center' ? 'center' : 'left'
  ctx.textBaseline = 'top'
  const maxW = W - pad * 2

  if (title) {
    ctx.fillStyle = accent
    ctx.fillRect(align === 'center' ? W / 2 - ppu * 0.6 : pad, y, ppu * 1.2, Math.max(3, ppu * 0.07))
    y += ppu * 0.22
    ctx.font = `800 ${titleSize * ppu}px ${FONT_STACK}`
    ctx.fillStyle = titleColor
    for (const line of wrapLines(ctx, title, maxW)) {
      ctx.fillText(line, x, y)
      y += titleSize * ppu * 1.15
    }
  }
  if (subtitle) {
    ctx.font = `600 ${bodySize * 1.05 * ppu}px ${FONT_STACK}`
    ctx.fillStyle = accent
    for (const line of wrapLines(ctx, subtitle, maxW)) {
      ctx.fillText(line, x, y)
      y += bodySize * 1.05 * ppu * 1.3
    }
    y += ppu * 0.1
  }
  ctx.font = `500 ${bodySize * ppu}px ${FONT_STACK}`
  ctx.fillStyle = textColor
  for (const para of body) {
    for (const line of wrapLines(ctx, para, maxW)) {
      ctx.fillText(line, x, y)
      y += bodySize * ppu * 1.4
    }
    y += bodySize * ppu * 0.5
  }
  if (footer) {
    ctx.font = `600 ${bodySize * 0.9 * ppu}px ${FONT_STACK}`
    ctx.fillStyle = accent
    ctx.textBaseline = 'bottom'
    ctx.fillText(footer, x, H - pad)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.userData = { text: [title, subtitle, ...body, footer].filter(Boolean).join('\n') }
  return texture
}

/**
 * A flat plane carrying a board texture. Faces +Z. Transparent corners.
 */
export function boardMesh(opts) {
  const { width = 6, height = 3.5 } = opts
  const texture = makeBoardTexture(opts)
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat)
  mesh.userData.size = { width, height }
  return mesh
}

/**
 * Simple single-line label texture (used for signposts, crates, keys).
 */
export function makeLabelTexture(text, {
  width = 2, height = 0.6, ppu = 128, background = 'rgba(0,0,0,0)', color = '#2b2a33', weight = 800, fontSize = 0.34, letterSpacing = 0,
} = {}) {
  const W = Math.round(width * ppu)
  const H = Math.round(height * ppu)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (background !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, W, H)
  }
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (letterSpacing) ctx.letterSpacing = `${letterSpacing}px`
  let size = fontSize * ppu
  ctx.font = `${weight} ${size}px ${FONT_STACK}`
  while (ctx.measureText(text).width > W * 0.9 && size > 8) {
    size *= 0.92
    ctx.font = `${weight} ${size}px ${FONT_STACK}`
  }
  ctx.fillText(text, W / 2, H / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.userData = { text }
  return texture
}

export function labelMesh(text, opts = {}) {
  const { width = 2, height = 0.6 } = opts
  const texture = makeLabelTexture(text, opts)
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat)
  mesh.userData.size = { width, height }
  return mesh
}

/**
 * Text drawn flat on the floor (rotated -90° about X), slightly raised to avoid z-fighting.
 */
export function floorLabel(text, opts = {}) {
  const mesh = labelMesh(text, { color: '#8c8798', ...opts })
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.02
  mesh.renderOrder = 1
  return mesh
}
