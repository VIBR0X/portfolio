import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { flat, palette } from './Materials.js'
import { makeBoardTexture } from './Text.js'

const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 6)
const TILT = -Math.PI / 6 // 30° back, top away from the camera (which looks north, toward -z)

/**
 * A posted billboard: two ink posts, a cream panel and a crisp canvas face, tilted back 30°.
 * Faces +z by default (toward the camera). Returns { group, body, texture, redraw }.
 *
 * Options: x, z, yaw (radians, 0 = faces +z), width, height, bottom (y of the panel's bottom edge),
 *          title, subtitle, body[], footer, accent (strip colour), align, ppu, posts (bool), physics (bool)
 */
export function board(world, opts) {
  const {
    x = 0, z = 0, yaw = 0, width = 6, height = 3, bottom = 1.4,
    accent = palette.cobalt, posts = true, physics = true, ppu, entry = null, onClick = null,
  } = opts
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.rotation.y = yaw

  const texture = makeBoardTexture({
    ...opts,
    width, height,
    ppu: ppu ?? (world.experience?.quality === 'low' ? 72 : 96),
    background: palette.cream,
    titleColor: palette.ink,
    textColor: '#3E4160',
    accent,
    radius: 0.18,
  })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }))
  face.position.set(0, height / 2, 0.13)

  const panel = new THREE.Mesh(new RoundedBoxGeometry(width + 0.4, height + 0.4, 0.25, 2, 0.06), flat(palette.cream, { roughness: 0.9 }))
  panel.position.set(0, height / 2, 0)

  const pivot = new THREE.Group()
  pivot.position.y = bottom
  pivot.rotation.x = TILT
  pivot.add(panel, face)
  group.add(pivot)

  if (posts) {
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, flat(palette.ink))
      const h = bottom + 0.3
      post.scale.y = h
      post.position.set(sx * (width / 2 - 0.3), h / 2, -0.05)
      group.add(post)
    }
  }

  let body = null
  if (physics) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))
    const centre = new THREE.Vector3(0, bottom + height / 2, -0.15).applyQuaternion(q).add(new THREE.Vector3(x, 0, z))
    body = world.physics.box({ size: [width + 0.4, height + bottom + 0.4, 0.6], mass: 0, position: [centre.x, (bottom + height + 0.4) / 2, centre.z], sleepy: false })
    body.quaternion.set(q.x, q.y, q.z, q.w)
    body.updateAABB()
    body.userData = { kind: 'wall', tag: 'board' }
    world.physics.add(body)
  }

  world.addStatic(group)
  const action = onClick || (entry ? () => world.ui.togglePanel(entry) : null)
  if (action) world.addClickable(pivot, action, opts.title || '')
  return { group, body, texture, face }
}
