import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, palette } from '../Materials.js'
import { labelMesh } from '../Text.js'

/**
 * A Nissen-hut hangar you can drive into: a half-tube shell open at the front,
 * a back wall, a door frame, and solid side/back bodies (the mouth stays open).
 *
 * Centre is the middle of the floor; the mouth faces +z (toward the camera).
 */
export function hangar(world, { x, z, radius = 4.6, depth = 9, color = palette.sage, number = 0 }) {
  const g = new THREE.Group()
  g.name = 'hangar' // drive-in shell: solid sides and back, open mouth, by design
  g.position.set(x, 0, z)

  // The shell, back wall and corrugation ribs all share one material, so they are built as
  // geometry and merged into a single mesh. Four hangars are built from this function, so every
  // mesh saved here is four draw calls saved in the scene (plus their shadow and AO passes).
  const shellParts = []
  const shellGeo = new THREE.CylinderGeometry(radius, radius, depth, 14, 1, true, Math.PI / 2, Math.PI)
  shellGeo.rotateX(Math.PI / 2)
  shellParts.push(shellGeo)
  const backGeo = new THREE.CircleGeometry(radius, 14, 0, Math.PI)
  backGeo.translate(0, 0, -depth / 2)
  shellParts.push(backGeo)
  for (let i = 1; i <= 5; i++) {
    const arc = new THREE.TorusGeometry(radius, 0.05, 4, 12, Math.PI)
    arc.rotateY(Math.PI / 2)
    arc.translate(0, 0, -depth / 2 + (depth * i) / 6)
    shellParts.push(arc)
  }
  g.add(new THREE.Mesh(mergeGeometries(shellParts), flat(color, { side: THREE.DoubleSide })))

  // Ink group: door posts, door handles and the vent cap.
  const inkParts = []
  for (const sx of [-1, 1]) {
    const post = new THREE.BoxGeometry(0.3, radius, 0.3)
    post.translate(sx * (radius - 0.15), radius / 2, depth / 2)
    inkParts.push(post)
    const handle = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6)
    handle.rotateX(Math.PI / 2)
    handle.translate(sx * 1.5, radius * 0.45, depth / 2 + 0.04)
    inkParts.push(handle)
  }
  const ventCap = new THREE.ConeGeometry(0.34, 0.28, 8)
  ventCap.translate(0, radius + 0.39, -depth / 4)
  inkParts.push(ventCap)
  g.add(new THREE.Mesh(mergeGeometries(inkParts), flat(palette.ink)))

  // Concrete group: the lintel over the mouth and the vent body.
  const concreteParts = []
  const ventBody = new THREE.CylinderGeometry(0.26, 0.26, 0.45, 8)
  ventBody.translate(0, radius + 0.05, -depth / 4)
  concreteParts.push(ventBody)
  g.add(new THREE.Mesh(mergeGeometries(concreteParts), flat(palette.concrete)))

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(radius * 2 + 0.2, 0.5, 0.32), flat(palette.cobalt))
  lintel.position.set(0, radius + 0.2, depth / 2)
  g.add(lintel)

  // Wall lamp beside the mouth.
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.18), flat(palette.cream, { emissive: '#ffe1a1', emissiveIntensity: 0.9 }))
  lamp.position.set(radius - 0.35, radius * 0.72, depth / 2 - 0.05)
  g.add(lamp)

  // Hangar number on the lintel.
  if (number) {
    const num = labelMesh(String(number), { width: 0.9, height: 0.7, color: palette.cream, fontSize: 0.46, weight: 900 })
    num.position.set(0, radius + 0.2, depth / 2 + 0.18)
    g.add(num)
  }

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
