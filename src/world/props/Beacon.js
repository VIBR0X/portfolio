import * as THREE from 'three'
import { lampMaterial, palette } from '../Materials.js'

/**
 * A relay beacon: one lamp bead with its own material, `on` seconds lit every `period` seconds from
 * `phase`. Separate meshes on purpose — instanceColor multiplies diffuse only, so per-item blinking
 * needs a material each. Returns the mesh; registers itself as an updatable.
 */
export function relayBeacon(world, { x, y, z, phase = 0, period = 2, on = 0.15 }) {
  const mat = lampMaterial().clone()
  mat.emissive.set(palette.terracotta)
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat)
  mesh.position.set(x, y, z)
  world.addStatic(mesh, { reveal: false, cast: false })
  world.addUpdatable({ update(dt, elapsed) { mat.emissiveIntensity = ((elapsed + phase) % period) < on ? 1.6 : 0.15 } })
  return mesh
}
