import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, palette } from './Materials.js'
import { makeBoardTexture } from './Text.js'

const TILT = -Math.PI / 6 // 30° back, top away from the camera (which looks north, toward -z)

/**
 * A posted sign: an ink plate with a printed cream face inset on it, tilted back 30°, on two ink
 * posts joined by a crossbar behind the plate, each on a foot plate. Faces +z by default (toward
 * the camera). Returns { group, body, texture, face }.
 *
 * The posts stop BEHIND the plate. They used to run to `bottom + 0.3` at z −0.05, straight through
 * the leaning face, and every board in the world carried two dark blots at its lower corners where
 * the post tops came out of the paper.
 *
 * Options: x, z, yaw (radians, 0 = faces +z), width, height, bottom (y of the plate's bottom edge),
 *          kicker (header band text), title, subtitle, body[], footer, accent (band colour), align,
 *          ppu, posts (bool), physics (bool), reserveBottom (metres of face to leave clear, for a
 *          counter mounted on the plate), entry / onClick.
 */
export function board(world, opts) {
  const {
    x = 0, z = 0, yaw = 0, width = 6, height = 3, bottom = 1.4,
    accent = palette.cobalt, posts = true, physics = true, ppu, entry = null, onClick = null,
    reserveBottom = 0,
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
    subtitleColor: palette.inkSoft,
    accent,
    action: !!(entry || onClick),
    reserveBottom,
    radius: 0.14,
  })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }))
  // 0.14: the plate's front face is at +0.11, and a 1 cm gap z-fought with it at 40 m. That was
  // invisible while the plate was cream too; on an ink plate it showed as ink flecks in the paper.
  face.position.set(0, height / 2, 0.14)

  // The plate is ink and 0.12 m proud of the face on every side, so the printed panel sits inside
  // a dark rim from any angle — a mounted sign, not a floating card.
  const panel = new THREE.Mesh(new RoundedBoxGeometry(width + 0.24, height + 0.24, 0.22, 2, 0.05), flat(palette.ink, { roughness: 0.9 }))
  panel.position.set(0, height / 2, 0)

  const pivot = new THREE.Group()
  pivot.position.y = bottom
  pivot.rotation.x = TILT
  pivot.add(panel, face)
  group.add(pivot)

  if (posts) {
    // Posts, crossbar and feet in one mesh: a posted board is still three draw calls per pass.
    // Everything sits at z −0.28, inside the 0.22 m plate's volume at the height where it meets it,
    // so nothing comes out of the face.
    const h = bottom + 0.1
    const px = width / 2 - 0.3
    const parts = []
    for (const sx of [-1, 1]) {
      parts.push(new THREE.CylinderGeometry(0.11, 0.11, h, 8).translate(sx * px, h / 2, -0.28))
      parts.push(new THREE.BoxGeometry(0.5, 0.06, 0.5).translate(sx * px, 0.03, -0.28))
    }
    parts.push(new THREE.BoxGeometry(width - 0.6, 0.12, 0.12).translate(0, bottom - 0.02, -0.28))
    const postMesh = new THREE.Mesh(mergeGeometries(parts), flat(palette.ink))
    postMesh.name = 'board-posts'
    group.add(postMesh)
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
  if (action) world.addClickable(pivot, action, { title: opts.title || '', sub: opts.subtitle || '', hint: 'OPEN' })
  return { group, body, texture, face }
}
