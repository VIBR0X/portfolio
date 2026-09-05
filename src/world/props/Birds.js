import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { flat, palette } from '../Materials.js'

const CENTRE = { x: 0, z: -104 }
const COUNT = 16

/** A shallow V of two wings, merged so the whole flock is one instanced draw call. */
function wingGeometry() {
  const a = new THREE.PlaneGeometry(0.55, 0.22)
  a.rotateY(0.35)
  a.translate(-0.25, 0, 0)
  const b = new THREE.PlaneGeometry(0.55, 0.22)
  b.rotateY(-0.35)
  b.translate(0.25, 0, 0)
  return mergeGeometries([a, b])
}

/**
 * Per-bird pose for the current time. Also decays `bird.scatter` toward zero, so a startled
 * flock drifts back to its orbit on its own. Pure, so it is testable without a scene.
 */
export function birdPose(bird, dt) {
  bird.elapsed = (bird.elapsed || 0) + dt
  bird.scatter = (bird.scatter || 0) * Math.exp(-dt / 1.2)
  const radius = 14 + (bird.i % 4) * 1.5 + bird.scatter
  const alt = 26 + (bird.i % 3) * 2 + bird.scatter * 0.3
  const speed = 0.25 + (bird.i % 5) * 0.03
  const a = bird.elapsed * speed + (bird.i / COUNT) * Math.PI * 2
  return { x: CENTRE.x + Math.cos(a) * radius, y: alt, z: CENTRE.z + Math.sin(a) * radius, heading: a + Math.PI / 2 }
}

/** Birds circling the control tower; they scatter from the horn or a low pass and regroup. */
export class Birds {
  constructor(world) {
    this.world = world
    this.mesh = new THREE.InstancedMesh(wingGeometry(), flat(palette.ink, { side: THREE.DoubleSide }), COUNT)
    this.mesh.frustumCulled = false
    this.birds = Array.from({ length: COUNT }, (_, i) => ({ i, scatter: 0, elapsed: (i * 0.7) % 6 }))
    world.addStatic(this.mesh, { reveal: false, cast: false })
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3(1, 1, 1)
  }

  scatter() {
    for (const b of this.birds) b.scatter = 1 + Math.random() * 3
  }

  update(dt, elapsed) {
    const { world } = this
    if (world.mode === 'plane') {
      const p = world.plane.position
      if (Math.hypot(p.x - CENTRE.x, p.z - CENTRE.z) < 16 && Math.abs(p.y - 27) < 8) this.scatter()
    }
    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i]
      const pose = birdPose(bird, dt)
      const flap = Math.sin(elapsed * 8 + i) * 0.5
      this._e.set(flap, pose.heading, 0)
      this._q.setFromEuler(this._e)
      this._m.compose(this._p.set(pose.x, pose.y, pose.z), this._q, this._s)
      this.mesh.setMatrixAt(i, this._m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
