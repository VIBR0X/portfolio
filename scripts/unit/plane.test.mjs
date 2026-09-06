import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { fakeWorld } from './fixture.mjs'
import { buildPlaneMesh } from '../../src/world/props/PlaneModel.js'
import { PLANE } from '../../src/world/PlanePhysics.js'
import { BlobShadows } from '../../src/world/Shadows.js'

test('the plane model spans the wing along X and the fuselage along Z with the nose at −Z', () => {
  const { group, propHub } = buildPlaneMesh()
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())
  assert.ok(size.x >= 8.4 && size.x <= 8.8, `wingspan ${size.x}`)
  assert.ok(size.z >= 6.0 && size.z <= 7.2, `length ${size.z}`)
  assert.ok(size.y >= 2.5 && size.y <= 2.8, `height ${size.y}`)
  assert.ok(propHub.position.z < -2.5, 'the propeller is at the nose end')
  assert.ok(Math.abs(box.min.y + 1.05) < 0.02, `tyres rest on the ground: min y ${box.min.y}`)
})

test('the plane in the world keeps the collider box and draws in at most 10 calls', () => {
  const { world } = fakeWorld()
  const meshes = []
  world.plane.group.traverse((o) => { if (o.isMesh) meshes.push(o) })
  assert.ok(meshes.length <= 12, `${meshes.length} meshes`)
  assert.equal(world.plane.body.shapes[0].halfExtents.z, 3.2)
})

test('the builder returns the shell, the prop, the disc and the lamps, and the shell holds every part', () => {
  const m = buildPlaneMesh()
  assert.ok(m.shell.parent === m.group, 'shell is a child of the root')
  assert.equal(m.group.children.length, 1, 'the root holds only the shell')
  assert.ok(m.propHub.parent === m.shell && m.propDisc.parent === m.shell && m.lamps.parent === m.shell)
  assert.equal(m.propDisc.visible, false, 'the disc starts hidden')
  assert.ok(Math.abs(m.propDisc.position.z + 2.95) < 1e-9)
})

test('above 8 m/s the blade prop hides and the disc shows; the shell banks 20% more than the body', () => {
  const { world } = fakeWorld()
  const plane = world.plane
  plane.physics.speed = 5
  plane.update(1 / 60, { throttle: 0, steer: 0, boost: false, brake: false })
  assert.equal(plane.propHub.visible, true)
  assert.equal(plane.propDisc.visible, false)
  plane.physics.speed = 20
  plane.physics.airborne = true
  plane.physics.bank = 0.5
  plane.physics.pitch = 0.3
  plane.update(1 / 60, { throttle: 1, steer: 0, boost: false, brake: false })
  assert.equal(plane.propHub.visible, false)
  assert.equal(plane.propDisc.visible, true)
  assert.ok(Math.abs(plane.shell.rotation.z - plane.physics.bank * 0.2) < 1e-9, `shell bank ${plane.shell.rotation.z}`)
  assert.ok(plane.physics.vy > 1, `climbing (vy ${plane.physics.vy})`)
  assert.ok(Math.abs(plane.shell.rotation.x - 0.15) < 1e-9, `shell pitch ${plane.shell.rotation.x}`)
  assert.equal(PLANE.ceiling, 34)
})

test('the altitude shadow cue spreads and lightens the plane disc as it climbs', () => {
  const shadows = new BlobShadows(new THREE.Scene(), { max: 4 })
  const generic = { position: new THREE.Vector3(0, 0, 0) }
  const cued = { position: new THREE.Vector3(5, 0, 0) }
  shadows.add(generic, { rx: 2, rz: 2 })
  shadows.add(cued, { rx: 2, rz: 2, altitudeCue: true })
  const scaleOf = (i) => { const m = new THREE.Matrix4(); shadows.mesh.getMatrixAt(i, m); return new THREE.Vector3().setFromMatrixScale(m).x }
  const alphaOf = (i) => shadows.alpha.array[i]
  shadows.update()
  assert.ok(Math.abs(scaleOf(0) - 2) < 1e-9 && Math.abs(scaleOf(1) - 2) < 1e-9, 'both full size on the ground')
  assert.ok(alphaOf(0) === 1 && alphaOf(1) === 1, 'both fully opaque on the ground')
  generic.position.y = 20
  cued.position.y = 20
  shadows.update()
  assert.ok(Math.abs(scaleOf(0) - 2 * 0.66) < 1e-6, `generic shrinks to 0.66: ${scaleOf(0)}`)
  assert.equal(alphaOf(0), 1, 'the generic disc never uses the per-instance alpha')
  // Spec §4 feel #2, retuned for the 0.16 desktop strength: scale · (1 + y/60), alpha clamp(1 − y/80, 0.5, 1).
  assert.ok(Math.abs(scaleOf(1) - 2 * (1 + 20 / 60)) < 1e-6, `cued spreads: ${scaleOf(1)}`)
  assert.ok(Math.abs(alphaOf(1) - 0.75) < 1e-6, `cued lightens: ${alphaOf(1)}`)
  cued.position.y = 34
  shadows.update()
  assert.ok(scaleOf(1) > 2.9, `wider still at the ceiling: ${scaleOf(1)}`)
  assert.ok(Math.abs(alphaOf(1) - 0.575) < 1e-6, `still readable at the ceiling: ${alphaOf(1)}`)
  cued.position.y = 200
  shadows.update()
  assert.ok(Math.abs(alphaOf(1) - 0.5) < 1e-6, `alpha floors at 0.5: ${alphaOf(1)}`)
})

test('the blob pool carries a per-instance alpha attribute the shader can read', () => {
  const shadows = new BlobShadows(new THREE.Scene(), { max: 3 })
  const a = shadows.mesh.geometry.getAttribute('aAlpha')
  assert.ok(a && a.isInstancedBufferAttribute, 'aAlpha is an instanced attribute')
  assert.equal(a.count, 3)
  // The patch has to reach a chunk that exists in the compiled MeshBasic shaders.
  const shader = { vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' }
  shadows.mesh.material.onBeforeCompile(shader)
  assert.match(shader.vertexShader, /attribute float aAlpha;[\s\S]*vAlpha = aAlpha;/)
  assert.match(shader.fragmentShader, /varying float vAlpha;[\s\S]*diffuseColor\.a \*= vAlpha;/)
})

test('boarding hides the car blob shadow and hopping out brings it back', () => {
  const { world } = fakeWorld()
  const car = world.shadows.items.find((i) => i.target === world.car.physics.chassisBody)
  assert.ok(car, 'the car has a blob shadow')
  assert.equal(car.enabled, true)
  world.boardPlane()
  assert.equal(world.car.group.visible, false, 'the car is hidden while flying')
  assert.equal(car.enabled, false, 'and so is its blob — no ghost stain on the hardstand')
  world.plane.physics.speed = 0
  world.exitPlane()
  assert.equal(world.mode, 'car')
  assert.equal(car.enabled, true, 'the blob comes back with the car')
})

test('hopping out parks the car clear of the wingspan on the plane\'s own starboard side', () => {
  const { world } = fakeWorld()
  const halfSpan = 4.3
  for (const yaw of [0, 0.9, Math.PI / 2, 2.4, -1.7]) {
    world.boardPlane()
    world.plane.teleport(12, -40, yaw)
    world.plane.physics.speed = 0
    world.exitPlane()
    const p = world.plane.position
    const c = world.car.physics.position
    const dx = c.x - p.x
    const dz = c.z - p.z
    // Lateral offset in the plane's frame: right = (cos yaw, 0, −sin yaw), nose = (−sin yaw, 0, −cos yaw).
    const lateral = dx * Math.cos(yaw) - dz * Math.sin(yaw)
    const along = -dx * Math.sin(yaw) - dz * Math.cos(yaw)
    assert.ok(lateral > halfSpan + 1, `yaw ${yaw}: parked ${lateral.toFixed(2)} m to starboard, clear of the ${halfSpan} m half-span`)
    assert.ok(Math.abs(along) < 0.01, `yaw ${yaw}: alongside the plane, not fore or aft (${along.toFixed(2)})`)
    assert.ok(Math.abs(world.car.physics.yaw - yaw) < 1e-6, 'the car keeps the plane heading')
  }
})

test('a crash and hopping out both abandon the air-race lap so the HUD chip cannot stick', () => {
  const { world } = fakeWorld()
  const chips = []
  world.ui.setChip = (k, v) => chips.push([k, v])
  const arm = () => { world.airRace.lapActive = true; world.airRace.lapT = 18.5; world.airRace.nextIndex = 1 }
  const clear = () => world.airRace.lapActive === false && world.airRace.lapT === 0 && world.airRace.nextIndex === 0

  world.boardPlane()
  arm()
  world.crashPlane()
  assert.ok(clear(), 'a crash abandons the lap')
  assert.deepEqual(chips.at(-1), ['lap', null], 'and clears the chip')

  arm()
  chips.length = 0
  world.plane.physics.speed = 0
  world.exitPlane()
  assert.equal(world.mode, 'car')
  assert.ok(clear(), 'hopping out abandons the lap')
  assert.ok(chips.some(([k, v]) => k === 'lap' && v === null), 'and clears the chip')
})

test('the plane dust the world emits is decimetre-scale, not the 1 cm emit default', () => {
  const { world } = fakeWorld()
  const sizes = []
  world.particles.emit = (p, opts = {}) => sizes.push(opts.size ?? 0.12)
  world.mode = 'plane'
  // Rolling fast on the ground: a puff off each main wheel.
  world.plane.physics.speed = 12
  world.plane.physics.airborne = false
  world._wheelDustT = 0.2
  world.update(1 / 60, 0)
  assert.ok(sizes.length >= 2, `two wheel puffs, got ${sizes.length}`)
  // Lift-off and touchdown bursts.
  world.plane.update = () => ({ justLifted: true, justLanded: true })
  world.update(1 / 60, 0)
  assert.ok(sizes.length >= 4, 'the bursts fire too')
  // Particles scales an IcosahedronGeometry(0.09) by `size`, so this is the puff radius in metres.
  for (const s of sizes) assert.ok(s * 0.09 >= 0.1, `puff radius ${(s * 0.09).toFixed(3)} m is visible from the chase camera`)
})

test('the tail reads terracotta from astern and the canopy stays on the blue side of cream', () => {
  const { shell } = buildPlaneMesh()
  shell.updateMatrixWorld(true)
  const meshes = shell.children.filter((c) => c.isMesh)
  const hex = (m) => m.material.color.getHexString()
  const hitHex = (h) => h.object.material.color.getHexString()

  // A ray straight up the fuselage from behind, at fin height: the first thing it meets has to be
  // the rudder, not the cream fin. A stripe buried inside the fin showed no red from the chase camera.
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0.85, 9), new THREE.Vector3(0, 0, -1), 0, 20)
  const hit = ray.intersectObjects(meshes, false)[0]
  assert.ok(hit, 'the ray meets the tail')
  assert.equal(hitHex(hit), 'e07a5f', `first surface astern is terracotta, got #${hitHex(hit)}`)
  assert.ok(hit.point.z > 2.82, `and it owns the trailing edge outright (z ${hit.point.z.toFixed(3)})`)

  // The rudder has to stand proud of the 0.14 m fin, or it z-fights instead of showing.
  const acrossRay = new THREE.Raycaster(new THREE.Vector3(2, 0.85, 2.75), new THREE.Vector3(-1, 0, 0), 0, 20)
  const side = acrossRay.intersectObjects(meshes, false)[0]
  assert.equal(hitHex(side), 'e07a5f', 'the fin side at the rudder is terracotta too')
  assert.ok(side.point.x > 0.075, `proud of the fin's 0.07 half-thickness (x ${side.point.x.toFixed(3)})`)

  // Glazing: the cabin must not push up through the wing, and its tint must not be greener than cream.
  const cabin = meshes.find((m) => m.material.transparent && m.material.opacity > 0.6 && m.position.y > 0.5)
  assert.ok(cabin, 'found the cabin')
  cabin.geometry.computeBoundingBox()
  const top = cabin.geometry.boundingBox.max.y + cabin.position.y
  assert.ok(top <= 1.041, `cabin top ${top.toFixed(3)} sits on the 1.04 wing underside, not through it`)
  const c = cabin.material.color
  assert.ok(c.b > c.g, `canopy tint #${hex(cabin)} stays bluer than it is green`)
})
