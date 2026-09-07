import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Section } from './Section.js'
import { resume } from '../../content/resume.js'
import { flat, palette } from '../Materials.js'
import { floorLabel } from '../Text.js'
import { board } from '../Board.js'
import { letterRow } from '../props/Letters.js'
import { RedButton } from '../props/RedButton.js'

/**
 * Runway 00: the visitor's first three seconds. The name stands on the runway as twelve
 * knockable letters; a tagline board sits at the north end; a red button stands them back up.
 */
export class IntroSection extends Section {
  constructor(world, def) {
    super(world, def)
    this.letters = []
    this.buildLetters()
    this.buildTagline()
    this.buildControlsDecal()
    this.buildWindsock()
    this.buildRunwayLights()
    this.buildPad()

    this.button = new RedButton(world, {
      x: 9, z: -4,
      bodies: this.letters.map((l) => l.body),
      onReset: () => { this.disturbed = false },
    })
  }

  buildLetters() {
    const { world } = this
    const rows = [
      { text: resume.firstName, z: -14.5, color: palette.cream },
      { text: resume.lastName, z: -9, color: palette.ink },
    ]
    for (const row of rows) {
      for (const letter of letterRow(world, row.text, { z: row.z, color: row.color })) {
        world.addDynamic(letter.group, letter.body, { tag: 'letter', shadowRadius: { rx: 1.1, rz: 0.6 } })
        this.track(letter.body)
        this.letters.push(letter)
      }
    }
  }

  buildTagline() {
    board(this.world, {
      x: 0, z: -19.5, width: 10, height: 3, bottom: 1.5,
      accent: palette.terracotta, entry: 'about',
      title: resume.name,
      subtitle: 'Engineer · autonomous decision systems & the data infrastructure under them',
      body: ['B.Tech Aerospace Engineering, IIT Bombay · Minor in Machine Intelligence and Data Science · built Tark · previously founding data engineer at Epik'],
      titleSize: 0.5, bodySize: 0.19,
    })
  }

  /** Control hints painted on the tarmac behind the spawn; they fade once the visitor drives off. */
  buildControlsDecal() {
    const text = this.world.experience.isTouch
      ? 'DRAG to drive  ·  BOOST  ·  JUMP  ·  HORN  ·  TAP pads to open'
      : 'W A S D / ARROWS drive  ·  SHIFT boost  ·  SPACE jump  ·  ENTER open  ·  M map  ·  R reset'
    const decal = floorLabel(text, { width: 15, height: 1.8, color: palette.stencil, fontSize: 0.56, weight: 800 })
    decal.position.set(0, 0.03, 10)
    decal.material.transparent = true
    this.decal = decal
    this.world.addStatic(decal, { reveal: false })
  }

  buildWindsock() {
    const g = new THREE.Group()
    g.position.set(11, 0, -6)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4, 6), flat(palette.ink))
    pole.position.y = 2
    const arm = new THREE.Group()
    arm.position.y = 3.9
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 8, 1, true), flat(palette.terracotta, { side: THREE.DoubleSide }))
    cone.rotation.z = Math.PI / 2
    cone.position.x = 0.8
    arm.add(cone)
    g.add(pole, arm)
    this.windsock = { group: g, arm, cone }
    this.world.addStatic(g)

    const body = this.world.physics.box({ size: [0.5, 4, 0.5], mass: 0, position: [11, 2, -6] })
    body.userData = { kind: 'wall', tag: 'wall' }
    this.world.physics.add(body)
  }

  /** Runway edge lights: one instanced draw call for 40 little emissive spheres. */
  buildRunwayLights() {
    const geo = new THREE.SphereGeometry(0.14, 6, 5)
    const mat = flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.9 })
    const positions = []
    for (let z = 8; z >= -28; z -= 4) positions.push([-7.6, z], [7.6, z])
    const mesh = new THREE.InstancedMesh(geo, mat, positions.length)
    const m = new THREE.Matrix4()
    positions.forEach(([x, z], i) => { m.makeTranslation(x, 0.14, z); mesh.setMatrixAt(i, m) })
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
    this.world.addStatic(mesh, { reveal: false })
  }

  /** A pad in front of the tagline board so the summary is one keypress away from the spawn. */
  buildPad() {
    const area = this.world.addArea({
      x: 0, z: -17, width: 5.5, depth: 3, label: 'ABOUT',
      color: palette.terracotta,
      onInteract: () => this.world.ui.togglePanel('about'),
    })
    area.actionLabel = 'OPEN'
  }

  /** Paved apron for the plane, east of the runway and clear of the windsock and the letters. */
  openDetails() {
    this.world.ui.togglePanel('about')
  }

  onHorn() {
    const p = this.world.car.physics.position
    if (Math.hypot(p.x - 11, p.z + 6) < 14) {
      this.windsock.whip = 0.4
      this.world.sounds.blip(900)
    }
  }

  update(dt, elapsed) {
    // Windsock swings with an imaginary breeze and stretches when the car races past.
    const { arm, cone } = this.windsock
    arm.rotation.y = Math.sin(elapsed * 0.3) * 0.4 + Math.sin(elapsed * 1.7) * 0.06
    const car = this.world.car.physics
    const d = Math.hypot(car.position.x - 11, car.position.z + 6)
    let stretch = 1 + (d < 12 ? Math.min(car.speed / 24, 1) : 0)
    if (this.windsock.whip > 0) {
      this.windsock.whip = Math.max(0, this.windsock.whip - dt)
      stretch += this.windsock.whip * 1.5
    }
    cone.scale.set(1, stretch, 1)

    // Fade the control hints once the visitor has driven away from the start.
    if (this.decal && this.decal.material.opacity > 0) {
      const travelled = Math.hypot(car.position.x, car.position.z - 6)
      if (travelled > 6) {
        this.decal.material.opacity = Math.max(0, this.decal.material.opacity - dt * 0.6)
        if (this.decal.material.opacity === 0) this.decal.visible = false
      }
    }
  }
}
