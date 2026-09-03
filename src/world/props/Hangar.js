import * as THREE from 'three'
import { flat, palette } from '../Materials.js'

/**
 * A Nissen-hut hangar you can drive into: a half-tube shell open at the front,
 * a back wall, a door frame, and solid side/back bodies (the mouth stays open).
 *
 * Centre is the middle of the floor; the mouth faces +z (toward the camera).
 */
export function hangar(world, { x, z, radius = 4.6, depth = 9, color = palette.sage }) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)

  // Half tube: upper half only (theta from π/2 through 3π/2), axis rotated onto z.
  const shellGeo = new THREE.CylinderGeometry(radius, radius, depth, 14, 1, true, Math.PI / 2, Math.PI)
  shellGeo.rotateX(Math.PI / 2)
  const shell = new THREE.Mesh(shellGeo, flat(color, { side: THREE.DoubleSide }))
  g.add(shell)

  const backGeo = new THREE.CircleGeometry(radius, 14, 0, Math.PI)
  const back = new THREE.Mesh(backGeo, flat(color, { side: THREE.DoubleSide }))
  back.position.z = -depth / 2
  g.add(back)

  // Door frame around the mouth
  const frameMat = flat(palette.ink)
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, radius, 0.3), frameMat)
    post.position.set(sx * (radius - 0.15), radius / 2, depth / 2)
    g.add(post)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(radius * 2 + 0.2, 0.5, 0.32), flat(palette.cobalt))
  lintel.position.set(0, radius + 0.2, depth / 2)
  g.add(lintel)

  world.addStatic(g)

  // Solid sides and back; the mouth is left open so the car can park inside.
  const bodies = []
  for (const sx of [-1, 1]) {
    const b = world.physics.box({ size: [0.6, radius, depth], mass: 0, position: [x + sx * (radius + 0.1), radius / 2, z], sleepy: false })
    b.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(b)
    bodies.push(b)
  }
  const backBody = world.physics.box({ size: [radius * 2, radius, 0.6], mass: 0, position: [x, radius / 2, z - depth / 2 - 0.2], sleepy: false })
  backBody.userData = { kind: 'wall', tag: 'wall' }
  world.physics.add(backBody)
  bodies.push(backBody)

  return { group: g, bodies, mouthZ: z + depth / 2, backZ: z - depth / 2 }
}

/**
 * Little cylinder-and-sphere person, merged into one geometry for instancing.
 * Sized and centred to match FIGURE_HEIGHT, with the origin at the middle of that height,
 * so it lines up exactly with a cannon Cylinder body of the same height.
 */
export const FIGURE_HEIGHT = 0.72

export function figureGeometry() {
  const half = FIGURE_HEIGHT / 2
  const headRadius = 0.15
  const bodyHeight = FIGURE_HEIGHT - headRadius * 2
  const body = new THREE.CylinderGeometry(0.17, 0.23, bodyHeight, 8)
  body.translate(0, -half + bodyHeight / 2, 0)
  const head = new THREE.SphereGeometry(headRadius, 8, 6)
  head.translate(0, half - headRadius, 0)
  return mergeSimple([body, head])
}

/** Minimal geometry merge for same-attribute buffer geometries. */
function mergeSimple(geometries) {
  const positions = []
  const normals = []
  for (const g of geometries) {
    const nonIndexed = g.index ? g.toNonIndexed() : g
    positions.push(...nonIndexed.attributes.position.array)
    normals.push(...nonIndexed.attributes.normal.array)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return geo
}
