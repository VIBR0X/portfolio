import * as THREE from 'three'
import { palette } from './Materials.js'

const PICK_MS = 90        // raycast throttle (unchanged)
const LABEL_MS = 250      // how often a live label is re-read while hovering (FLY becomes LAND)
const FRAME_PAD = 10      // px of breathing room around the target's screen box
const TIP_GAP = 16        // px between the cursor and the tooltip
const VIEW_MARGIN = 8     // px the tooltip keeps clear of every viewport edge
const GLOW_COLOR = palette.lamp
const GLOW_INTENSITY = 0.45

const _box = new THREE.Box3()
const _meshBox = new THREE.Box3()
const _v = new THREE.Vector3()

/**
 * Click-to-open: every board and pad can be opened with the mouse from any distance, so a
 * visitor who does not want to drive is never blocked. A drag (camera zoom, or a stray swipe)
 * is not a click, so movement past a few pixels cancels it.
 *
 * Hover answers the two questions the world cannot: what is this, and what will clicking it do.
 * Three things say so, all off one picked target:
 *   - the cursor turns into a pointer (as before);
 *   - `.hover-frame`, a corner-bracket reticle laid over the target's projected bounding box;
 *   - `.hover-tip`, a glass tooltip on the cursor carrying the label every call site has always
 *     passed and that nothing used to render.
 *
 * The frame is DOM rather than a three.js outline because there is no post-processing pass here,
 * an inverted-hull shell would need a geometry clone per target, and WebGL ignores line width.
 *
 * The on-object cue is a per-mesh material SWAP, never a material mutation. Materials.flat()
 * hands the same instance to every mesh of a colour — eighteen meshes share the board cream — so
 * writing `mesh.material.emissive` would light up half the range. Each hovered material gets one
 * private clone instead, cached by uuid; the mesh points at the clone while hovered and is
 * pointed back on the way out. Clones share their parent's textures and shader program (emissive
 * is a uniform, not a define), so nothing recompiles.
 */
export class Pointer {
  constructor(world) {
    this.world = world
    this.camera = world.experience.camera
    this.canvas = world.experience.canvas
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.targets = []
    this.objects = []
    this.enabled = true
    this._down = null
    this._hoverAt = 0
    this._labelAt = 0
    this._target = null
    this._kind = 'object'
    this._cursor = { x: 0, y: 0 }
    this._tipW = 0
    this._tipH = 0
    this._twins = new Map()
    this._swapped = []
    this._ticking = false

    this._buildOverlay()

    const canvas = this.canvas
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && e.isPrimary === false) return
      this._down = { x: e.clientX, y: e.clientY, id: e.pointerId }
      if (e.pointerType === 'mouse') this._clearHover()
    })
    canvas.addEventListener('pointerup', (e) => {
      const down = this._down
      this._down = null
      if (!down || down.id !== e.pointerId) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return
      this._click(e)
    })
    canvas.addEventListener('pointercancel', () => { this._down = null })
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return
      // Following the cursor is two style writes; picking is a raycast, so only that is throttled.
      this._cursor.x = e.clientX
      this._cursor.y = e.clientY
      this._placeTip()
      const now = performance.now()
      if (now - this._hoverAt < PICK_MS) return
      this._hoverAt = now
      this._hover(e)
    })
    canvas.addEventListener('pointerleave', () => this._clearHover())
    window.addEventListener('blur', () => this._clearHover())
    // A panel, modal or the text résumé owns the screen; nothing under it is hoverable and the
    // tooltip would sit on top of the thing the visitor just opened.
    for (const ev of ['modal-open', 'panel-open', 'resume-open']) world.ui?.on?.(ev, () => this._clearHover())
  }

  /**
   * @param object any Object3D; a hit on it or any descendant fires `action`
   * @param action () => void
   * @param label  string | { title, sub, hint, kind } | () => (string | { … })
   *        A function is re-read while hovering, so a pad whose verb changes under the cursor
   *        (the FLY pad becomes LAND once you are airborne) stays honest.
   */
  add(object, action, label = '') {
    this.targets.push({ object, action, label })
    object.traverse((o) => { if (o.isMesh) this.objects.push(o) })
    return object
  }

  _pick(event) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.objects, false)
    if (!hits.length) return null
    const hit = hits[0].object
    return this.targets.find((t) => {
      let o = hit
      while (o) {
        if (o === t.object) return true
        o = o.parent
      }
      return false
    }) || null
  }

  _click(event) {
    if (!this.enabled || !this.world.started) return
    const target = this._pick(event)
    if (!target) return
    this._clearHover()
    this.world.sounds.click()
    target.action()
  }

  /* ---------------- hover ---------------- */

  _hover(event) {
    if (!this.enabled || !this.world.started || this.world.ui?.anyOpen || this._down) { this._clearHover(); return }
    const target = this._pick(event)
    if (target === this._target) { this._syncLabel(true); return }
    this._clearHover()
    if (!target) return
    this._target = target
    this.canvas.style.cursor = 'pointer'
    this._glowOn(target.object)
    this._syncLabel(false)
    this._syncFrame()
    // Registered lazily: World builds the Pointer before `updatables` exists.
    if (!this._ticking) { this._ticking = true; this.world.addUpdatable(this) }
  }

  _clearHover() {
    if (!this._target) return
    this._target = null
    this.canvas.style.cursor = ''
    this._glowOff()
    this.tip.hidden = true
    this.frame.hidden = true
  }

  /** The chase camera moves under a stationary cursor, so the frame has to keep up with it. */
  update() {
    if (!this._target) return
    this._syncLabel(true)
    this._syncFrame()
  }

  /* ---------------- overlay ---------------- */

  _buildOverlay() {
    const tip = document.createElement('div')
    tip.className = 'hover-tip'
    tip.hidden = true
    const title = document.createElement('b')
    const sub = document.createElement('span')
    const hint = document.createElement('i')
    tip.appendChild(title)
    tip.appendChild(sub)
    tip.appendChild(hint)
    const frame = document.createElement('div')
    frame.className = 'hover-frame'
    frame.hidden = true
    document.body.appendChild(frame)
    document.body.appendChild(tip)
    this.tip = tip
    this.tipTitle = title
    this.tipSub = sub
    this.tipHint = hint
    this.frame = frame
  }

  _syncLabel(throttled) {
    const now = performance.now()
    if (throttled && now - this._labelAt < LABEL_MS) return
    this._labelAt = now
    const t = this._target
    if (!t) return
    let l = t.label
    if (typeof l === 'function') l = l()
    if (typeof l === 'string') l = { title: l }
    const title = (l && l.title) || ''
    this._kind = (l && l.kind) || 'object'
    if (!title) { this.tip.hidden = true; return }
    const verb = String((l && l.hint) || 'OPEN').toUpperCase()
    const hint = this._kind === 'pad' ? `${verb} · click or drive on` : `${verb} · click`
    const sub = (l && l.sub) || ''
    const changed = this.tipTitle.textContent !== title || this.tipSub.textContent !== sub || this.tipHint.textContent !== hint
    if (changed) {
      this.tipTitle.textContent = title
      this.tipSub.textContent = sub
      this.tipSub.hidden = !sub
      this.tipHint.textContent = hint
    }
    if (this.tip.hidden) this.tip.hidden = false
    // Measured once per content change, not per mouse move.
    if (changed || !this._tipW) {
      this._tipW = this.tip.offsetWidth || 0
      this._tipH = this.tip.offsetHeight || 0
    }
    this._placeTip()
  }

  /** Below-right of the cursor, flipped and then clamped so it never leaves the viewport. */
  _placeTip() {
    if (!this._target || this.tip.hidden) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = this._tipW
    const h = this._tipH
    let x = this._cursor.x + TIP_GAP
    let y = this._cursor.y + TIP_GAP
    if (x + w > vw - VIEW_MARGIN) x = this._cursor.x - TIP_GAP - w
    if (y + h > vh - VIEW_MARGIN) y = this._cursor.y - TIP_GAP - h
    x = Math.max(VIEW_MARGIN, Math.min(x, vw - VIEW_MARGIN - w))
    y = Math.max(VIEW_MARGIN, Math.min(y, vh - VIEW_MARGIN - h))
    this.tip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  }

  /**
   * The reticle is the target's world box projected to a screen rectangle. Invisible subtrees are
   * skipped, which matters for pads: `Box3.expandByObject` ignores `visible`, so the ENTER key cap
   * floating 2.2 m above a pad would be inside the box. A pad is framed by its floor footprint
   * alone (`kind === 'pad'`), so the frame does not jump when the car arrives and the cap appears.
   */
  _syncFrame() {
    const t = this._target
    if (!t) return
    _box.makeEmpty()
    const stack = [t.object]
    while (stack.length) {
      const o = stack.pop()
      if (o.visible === false) continue
      if (o.isMesh && o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
        _meshBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)
        _box.union(_meshBox)
      }
      for (const c of o.children) stack.push(c)
    }
    if (_box.isEmpty()) { this.frame.hidden = true; return }
    if (this._kind === 'pad') _box.max.y = _box.min.y + 0.06

    const rect = this.canvas.getBoundingClientRect()
    const cam = this.camera
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z)
      _v.applyMatrix4(cam.matrixWorldInverse)
      if (_v.z > -0.05) { this.frame.hidden = true; return } // a corner behind the camera
      _v.applyMatrix4(cam.projectionMatrix)                  // applyMatrix4 does the w divide
      const px = rect.left + (_v.x * 0.5 + 0.5) * rect.width
      const py = rect.top + (-_v.y * 0.5 + 0.5) * rect.height
      if (px < x0) x0 = px
      if (px > x1) x1 = px
      if (py < y0) y0 = py
      if (py > y1) y1 = py
    }
    const f = this.frame
    if (f.hidden) f.hidden = false
    f.style.transform = `translate3d(${Math.round(x0 - FRAME_PAD)}px, ${Math.round(y0 - FRAME_PAD)}px, 0)`
    f.style.width = `${Math.round(x1 - x0 + FRAME_PAD * 2)}px`
    f.style.height = `${Math.round(y1 - y0 + FRAME_PAD * 2)}px`
  }

  /* ---------------- on-object glow ---------------- */

  _glowOn(root) {
    this._glowOff()
    const stack = [root]
    while (stack.length) {
      const o = stack.pop()
      if (o.visible === false) continue
      const m = o.material
      // Standard materials only: the basic ones are the boards' printed faces and the floor
      // decals, and lifting those would wash out the text.
      if (o.isMesh && m && m.isMeshStandardMaterial) {
        let twin = this._twins.get(m.uuid)
        if (!twin) {
          twin = m.clone()
          twin.emissive = new THREE.Color(GLOW_COLOR)
          twin.emissiveIntensity = GLOW_INTENSITY
          this._twins.set(m.uuid, twin)
        }
        this._swapped.push({ mesh: o, mat: m })
        o.material = twin
      }
      for (const c of o.children) stack.push(c)
    }
  }

  _glowOff() {
    for (const s of this._swapped) s.mesh.material = s.mat
    this._swapped.length = 0
  }
}
