import * as THREE from 'three'
import { Section } from './Section.js'
import { resume } from '../../content/resume.js'
import { flat, palette } from '../Materials.js'
import { board } from '../Board.js'
import { labelMesh, floorLabel } from '../Text.js'
import { relayBeacon } from '../props/Beacon.js'

const BUILDING = { x: 0, z: 34 }
const TOTEM_Z = 47
// South of the totems, not north of them. The camera never rotates and always looks north, so a
// 2.65 m totem standing at z 47 threw its silhouette back over a pad at z 43.5 — the ring, the
// label and the ENTER cap were all behind the very object they belonged to. At 50.5 the pad is
// nearer the camera than its totem, and the radar (z 42.4..45.6) and telephone desk (z 43.5..44.5)
// no longer clip the EMAIL and RESUME PDF rings either.
const PAD_Z = 50.5

/**
 * Ground Control: the last stop, one U-turn from the spawn. A board you can read without
 * stopping, and four pads that open email, LinkedIn, GitHub and the résumé PDF.
 */
export class ContactSection extends Section {
  constructor(world, def) {
    super(world, def)
    this.buildBuilding()
    this.buildBoard()
    this.buildTotems()
    this.buildRadar()
    this.buildTelephone()
    this.dishSnap = 0
    this.greeted = false
    this.ring = 0
  }

  buildBuilding() {
    const { world } = this
    const g = new THREE.Group()
    g.position.set(BUILDING.x, 0, BUILDING.z)

    const walls = new THREE.Mesh(new THREE.BoxGeometry(12, 3.2, 6), flat(palette.habitat))
    walls.position.y = 1.6
    const band = new THREE.Mesh(new THREE.BoxGeometry(12.3, 0.4, 6.3), flat(palette.cobalt))
    band.position.y = 3.4
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.12), flat(palette.ink))
    door.position.set(0, 1.2, 3.05)
    g.add(walls, band, door)
    for (const dx of [-4, 0, 4]) {
      const hvac = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), flat(palette.concrete))
      hvac.position.set(dx, 4, -1.2)
      g.add(hvac)
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 6), flat(palette.cobalt))
    mast.position.set(-5, 6.6, 0)
    this.mastLamp = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.8 }))
    this.mastLamp.position.set(-5, 9.8, 0)
    g.add(mast, this.mastLamp)

    // On the cobalt band, not the wall: at y 2.7 the sign sat under the board's sight line and was
    // unreadable at every zoom. The phone number that used to hang beside it is gone — the board
    // 10 m in front prints the same string.
    const sign = labelMesh('GROUND CONTROL', { width: 6, height: 0.8, color: palette.cream, fontSize: 0.34, weight: 800 })
    sign.position.set(0, 3.4, 3.18)
    g.add(sign)

    // Dish on the roof, sweeping until you honk at it.
    this.dish = new THREE.Group()
    this.dish.position.set(4, 4.2, 0)
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.6, 8), flat(palette.ink))
    pivot.position.y = 0.8
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3), flat(palette.cream, { side: THREE.DoubleSide }))
    cap.position.y = 1.9
    cap.rotation.x = Math.PI * 0.75
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), flat(palette.ink))
    feed.position.set(0, 2.3, 0.7)
    feed.rotation.x = Math.PI / 3
    this.dish.add(pivot, cap, feed)
    g.add(this.dish)

    world.addStatic(g)
    // Relay beacon on the mast top, blinking on its own material, out of phase with the tower's.
    relayBeacon(world, { x: BUILDING.x - 5, y: 10.1, z: BUILDING.z, phase: 0.7 })
    const body = world.physics.box({ size: [12, 3.2, 6], mass: 0, position: [BUILDING.x, 1.6, BUILDING.z], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }

  buildBoard() {
    const c = resume.contact
    board(this.world, {
      x: 0, z: 44, width: 8, height: 3.2, bottom: 1.4,
      accent: palette.terracotta, entry: 'contact',
      kicker: 'Ground Control · Contact',
      title: 'LET’S TALK',
      body: [c.email, c.phone, `${c.linkedinLabel} · ${c.githubLabel}`],
      footer: 'Résumé PDF on the pad →',
      titleSize: 0.5, bodySize: 0.26,
    })
  }

  /** Four rotating totems, each with a pad that opens the real link. */
  buildTotems() {
    const { world } = this
    const c = resume.contact
    const links = [
      { x: -12, glyph: '@', label: 'EMAIL', action: 'email' },
      { x: -4, glyph: 'in', label: 'LINKEDIN', action: 'linkedin' },
      { x: 4, glyph: '</>', label: 'GITHUB', action: 'github' },
      { x: 12, glyph: 'PDF', label: 'RÉSUMÉ PDF', action: 'pdf' },
    ]
    this.totems = []
    for (const link of links) {
      const g = new THREE.Group()
      g.position.set(link.x, 0, TOTEM_Z)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8), flat(palette.ink))
      post.position.y = 0.8
      const cube = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), flat(palette.cream))
      cube.name = 'totem-cube' // its top is 2.65 m up, over a bodied post: exempt from the audit
      cube.position.y = 2.1
      for (let i = 0; i < 4; i++) {
        const face = labelMesh(link.glyph, { width: 0.9, height: 0.9, color: palette.ink, fontSize: 0.5, weight: 900 })
        face.position.set(0, 0, 0.56)
        const pivot = new THREE.Group()
        pivot.rotation.y = (Math.PI / 2) * i
        pivot.add(face)
        cube.add(pivot)
      }
      g.add(post, cube)
      world.addStatic(g)
      this.totems.push(cube)

      const bodyPost = world.physics.cylinder({ radiusTop: 0.3, radiusBottom: 0.3, height: 1.6, segments: 6, mass: 0, position: [link.x, 0.8, TOTEM_Z], sleepy: false })
      bodyPost.userData = { kind: 'wall', tag: 'wall' }
      world.physics.add(bodyPost)

      const area = world.addArea({
        x: link.x, z: PAD_Z, width: 5, depth: 3, label: link.label,
        color: palette.terracotta,
        onInteract: () => this.openLink(link.action),
      })
      area.actionLabel = link.action === 'email' ? 'EMAIL' : 'OPEN ↗'
    }
    void c
  }

  /** Every one of these runs synchronously inside the key/tap handler so popups are not blocked. */
  openLink(action) {
    const c = resume.contact
    const { ui } = this.world
    if (action === 'email') {
      try { navigator.clipboard?.writeText(c.email) } catch { /* clipboard unavailable */ }
      ui.toast(`Copied — ${c.email}`)
      window.location.href = `mailto:${c.email}`
      return
    }
    const url = action === 'linkedin' ? c.linkedin : action === 'github' ? c.github : c.resumePdf
    window.open(url, '_blank', 'noopener')
  }

  buildRadar() {
    const { world } = this
    const g = new THREE.Group()
    g.position.set(-16, 0, 44)
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.5, 16), flat(palette.concrete))
    drum.position.y = 0.25
    this.sweep = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.36), flat(palette.ink))
    this.sweep.position.y = 0.56
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 4, 12, 0.9), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.6 }))
    arc.rotation.x = Math.PI / 2
    arc.position.y = 0.58
    this.sweepArc = arc
    g.add(drum, this.sweep, arc)
    world.addStatic(g)
    const body = world.physics.cylinder({ radiusTop: 1.6, radiusBottom: 1.6, height: 0.5, segments: 12, mass: 0, position: [-16, 0.25, 44], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }

  buildTelephone() {
    const { world } = this
    const g = new THREE.Group()
    g.position.set(9, 0, 44)
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1), flat(palette.concrete))
    desk.position.y = 0.45
    this.phone = new THREE.Group()
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.42), flat(palette.terracotta))
    const handset = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 5, 10, Math.PI), flat(palette.terracotta))
    handset.position.y = 0.2
    handset.rotation.x = Math.PI / 2
    handset.rotation.z = Math.PI
    this.phone.add(base, handset)
    this.phone.position.y = 1.02
    g.add(desk, this.phone)
    world.addStatic(g)
    const deskBody = world.physics.box({ size: [1.4, 0.9, 1.0], mass: 0, position: [9, 0.45, 44], sleepy: false })
    deskBody.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(deskBody)

    const label = floorLabel('▲ SAY HELLO', { width: 5, height: 1.2, color: palette.stencil, fontSize: 0.44, weight: 800 })
    label.position.set(0, 0.03, 53.5)
    world.addStatic(label, { reveal: false })
  }

  openDetails() {
    this.world.ui.togglePanel('contact')
  }

  onEnter() {
    if (this.greeted) return
    // 'That's the whole range' is a finishing line, so only say it to someone who has actually been
    // round the range, or who has driven all the way in to the pads. Arriving from the north on the
    // first minute used to be congratulated on finishing before starting.
    const car = this.world.car.physics.position
    if (this.world._seenCards.size < 5 && car.z < 44) return
    this.greeted = true
    this.ring = 1.2
    this.world.ui.toast('That’s the whole range. Thanks for driving — links are on the pads.', 3600)
  }

  onHorn() {
    const p = this.world.car.physics.position
    if (Math.hypot(p.x - 4, p.z - BUILDING.z) < 18) {
      this.dishSnap = 2
      this.world.sounds.blip(520)
    }
  }

  update(dt, elapsed) {
    const car = this.world.car.physics.position

    // Dish sweeps, or locks onto the car for a moment after a honk.
    if (this.dishSnap > 0) {
      this.dishSnap -= dt
      const target = Math.atan2(car.x - 4, car.z - BUILDING.z)
      this.dish.rotation.y += (target - this.dish.rotation.y) * (1 - Math.exp(-dt * 6))
      this.mastLamp.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(elapsed * 14))
    } else {
      this.dish.rotation.y = Math.sin(elapsed * 0.2) * 0.7
      this.mastLamp.material.emissiveIntensity = elapsed % 2 < 0.25 ? 1.3 : 0.4
    }

    this.sweep.rotation.y += dt * 1.2
    this.sweepArc.rotation.z = this.sweep.rotation.y

    for (const t of this.totems) t.rotation.y += dt * 0.5

    if (this.ring > 0) {
      this.ring -= dt
      this.phone.rotation.z = Math.sin(elapsed * 30) * 0.12
    } else if (this.phone.rotation.z !== 0) {
      this.phone.rotation.z = 0
    }
  }
}
