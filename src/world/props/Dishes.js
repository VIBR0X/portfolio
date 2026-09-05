import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, lampMaterial, palette } from '../Materials.js'

// In the gap between the boundary wall and the hill ring (the hills sit 8-18 m further out and
// reach about 7.5 m), with the reflectors well above the hill line so they read against the sky.
const OUT = 20
const PIVOT_Y = 12.4

/** Four along the north edge and four along the west edge, out past the wall. Pure and testable. */
export function dishPositions(extents) {
  const positions = []
  for (let i = 0; i < 4; i++) {
    positions.push({ x: extents.x0 + ((i + 0.5) / 4) * (extents.x1 - extents.x0), z: extents.z0 - OUT })
  }
  for (let i = 0; i < 4; i++) {
    positions.push({ x: extents.x0 - OUT, z: extents.z0 + ((i + 0.5) / 4) * (extents.z1 - extents.z0) })
  }
  return positions
}

/** Stamp one linear colour on every vertex, de-indexed so any primitives merge. */
function tinted(geometry, hex) {
  if (geometry.index) geometry = geometry.toNonIndexed()
  const c = new THREE.Color(hex)
  const n = geometry.attributes.position.count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/** Reflector bowl (vertex at the origin, opening up +Y), feed strut and feed box at the focus, merged. */
function dishGeometry() {
  const bowl = new THREE.SphereGeometry(3.0, 12, 5, 0, Math.PI * 2, 0, 0.42)
  bowl.scale(1, -1, 1) // cap flipped: concave side up
  bowl.translate(0, 3, 0) // vertex on the pivot
  const strut = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6)
  strut.translate(0, 0.8, 0)
  const feed = new THREE.BoxGeometry(0.25, 0.25, 0.25)
  feed.translate(0, 1.6, 0)
  return mergeGeometries([bowl, strut, feed])
}

/**
 * Deep-space dishes on the hill ring, where the wind turbines stood: eight habitat-white towers on
 * concrete bases with cobalt yokes (three merged static meshes), eight instanced reflectors that
 * slew slowly with staggered phases, and one merged mesh of lamp beads that blink together at 0.5 Hz
 * through a single cloned lamp material. Outside the walls, so no physics.
 */
export class Dishes {
  constructor(world) {
    this.world = world
    const positions = dishPositions(world.extents)
    this.positions = positions

    // Towers, bases and yokes carry their colour per vertex and merge into one mesh: the mesh
    // spans two whole edges of the range, so it is drawn from everywhere and one draw beats three.
    const statics = []
    const beads = []
    for (const p of positions) {
      const tower = new THREE.CylinderGeometry(0.35, 0.7, 11, 8)
      tower.translate(p.x, 5.5, p.z)
      statics.push(tinted(tower, palette.habitat))
      const base = new THREE.BoxGeometry(2.4, 0.6, 2.4)
      base.translate(p.x, 0.3, p.z)
      statics.push(tinted(base, palette.concrete))
      const yoke = new THREE.BoxGeometry(0.5, 1.2, 0.5)
      yoke.translate(p.x, 11.6, p.z)
      statics.push(tinted(yoke, palette.cobalt))
      const bead = new THREE.SphereGeometry(0.18, 8, 6)
      bead.translate(p.x, 12.2, p.z + 0.42)
      beads.push(bead)
    }
    const towerMesh = new THREE.Mesh(mergeGeometries(statics), flat('#FFFFFF', { vertexColors: true }))
    towerMesh.name = 'dish-towers'
    world.addStatic(towerMesh, { reveal: false })

    this.lampMaterial = lampMaterial().clone()
    this.lampMaterial.emissive.set(palette.terracotta)
    this.lamps = new THREE.Mesh(mergeGeometries(beads), this.lampMaterial)
    this.lamps.name = 'dish-lamps'
    world.addStatic(this.lamps, { reveal: false, cast: false })

    this.dishes = new THREE.InstancedMesh(dishGeometry(), flat(palette.habitat), positions.length)
    this.dishes.frustumCulled = false
    this.dishes.name = 'dishes'
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3(1, 1, 1)
    this._slew(0)
    world.addStatic(this.dishes, { reveal: false })
  }

  _slew(t) {
    for (let i = 0; i < this.positions.length; i++) {
      const p = this.positions[i]
      this._e.set(-(0.95 + 0.1 * Math.sin(t * 0.15 + i)), 0.5 * Math.sin(t * 0.08 + i * 0.9), 0, 'YXZ')
      this._q.setFromEuler(this._e)
      this._m.compose(this._p.set(p.x, PIVOT_Y, p.z), this._q, this._s)
      this.dishes.setMatrixAt(i, this._m)
    }
    this.dishes.instanceMatrix.needsUpdate = true
  }

  update(dt, elapsed) {
    this._slew(elapsed)
    this.lampMaterial.emissiveIntensity = (elapsed % 2) < 1 ? 1.6 : 0.15
  }
}
