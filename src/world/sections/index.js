/**
 * Registry of world sections. Each section module exports a class with:
 *   constructor(world, { x, z })
 *   optional update(dt, elapsed)
 *   optional map: { label, hint, color, x, z, yaw }   – entry in the teleport map
 * Sections are filled in from the design spec.
 */
export function buildSections(world) {
  // Populated by the section modules (see docs/superpowers/specs).
  void world
}
