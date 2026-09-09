import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { flat, palette } from './Materials.js'
import { labelMesh } from './Text.js'

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

let ringGeoCache = new Map()
function ringGeometry(w, d, thickness = 0.16, r = 0.6) {
  const key = `${w}|${d}|${thickness}|${r}`
  if (ringGeoCache.has(key)) return ringGeoCache.get(key)
  const outer = roundedRectShape(w, d, r)
  const inner = roundedRectShape(w - thickness * 2, d - thickness * 2, Math.max(0.05, r - thickness))
  outer.holes.push(inner)
  const geo = new THREE.ShapeGeometry(outer, 6)
  geo.rotateX(-Math.PI / 2)
  ringGeoCache.set(key, geo)
  return geo
}

const keyGeo = new RoundedBoxGeometry(1.7, 0.42, 0.95, 3, 0.12)

/**
 * An interactive floor pad. When the car is inside, a floating key hint appears and
 * pressing Enter (or tapping the action button) fires `onInteract`.
 */
export class Area {
  constructor(world, { x, z, width = 4.5, depth = 3, label = '', hint = 'ENTER', onInteract = null, onEnter = null, onLeave = null, color = palette.coral }) {
    this.world = world
    this.x = x
    this.z = z
    this.width = width
    this.depth = depth
    this.onInteract = onInteract
    this.onEnter = onEnter
    this.onLeave = onLeave
    this.active = false
    this.label = label
    this.color = color
    this.pressTimer = 0
    // Seeded from the pad's own position: spec §2 forbids Math.random in a constructor, and this one
    // made key-cap bob phases differ between runs of the Node audits.
    this.bob = ((x * 0.37 + z * 0.11) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)

    this.group = new THREE.Group()
    this.group.position.set(x, 0, z)

    this.ring = new THREE.Mesh(ringGeometry(width, depth), flat(palette.cream))
    this.ring.position.y = 0.025
    this.group.add(this.ring)

    this.fill = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(width - 0.36, depth - 0.36, 0.45), 6).rotateX(-Math.PI / 2), flat(color, { transparent: true, opacity: 0.22 }))
    this.fill.position.y = 0.02
    this.fill.visible = false
    this.group.add(this.fill)

    if (label) {
      this.labelMesh = labelMesh(label, { width: Math.max(2.4, width - 0.6), height: 0.6, color: palette.stencil, fontSize: 0.3, weight: 700 })
      this.labelMesh.rotation.x = -Math.PI / 2
      this.labelMesh.position.set(0, 0.03, 0)
      this.group.add(this.labelMesh)
    }

    // Floating key cap
    this.key = new THREE.Group()
    this.keyCap = new THREE.Mesh(keyGeo, flat(palette.white))
    this.key.add(this.keyCap)
    const keyText = labelMesh(world.experience.isTouch ? 'TAP' : hint, { width: 1.6, height: 0.7, color: palette.ink, fontSize: 0.32, weight: 800 })
    keyText.rotation.x = -Math.PI / 2
    keyText.position.y = 0.22
    this.key.add(keyText)
    this.key.position.set(0, 2.2, 0)
    this.key.visible = false
    this.key.scale.setScalar(0.001)
    this.group.add(this.key)

    // Through addStatic so the pad obeys the same shadow rule as everything else: ring and fill
    // receive but never cast, since they lie flat on the floor they would be casting onto. Pads must
    // appear at once, so they opt out of the distance reveal. The flags come from a traverse, so the
    // one part that genuinely should cast — the key cap floating 2.2 m up — is set after.
    world.addStatic(this.group, { reveal: false, cast: false })
    this.keyCap.castShadow = true
  }

  contains(px, pz) {
    return Math.abs(px - this.x) <= this.width / 2 && Math.abs(pz - this.z) <= this.depth / 2
  }

  setActive(active) {
    if (active === this.active) return
    this.active = active
    this.ring.material = flat(active ? this.color : palette.cream)
    this.fill.visible = active
    this.key.visible = true
    // Rolling onto a pad was completely silent — the first feedback a visitor got was the panel.
    this.world.sounds?.blip(active ? 520 : 380, this.x)
    if (active) this.onEnter?.(this)
    else this.onLeave?.(this)
  }

  interact() {
    if (!this.active) return false
    this.pressTimer = 0.25
    this.onInteract?.(this)
    return true
  }

  update(dt, elapsed) {
    const target = this.active ? 1 : 0
    const s = this.key.scale.x + (target - this.key.scale.x) * (1 - Math.exp(-dt * 12))
    this.key.scale.setScalar(Math.max(0.001, s))
    if (!this.active && s < 0.01) this.key.visible = false
    this.bob += dt
    let y = 2.1 + Math.sin(elapsed * 2.2 + this.bob) * 0.12
    if (this.pressTimer > 0) {
      this.pressTimer -= dt
      y -= 0.35 * (this.pressTimer / 0.25)
    }
    this.key.position.y = y
    if (this.active) {
      const pulse = 1 + Math.sin(elapsed * 3) * 0.02
      this.fill.scale.set(pulse, 1, pulse)
    }
  }
}

/** Tracks all areas, figures out which one the car is in, and routes interact() to it. */
export class AreaManager {
  constructor(world) {
    this.world = world
    this.areas = []
    this.current = null
  }

  add(opts) {
    const area = new Area(this.world, opts)
    this.areas.push(area)
    return area
  }

  update(dt, elapsed, carX, carZ) {
    let found = null
    for (const a of this.areas) {
      if (!found && a.contains(carX, carZ)) found = a
    }
    if (found !== this.current) {
      this.current?.setActive(false)
      this.current = found
      this.current?.setActive(true)
    }
    for (const a of this.areas) a.update(dt, elapsed)
  }

  interact() {
    return this.current ? this.current.interact() : false
  }
}
