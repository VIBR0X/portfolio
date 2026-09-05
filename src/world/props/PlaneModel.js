// src/world/props/PlaneModel.js
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, lampMaterial, palette, applyShadowFlags } from '../Materials.js'
import { labelMesh } from '../Text.js'

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Merge into one unindexed geometry: RoundedBox and Extrude are non-indexed while Box and Cylinder
 * are indexed, and `mergeGeometries` refuses to mix the two (it returns null).
 */
function merge(parts) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))
}

/** A cylinder strut whose axis runs from `a` to `b`, baked into world-local coordinates. */
function strut(a, b, radius) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(radius, radius, len, 6)
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize())
  const m = new THREE.Matrix4().compose(new THREE.Vector3().lerpVectors(a, b, 0.5), q, new THREE.Vector3(1, 1, 1))
  geo.applyMatrix4(m)
  return geo
}

/**
 * The one plane model, shared by the flyable `Plane` and the landmark at Experience.
 *
 * Local frame: +X right wing, +Y up, −Z nose — the frame `PlanePhysics` integrates in. The root
 * `group` is what the physics body drives; every part hangs off a child `shell` so the visual bank
 * and pitch exaggeration can be added on top of the body's true rotation without touching it.
 * Ten draw calls: body, trim, accent, ink, prop, prop disc, glazing, lamps, two registrations.
 *
 * Returns `{ group, shell, propHub, propDisc, lamps }`. The blade prop spins about Z (the thrust
 * axis); the disc is a translucent stand-in shown above 8 m/s while the blades are hidden.
 */
export function buildPlaneMesh({ registration = 'VT-VED' } = {}) {
  const group = new THREE.Group()
  group.name = 'plane'
  const shell = new THREE.Group()
  shell.name = 'plane-shell'
  group.add(shell)

  const cream = flat(palette.cream)
  const cobalt = flat(palette.cobalt)
  const terracotta = flat(palette.terracotta)
  const ink = flat(palette.ink)
  const glass = flat(palette.glass, { roughness: 0.15, transparent: true, opacity: 0.75 })

  // Cylinders and cones point +Y. rotateX(+π/2) sends +Y to +Z (the radiusTop end goes to the
  // tail); rotateX(−π/2) sends the apex to −Z (the nose).
  const body = []
  const fuselage = new THREE.CylinderGeometry(0.44, 0.72, 5.0, 10)
  fuselage.rotateX(Math.PI / 2)
  fuselage.translate(0, 0, 0.3)
  body.push(fuselage)
  const wing = new RoundedBoxGeometry(8.6, 0.16, 1.4, 2, 0.06)
  wing.translate(0, 1.12, -0.5)
  body.push(wing)
  const tailplane = new THREE.BoxGeometry(2.6, 0.12, 0.7)
  tailplane.translate(0, 0.32, 2.5)
  body.push(tailplane)
  // Fin: a trapezoid extruded 0.14 thick, turned to lie in the YZ plane with its base along +Z.
  const finShape = new THREE.Shape()
  finShape.moveTo(0, 0)
  finShape.lineTo(0.9, 0)
  finShape.lineTo(0.65, 1.25)
  finShape.lineTo(0.25, 1.25)
  finShape.closePath()
  const fin = new THREE.ExtrudeGeometry(finShape, { depth: 0.14, bevelEnabled: false })
  fin.rotateY(-Math.PI / 2)
  fin.translate(0.07, 0.38, 2.0) // +0.07 centres the 0.14 m extrusion on the fuselage axis
  body.push(fin)
  shell.add(new THREE.Mesh(merge(body), cream))

  const trim = []
  const cowl = new THREE.CylinderGeometry(0.74, 0.62, 0.7, 10)
  cowl.rotateX(Math.PI / 2)
  cowl.translate(0, 0, -2.5)
  trim.push(cowl)
  for (const sx of [-1, 1]) {
    const tip = new THREE.BoxGeometry(1.0, 0.18, 1.42)
    tip.translate(sx * 3.5, 1.12, -0.5)
    trim.push(tip)
    const tailTip = new THREE.BoxGeometry(0.5, 0.14, 0.72)
    tailTip.translate(sx * 1.05, 0.32, 2.5)
    trim.push(tailTip)
    const pant = new RoundedBoxGeometry(0.34, 0.5, 0.86, 2, 0.08)
    pant.translate(sx * 1.05, -0.55, -0.35)
    trim.push(pant)
  }
  const spine = new THREE.BoxGeometry(0.34, 0.12, 4.2)
  spine.translate(0, 0.7, 0.55)
  trim.push(spine)
  const finCap = new THREE.BoxGeometry(0.16, 0.28, 0.5)
  finCap.translate(0, 1.5, 2.45)
  trim.push(finCap)
  shell.add(new THREE.Mesh(merge(trim), cobalt))

  const accent = []
  for (const sx of [-1, 1]) {
    const flash = new THREE.BoxGeometry(0.42, 0.19, 1.42)
    flash.translate(sx * 2.2, 1.12, -0.5)
    accent.push(flash)
  }
  const rudderStripe = new THREE.BoxGeometry(0.16, 0.3, 0.55)
  rudderStripe.translate(0, 0.85, 2.35)
  accent.push(rudderStripe)
  shell.add(new THREE.Mesh(merge(accent), terracotta))

  const dark = []
  const spinner = new THREE.ConeGeometry(0.3, 0.6, 10)
  spinner.rotateX(-Math.PI / 2)
  spinner.translate(0, 0, -3.15)
  dark.push(spinner)
  for (const sx of [-1, 1]) {
    dark.push(strut(new THREE.Vector3(sx * 0.62, 0.18, -0.3), new THREE.Vector3(sx * 2.3, 1.04, -0.45), 0.05))
    const leg = new THREE.BoxGeometry(0.08, 0.5, 0.16)
    leg.translate(sx * 1.05, -0.5, -0.35)
    dark.push(leg)
    const tyre = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12)
    tyre.rotateZ(Math.PI / 2)
    tyre.translate(sx * 1.05, -0.75, -0.35)
    dark.push(tyre)
  }
  const noseLeg = new THREE.BoxGeometry(0.08, 0.36, 0.1)
  noseLeg.translate(0, -0.6, -2.3)
  dark.push(noseLeg)
  const noseTyre = new THREE.CylinderGeometry(0.24, 0.24, 0.18, 10)
  noseTyre.rotateZ(Math.PI / 2)
  noseTyre.translate(0, -0.81, -2.3)
  dark.push(noseTyre)
  shell.add(new THREE.Mesh(merge(dark), ink))

  // Hub and both blades spin together about Z, so they are one merged mesh rotated as a unit.
  const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8)
  hub.rotateX(Math.PI / 2)
  const propHub = new THREE.Mesh(merge([hub, new THREE.BoxGeometry(1.7, 0.14, 0.05), new THREE.BoxGeometry(0.14, 1.7, 0.05)]), ink)
  propHub.position.set(0, 0, -2.95)
  propHub.name = 'prop'
  shell.add(propHub)

  const discGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.02, 16)
  discGeo.rotateX(Math.PI / 2)
  const propDisc = new THREE.Mesh(discGeo, flat(palette.glass, { transparent: true, opacity: 0.5 }))
  propDisc.position.set(0, 0, -2.95)
  propDisc.visible = false
  propDisc.name = 'prop-disc'
  shell.add(propDisc)

  const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.16, 0.56, 1.7, 2, 0.12), glass)
  cabin.position.set(0, 0.82, -0.55)
  shell.add(cabin)

  // Nav beads at the wing tips and the tail beacon: one material of their own, never merged with
  // any other lamp (the material cache would tie them to whatever else flashes).
  const beads = []
  for (const sx of [-1, 1]) {
    const bead = new THREE.BoxGeometry(0.12, 0.1, 0.2)
    bead.translate(sx * 4.3, 1.12, -0.5)
    beads.push(bead)
  }
  const beacon = new THREE.SphereGeometry(0.08, 8, 6)
  beacon.translate(0, 1.66, 2.15)
  beads.push(beacon)
  const lamps = new THREE.Mesh(merge(beads), lampMaterial().clone())
  lamps.name = 'plane-lamps'
  shell.add(lamps)

  const reg = labelMesh(registration, { width: 1.6, height: 0.4, color: palette.ink, background: palette.cream, fontSize: 0.28, weight: 800 })
  for (const sx of [-1, 1]) {
    const l = reg.clone()
    l.position.set(sx * 0.74, 0.12, 0.9)
    l.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2
    shell.add(l)
  }

  applyShadowFlags(group)
  return { group, shell, propHub, propDisc, lamps }
}
