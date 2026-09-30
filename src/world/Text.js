import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { flat, palette } from './Materials.js'
import { rng } from './Textures.js'

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

export const FONT_STACK = '"Inter", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif'

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
 * A printed sign face: a framed plate with a station header, a title, a subtitle, body copy that is
 * fitted to the panel, a footer rule and four corner fixings. `width`/`height` are world metres;
 * the canvas resolution comes from `ppu` (pixels per unit).
 *
 * The copy is FITTED, not just wrapped. Every board used to be laid out at a fixed type size, so
 * short copy left the lower half of the plate empty and long copy ran off the bottom — the WINNER
 * board printed seven lines onto a four-line panel, and the four Experience bay boards ran their
 * body into the counter bolted below. Here the title, subtitle and body are measured at a scale,
 * the largest scale in [0.7, 1.35] that fits the space left after `reserveBottom` is chosen, and
 * the outcome is recorded on `texture.userData.fit` so a browser test can assert no board is
 * printing past its edge.
 */
export function makeBoardTexture({
  title = '',
  subtitle = '',
  body = [],
  footer = '',
  kicker = '',
  action = false,
  width = 6,
  height = 3.5,
  ppu = 96,
  background = '#FFF8EA',
  titleColor = '#2B2D42',
  textColor = '#3E4160',
  subtitleColor = '#5A5D73',
  accent = '#E07A5F',
  accentText = '#FFF8EA',
  align = 'left',
  titleSize = 0.42,
  bodySize = 0.22,
  padding = 0.35,
  radius = 0.25,
  border = null,
  reserveBottom = 0,
  fixings = true,
  grain = true,
} = {}) {
  const W = Math.round(width * ppu)
  const H = Math.round(height * ppu)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const px = (m) => m * ppu
  const canTrack = 'letterSpacing' in ctx
  const track = (em) => { if (canTrack) ctx.letterSpacing = `${em}em` }

  /* ---- plate ---- */
  ctx.clearRect(0, 0, W, H)
  roundRect(ctx, 0, 0, W, H, px(radius))
  ctx.fillStyle = background
  ctx.fill()
  if (grain) {
    // Paper grain: a sparse seeded speckle so the plate reads as printed stock, not a flat fill.
    const r = rng(7)
    ctx.fillStyle = 'rgba(90, 60, 40, 0.07)'
    const n = Math.round((W * H) / 900)
    for (let i = 0; i < n; i++) ctx.fillRect(Math.floor(r() * W), Math.floor(r() * H), 1, 1)
  }
  if (border) {
    ctx.lineWidth = Math.max(2, px(0.06))
    ctx.strokeStyle = border
    roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth, px(radius))
    ctx.stroke()
  }

  /* ---- header band, or a rule when there is no kicker ---- */
  const pad = px(padding)
  const bandH = kicker ? px(0.46) : 0
  if (kicker) {
    ctx.save()
    roundRect(ctx, 0, 0, W, H, px(radius))
    ctx.clip()
    ctx.fillStyle = accent
    ctx.fillRect(0, 0, W, bandH)
    ctx.restore()
    ctx.fillStyle = accentText
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = `800 ${px(0.17)}px ${FONT_STACK}`
    track(0.14)
    ctx.fillText(kicker.toUpperCase(), pad, bandH / 2 + px(0.005))
    if (action) {
      // Left-aligned from a measured x rather than textAlign 'right': check-boards.mjs only models
      // left and centre alignment, and a right-aligned run reads to it as text past the edge.
      ctx.font = `800 ${px(0.15)}px ${FONT_STACK}`
      track(0.1)
      const tag = 'OPEN ↵'
      ctx.fillText(tag, W - pad - ctx.measureText(tag).width, bandH / 2 + px(0.005))
    }
    track(0)
  } else {
    ctx.fillStyle = accent
    ctx.fillRect(align === 'center' ? W / 2 - px(0.6) : pad, pad, px(1.2), Math.max(3, px(0.07)))
  }

  /* ---- measure, fit, draw ---- */
  const x = align === 'center' ? W / 2 : pad
  ctx.textAlign = align === 'center' ? 'center' : 'left'
  ctx.textBaseline = 'top'
  const maxW = W - pad * 2
  const top = kicker ? bandH + px(0.28) : pad + px(0.22)
  const footerH = footer ? px(bodySize * 0.8) * 1.7 + px(0.06) : 0
  const avail = H - pad - footerH - px(reserveBottom) - top

  const run = (scale, draw) => {
    let y = top
    if (title) {
      ctx.font = `800 ${px(titleSize * scale)}px ${FONT_STACK}`
      track(-0.015)
      const lines = wrapLines(ctx, title, maxW)
      if (draw) { ctx.fillStyle = titleColor; for (const l of lines) { ctx.fillText(l, x, y); y += px(titleSize * scale) * 1.12 } }
      else y += lines.length * px(titleSize * scale) * 1.12
      track(0)
      y += px(0.05)
    }
    if (subtitle) {
      ctx.font = `600 ${px(bodySize * 1.05 * scale)}px ${FONT_STACK}`
      const lines = wrapLines(ctx, subtitle, maxW)
      if (draw) { ctx.fillStyle = subtitleColor; for (const l of lines) { ctx.fillText(l, x, y); y += px(bodySize * 1.05 * scale) * 1.3 } }
      else y += lines.length * px(bodySize * 1.05 * scale) * 1.3
      y += px(0.14)
    }
    ctx.font = `500 ${px(bodySize * scale)}px ${FONT_STACK}`
    for (const para of body) {
      const lines = wrapLines(ctx, para, maxW)
      if (draw) { ctx.fillStyle = textColor; for (const l of lines) { ctx.fillText(l, x, y); y += px(bodySize * scale) * 1.38 } }
      else y += lines.length * px(bodySize * scale) * 1.38
      y += px(bodySize * scale) * 0.45
    }
    return y - top
  }
  let scale = 1.35
  let needed = run(scale, false)
  while (needed > avail && scale > 0.7) { scale = Math.round((scale - 0.05) * 100) / 100; needed = run(scale, false) }
  run(scale, true)

  /* ---- footer rule ---- */
  if (footer) {
    const ruleY = H - pad - footerH + px(0.02)
    ctx.fillStyle = 'rgba(43, 45, 66, 0.22)'
    ctx.fillRect(pad, ruleY, maxW, Math.max(1, px(0.015)))
    ctx.font = `600 ${px(bodySize * 0.8)}px ${FONT_STACK}`
    ctx.fillStyle = subtitleColor
    ctx.textBaseline = 'bottom'
    ctx.textAlign = align === 'center' ? 'center' : 'left'
    ctx.fillText(footer, x, H - pad)
  }

  /* ---- corner fixings: four bolt heads, so the plate reads as mounted rather than floating ---- */
  if (fixings) {
    const inset = px(0.15)
    const r = px(0.045)
    for (const [cx, cy] of [[inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset]]) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = '#2B2D42'; ctx.fill()
      ctx.lineWidth = Math.max(1, px(0.012)); ctx.strokeStyle = 'rgba(255, 248, 234, 0.85)'; ctx.stroke()
      ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 248, 234, 0.35)'; ctx.fill()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.userData = {
    text: [title, subtitle, ...body, footer].filter(Boolean).join('\n'),
    fit: { scale, overflow: needed > avail, needed: Math.round(needed), avail: Math.round(avail) },
    // The drawn height in metres of each role, AFTER the fitter has chosen its scale. This is what
    // scripts/check-legible.mjs projects through the real camera to get an on-screen cap height —
    // the fitter's own `scale` says whether the copy fits the plate, not whether anyone can read it.
    sizes: { title: title ? titleSize * scale : 0, subtitle: subtitle ? bodySize * 1.05 * scale : 0, body: body.length ? bodySize * scale : 0 },
  }
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
  const mesh = labelMesh(text, { color: palette.stencil, ...opts })
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.02
  mesh.renderOrder = 1
  return mesh
}
