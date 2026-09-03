import * as THREE from 'three'
import { Section } from './Section.js'
import { flat, palette } from '../Materials.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { signpost } from '../props/index.js'
import { InstancedProps } from '../props/InstancedProps.js'

/**
 * The hub. A six-armed signpost on the north roundabout tells you where everything is,
 * and the painted ring stripes tick like cat's eyes as you drive over them.
 */
export class CrossroadsSection extends Section {
  constructor(world, def) {
    super(world, def)
    const [cx, cz] = def.centre
    this.centre = { x: cx, z: cz }
    this.buildSignpost()
    this.buildDrums()
    this.buildPad()
    this.ringArmed = true
    this.wobble = 0
  }

  buildSignpost() {
    const { world } = this
    const { x, z } = this.centre
    const g = new THREE.Group()
    g.position.set(x, 0, z)

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.6), flat(palette.concrete))
    plinth.position.y = 0.3
    g.add(plinth)

    // Arm angles: local +x rotated by `angle` points at (cos a, -sin a) in (x, z).
    const post = signpost({
      height: 4.6,
      arms: [
        { text: 'SKILLS', angle: Math.PI / 2, color: palette.sage },
        { text: 'EDUCATION', angle: Math.PI / 2, color: palette.lamp },
        { text: 'EXPERIENCE', angle: Math.PI, color: palette.cobalt },
        { text: 'PROJECTS', angle: 0, color: palette.terracotta },
        { text: 'PLAYGROUND', angle: Math.atan2(-70, 52), color: palette.lamp },
        { text: 'CONTACT', angle: -Math.PI / 2, color: palette.terracotta },
      ],
    })
    post.position.y = 0.6
    this.post = post
    g.add(post)
    world.addStatic(g)

    const body = world.physics.cylinder({ radiusTop: 0.45, radiusBottom: 0.45, height: 5.2, mass: 0, position: [x, 2.6, z], sleepy: false })
    body.userData = { kind: 'wall', tag: 'wall' }
    world.physics.add(body)
  }

  /** A cluster of fuel drums off the roundabout, knockable, drawn in one instanced call. */
  buildDrums() {
    const { world } = this
    const rimTop = new THREE.TorusGeometry(0.5, 0.05, 4, 10).rotateX(Math.PI / 2).translate(0, 0.4, 0)
    const rimBottom = new THREE.TorusGeometry(0.5, 0.05, 4, 10).rotateX(Math.PI / 2).translate(0, -0.4, 0)
    const drumGeo = mergeGeometries([new THREE.CylinderGeometry(0.5, 0.5, 1.1, 10), rimTop, rimBottom])

    const spots = [[10, -38], [11.4, -38.6], [9.4, -39.2], [11, -37], [12.2, -39.4]]
    const bodies = spots.map(([x, z]) =>
      world.physics.cylinder({ radiusTop: 0.5, radiusBottom: 0.5, height: 1.1, segments: 10, mass: 1.6, position: [x, 0.55, z] }))
    this.drums = new InstancedProps(world, {
      geometry: drumGeo,
      material: flat(palette.mesa),
      bodies,
      tag: 'drum',
      shadowRadius: { rx: 0.55, rz: 0.55 },
      colors: [palette.mesa, palette.terracotta],
    })
    bodies.forEach((b) => this.track(b))
  }

  buildPad() {
    const area = this.world.addArea({
      x: 0, z: -22, width: 5, depth: 3, label: 'MAP',
      color: palette.cobalt,
      onInteract: () => this.world.ui.showModal('map'),
    })
    area.actionLabel = 'MAP'
  }

  update(dt) {
    const car = this.world.car.physics
    const { x, z } = this.centre
    const d = Math.hypot(car.position.x - x, car.position.z - z)

    // Bump the post: the arms rock for a moment.
    if (d < 1.6 && car.speed > 4 && this.wobble <= 0) {
      this.wobble = 0.35
      this.world.sounds.hit(0.5, 240, { partial: 2 })
    }
    if (this.wobble > 0) {
      this.wobble = Math.max(0, this.wobble - dt)
      this.post.rotation.z = Math.sin(this.wobble * 40) * this.wobble * 0.2
    } else if (this.post.rotation.z !== 0) {
      this.post.rotation.z = 0
    }

    // Cat's-eye ticks when crossing the painted rings (armed again once you leave).
    if (this.ringArmed && d > 5 && d < 8.2 && car.speed > 3) {
      this.ringArmed = false
      this.world.sounds.blip(1200)
    } else if (!this.ringArmed && (d > 10 || d < 4)) {
      this.ringArmed = true
    }
  }
}
