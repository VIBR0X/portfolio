import * as THREE from 'three'
import { CANNON } from '../../core/Physics.js'
import { flat, palette } from '../Materials.js'
import { InstancedProps } from './InstancedProps.js'

const WIND = -8 // m/s² westward, applied as a force scaled by each body's mass

/**
 * Wraps a body that has drifted past the west wall back to the east spawn strip, keeping its
 * velocity so it simply keeps rolling. Pure, so it is testable without a scene.
 */
export function wrapTumbleweed(body, extents, rng = Math.random) {
  if (body.position.x >= extents.x0) return false
  body.position.x = extents.x1 - 4 - rng() * 8
  body.position.z = extents.z0 + rng() * (extents.z1 - extents.z0)
  return true
}

/** Tumbleweeds blowing west across the open desert; knock one hard enough and it bursts. */
export class TumbleweedField {
  constructor(world, { count = world.experience.quality === 'low' ? 6 : 10 } = {}) {
    this.world = world
    const bodies = []
    for (let i = 0; i < count; i++) {
      const x = world.extents.x1 - 4 - (i % 3) * 4
      const z = world.extents.z0 + (world.extents.z1 - world.extents.z0) * ((i + 0.5) / count)
      const body = world.physics.sphere({ radius: 0.6, mass: 3, position: [x, 0.6, z] })
      body.angularDamping = 0.1
      body.linearDamping = 0.02
      bodies.push(body)
    }
    this.bodies = bodies
    this.instanced = new InstancedProps(world, {
      geometry: new THREE.IcosahedronGeometry(0.6, 1),
      material: flat(palette.mesa, { roughness: 1 }),
      bodies,
      tag: 'tumbleweed',
      shadowRadius: { rx: 0.6, rz: 0.6 },
    })
    for (const b of bodies) world.physics.listenImpacts(b, 6, { tag: 'tumbleweed' })

    world.physics.on('impact', ({ body, target, tag }) => {
      if (tag !== 'tumbleweed') return
      const b = bodies.includes(body) ? body : bodies.includes(target) ? target : null
      if (!b) return
      this.pop(b)
    })
    this._force = new CANNON.Vec3()
  }

  /** Burst of chaff, then the weed reappears on the east strip to blow across again. */
  pop(body) {
    const { world } = this
    world.particles?.emit(new THREE.Vector3(body.position.x, body.position.y, body.position.z), {
      count: 14, color: '#D4A373', spread: 1.2, life: 0.5, size: 0.1,
    })
    world.sounds.hit(0.5, 300, { noise: true })
    body.position.x = world.extents.x1 - 4 - Math.random() * 8
    body.position.z = world.extents.z0 + Math.random() * (world.extents.z1 - world.extents.z0)
    body.velocity.setZero()
    body.angularVelocity.setZero()
  }

  update() {
    const { world } = this
    const focus = world.camera?.smoothTarget
    for (const b of this.bodies) {
      // Only simulate the ones anywhere near the visitor; the rest sleep at the world's edge.
      if (focus && Math.hypot(b.position.x - focus.x, b.position.z - focus.z) > 90) {
        if (b.sleepState !== CANNON.Body.SLEEPING) b.sleep()
        continue
      }
      if (b.sleepState === CANNON.Body.SLEEPING) b.wakeUp()
      // No second argument: cannon-es defaults the point to the body's own centre of mass, so
      // this is pure linear wind with no torque. A world position there would be read as a local
      // offset and spin the weed wildly.
      this._force.set(WIND * b.mass, 0, 0)
      b.applyForce(this._force)
      wrapTumbleweed(b, world.extents)
    }
  }
}
