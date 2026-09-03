import * as THREE from 'three'
import { textMesh } from '../Text.js'

/**
 * A row of knockable 3D letters. Each letter is a Group whose origin sits at the centre of its
 * bounding box (so it can be driven directly by a cannon Box body of the same extents).
 *
 * Returns [{ group, body, char }] — pass each to world.addDynamic(group, body, { tag: 'letter' }).
 */
export function letterRow(world, text, { z = 0, size = 2.2, depth = 0.8, color, gap = 0.45, mass = 4, centreX = 0 } = {}) {
  const chars = [...text]
  const built = chars.map((char) => {
    const mesh = textMesh(char, { size, depth, bevel: false, curveSegments: 3, color })
    return { char, mesh, size: mesh.userData.size }
  })
  const total = built.reduce((sum, b) => sum + b.size.width, 0) + gap * (built.length - 1)
  let x = centreX - total / 2

  return built.map(({ char, mesh, size: s }) => {
    const cx = x + s.width / 2
    x += s.width + gap

    const group = new THREE.Group()
    mesh.position.y = -s.height / 2
    group.add(mesh)
    group.position.set(cx, s.height / 2, z)

    const body = world.physics.box({
      size: [s.width, s.height, Math.max(s.depth, 0.4)],
      mass,
      position: [cx, s.height / 2, z],
    })
    body.linearDamping = 0.1
    body.angularDamping = 0.3
    return { group, body, char }
  })
}
