import * as THREE from 'three'
import { Section } from './Section.js'
import { resume } from '../../content/resume.js'
import { flat, palette } from '../Materials.js'
import { board } from '../Board.js'
import { labelMesh, floorLabel } from '../Text.js'
import { InstancedProps } from '../props/InstancedProps.js'
import { RedButton } from '../props/RedButton.js'

/** Tank positions, paired with the skill groups in the resume. */
const TANKS = [
  { group: 'Languages', x: -12, z: -58 },
  { group: 'Data', x: 12, z: -58 },
  { group: 'Pipelines', x: -12, z: -70 },
  { group: 'Cloud', x: 12, z: -70 },
  { group: 'AI', x: -12, z: -82 },
]
const WAREHOUSE = [-14, -80]
const PUMP = [12, -82]

/**
 * Pipeline Yard: five labelled tanks, one per skill group, joined by pipes with data flowing
 * down them into a warehouse and a pump house. A stack of cargo crates is there to be knocked over.
 */
export class SkillsSection extends Section {
  constructor(world, def) {
    super(world, def)
    this.flowPaths = []
    this.buildTanks()
    this.buildWarehouse()
    this.buildPumpHouse()
    this.buildFlow()
    this.buildCrates()
    this.buildPad()
  }

  buildTanks() {
    const { world } = this
    for (const t of TANKS) {
      const group = resume.skills.find((g) => g.group === t.group)
      const g = new THREE.Group()
      g.position.set(t.x, 0, t.z)

      const footing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 5), flat(palette.concrete))
      footing.position.y = 0.15
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 4, 14), flat(palette.sage))
      shell.position.y = 2.3
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.24, 14), flat(palette.cream))
      lid.position.y = 4.4
      g.add(footing, shell, lid)

      // Ladder up the side facing the runway
      const side = Math.sign(-t.x) || 1
      for (const off of [-0.25, 0.25]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 5), flat(palette.ink))
        rail.position.set(side * 2.25, 2.3, off)
        g.add(rail)
      }
      const rungGeo = new THREE.BoxGeometry(0.1, 0.06, 0.5)
      for (let i = 0; i < 8; i++) {
        const rung = new THREE.Mesh(rungGeo, flat(palette.ink))
        rung.position.set(side * 2.25, 0.7 + i * 0.45, 0)
        g.add(rung)
      }
      world.addStatic(g)

      const body = world.physics.cylinder({ radiusTop: 2.3, radiusBottom: 2.3, height: 4.4, segments: 12, mass: 0, position: [t.x, 2.2, t.z], sleepy: false })
      body.userData = { kind: 'wall', tag: 'wall' }
      world.physics.add(body)

      board(world, {
        x: t.x, z: t.z + 3.2, width: 5.2, height: 2.4, bottom: 1.2,
        accent: palette.sage, posts: true, physics: false,
        title: group.group.toUpperCase(),
        body: [group.items.join(', ')],
        titleSize: 0.42, bodySize: 0.21,
      })
      this.flowPaths.push({ from: new THREE.Vector3(t.x, 0.45, t.z), to: null, side: t.x < 0 ? 'west' : 'east' })
    }
  }

  buildWarehouse() {
    const { world } = this
    const [x, z] = WAREHOUSE
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4), flat(palette.concrete))
    walls.position.y = 1.5
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.3, 4.4), flat(palette.cobalt))
    roof.position.y = 3.15
    const sign = labelMesh('WAREHOUSE · star schema', { width: 4.6, height: 0.7, color: palette.ink, fontSize: 0.26, weight: 800 })
    sign.position.set(0, 1.9, 2.02)
    g.add(walls, roof, sign)
    world.addStatic(g)
    const body = world.physics.box({ size: [6, 3, 4], mass: 0, position: [x, 1.5, z], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }

  buildPumpHouse() {
    const { world } = this
    const [x, z] = PUMP
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    const walls = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), flat(palette.concrete))
    walls.position.y = 1.1
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 4), flat(palette.terracotta))
    roof.position.y = 2.75
    roof.rotation.y = Math.PI / 4
    const sign = labelMesh('ETL / ELT', { width: 2.2, height: 0.6, color: palette.ink, fontSize: 0.3, weight: 800 })
    sign.position.set(0, 1.3, 1.52)
    this.flywheel = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.1, 6, 14), flat(palette.terracotta))
    this.flywheel.position.set(-1.6, 1.2, 0)
    this.flywheel.rotation.y = Math.PI / 2
    g.add(walls, roof, sign, this.flywheel)
    world.addStatic(g)
    const body = world.physics.box({ size: [3, 2.2, 3], mass: 0, position: [x, 1.1, z], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
    this.flywheelBoost = 0
  }

  /** Pipes run down each side of the runway; glowing beads show the data moving. */
  buildFlow() {
    const { world } = this
    const pipeMat = flat(palette.ink)
    const group = new THREE.Group()
    const paths = []
    const trunk = { west: -16.4, east: 16.4 }
    for (const p of this.flowPaths) {
      const tx = trunk[p.side]
      const a = p.from.clone()
      const b = new THREE.Vector3(tx, 0.45, a.z)
      group.add(this.tube(a, b, 0.2, pipeMat))
      paths.push([a, b])
    }
    // Trunks running to the warehouse and the pump house
    const westTrunk = [new THREE.Vector3(trunk.west, 0.45, -56), new THREE.Vector3(trunk.west, 0.45, WAREHOUSE[1])]
    const westIn = [westTrunk[1], new THREE.Vector3(WAREHOUSE[0] - 2.6, 0.45, WAREHOUSE[1])]
    const eastTrunk = [new THREE.Vector3(trunk.east, 0.45, -56), new THREE.Vector3(trunk.east, 0.45, PUMP[1])]
    const eastIn = [eastTrunk[1], new THREE.Vector3(PUMP[0] + 1.4, 0.45, PUMP[1])]
    for (const [a, b] of [westTrunk, westIn, eastTrunk, eastIn]) {
      group.add(this.tube(a, b, 0.24, pipeMat))
      paths.push([a, b])
    }
    // Valve wheels along the trunks
    for (const z of [-60, -68, -76]) {
      for (const tx of [trunk.west, trunk.east]) {
        const v = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 5, 10), flat(palette.terracotta))
        v.position.set(tx, 0.9, z)
        v.rotation.y = Math.PI / 2
        group.add(v)
      }
    }
    world.addStatic(group)

    this.paths = paths
    const count = world.experience.quality === 'low' ? 30 : 60
    this.flow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 6, 5), flat(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.9 }), count)
    this.flow.frustumCulled = false
    world.addStatic(this.flow, { reveal: false })
    this.flowOffsets = Array.from({ length: count }, (_, i) => i / count)
    this._m = new THREE.Matrix4()
    this._p = new THREE.Vector3()
  }

  tube(a, b, radius, material) {
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), material)
    mesh.position.copy(a).addScaledVector(dir, 0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    return mesh
  }

  /** A dock of cargo crates by the road, stacked four by four. */
  buildCrates() {
    const { world } = this
    const dock = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 3.4), flat(palette.concrete))
    dock.position.set(11, 0.2, -48)
    world.addStatic(dock)
    const dockBody = world.physics.box({ size: [6, 0.4, 3.4], mass: 0, position: [11, 0.2, -48], sleepy: false })
    dockBody.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(dockBody)

    const rows = world.experience.quality === 'low' ? 3 : 4
    const bodies = []
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < rows; row++) {
        bodies.push(world.physics.box({
          size: [1, 1, 1], mass: 2,
          position: [9.4 + col * 1.03, 0.92 + row * 1.03, -48],
        }))
      }
    }
    this.crates = new InstancedProps(world, {
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: flat(palette.mesa),
      bodies,
      tag: 'crate',
      shadowRadius: { rx: 0.6, rz: 0.6 },
      colors: [palette.mesa, palette.sage, palette.cream, palette.cobalt],
    })
    bodies.forEach((b) => this.track(b))

    const sign = floorLabel('CARGO — knock me over', { width: 6, height: 1, color: '#9C8B63', fontSize: 0.36, weight: 800 })
    sign.position.set(11, 0.03, -45.4)
    world.addStatic(sign, { reveal: false })

    this.button = new RedButton(world, { x: 16, z: -52, bodies })
  }

  buildPad() {
    const area = this.world.addArea({
      x: 0, z: -70, width: 6, depth: 3.4, label: 'SKILLS',
      color: palette.sage,
      onInteract: () => this.world.ui.togglePanel('skills'),
    })
    area.actionLabel = 'OPEN'
    const arrow = floorLabel('PIPELINE YARD ▲', { width: 7, height: 1.4, color: '#9C8B63', fontSize: 0.5, weight: 800 })
    arrow.position.set(0, 0.03, -50)
    this.world.addStatic(arrow, { reveal: false })
  }

  openDetails() {
    this.world.ui.togglePanel('skills')
  }

  onHorn() {
    const p = this.world.car.physics.position
    if (Math.hypot(p.x - PUMP[0], p.z - PUMP[1]) < 14) {
      this.flywheelBoost = 2
      this.world.sounds.blip(700)
    }
  }

  update(dt, elapsed) {
    const boost = this.flywheelBoost > 0 ? 4 : 1
    if (this.flywheelBoost > 0) this.flywheelBoost -= dt
    this.flywheel.rotation.z += dt * 3 * boost

    const speed = 0.12 * boost
    for (let i = 0; i < this.flow.count; i++) {
      const path = this.paths[i % this.paths.length]
      const t = (this.flowOffsets[i] + elapsed * speed) % 1
      this._p.lerpVectors(path[0], path[1], t)
      this._m.makeTranslation(this._p.x, this._p.y, this._p.z)
      this.flow.setMatrixAt(i, this._m)
    }
    this.flow.instanceMatrix.needsUpdate = true
  }
}
