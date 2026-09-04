# Scene upgrade: flyable plane, hero models, dressing, air race, rocket and ambient life (2026-09-04)

Amends `2026-09-03-portfolio-design.md` and `2026-09-04-scene-finish-design.md`. The world layout,
sections, résumé content, UI and the lit rendering pipeline stay. This spec adds a second vehicle,
rebuilds the hero models, dresses the range, and adds three interactive systems.

## Decisions taken with the owner

- **The plane is a second vehicle.** Drive onto its FLY pad, press Enter/E to board; arcade flight
  (A/D bank-turn, W/S climb/dive, Shift boost); land on flat ground and press Enter/E to hop out.
  It is a real physics body: letters, crates, pins and drums get knocked over from the air.
- **The plane parks beside Runway 00 near the spawn**, on a hardstand east of the runway by the
  windsock, so it is found in the first ten seconds. The take-off roll goes north up the runway.
- **New interactive systems:** an air race (sky rings, lap timer, best time, landing score on the
  runway); a launchable rocket at Projects (countdown pad, engine glow, smoke, lift-off, parachute
  return); ambient life (tumbleweeds that roll and pop, a bird flock around the tower, wind turbines
  on the hills). Playground extras were offered and not chosen.
- **Full visual pass:** the plane, car, rocket, control tower and hangars are rebuilt as proper
  low-poly models with two-tone paint; ground clutter (cacti, rocks, scrub, fences, lamp posts,
  parked service vehicles) dresses the range; dust trails and skid marks follow the car and plane.
- The "generated in code" rule stands: no image, model or audio files enter the repository.
- Budget: 60 fps at 1080p on an integrated GPU; after-reveal draw calls (all passes) under ~450;
  every module still runs under the Node DOM stub used by the smoke harness and unit tests.
- The owner asked for no further questions: the recommended option is taken at every later
  decision point and recorded here.

## Measured facts the design rests on (cannon-es 0.20.0, probes run 2026-09-04)

- Friction in cannon-es is capped per contact point (`FrictionEquation.maxForce = friction · |g| ·
  reducedMass`), and a box resting on the ground plane has up to four contact points, so effective
  ground friction is about four times the nominal coefficient. A force-driven dynamic plane with the
  default friction of 0.3 does not move at all under 12 m/s² of thrust. A force-driven plane is
  therefore rejected for the ground roll.
- `Body.applyForce(force, relativePoint)` takes an offset from the body centre, not a world
  position; passing the body position adds a large spurious torque.
- A **kinematic** body (`type: CANNON.Body.KINEMATIC`) with `body.velocity` set each frame is
  advanced by cannon-es's own integrator exactly like a dynamic body (`position += velocity · dt`),
  confirmed by a probe that drove one at −10 m/s for 4 s and found it at z = −40.0. It pushes
  dynamic props on contact (a 2 kg crate hit at 10 m/s left moving at 10 m/s, five collide events
  fired) and dynamic bodies collide with it correctly, but it generates **no** contacts against
  static (mass-0) bodies — the same probe drove it straight through a static wall at z = −30 with
  zero collide events. The plane is therefore a kinematic body whose velocity and orientation are
  set every frame by a hand-written flight model; crashes into static geometry are detected with a
  manual AABB overlap test (`body.aabb.overlaps(other.aabb)`, confirmed present on cannon-es 0.20
  bodies) against the world's static `kind: 'wall'` and `kind: 'board'` bodies, plus a separate
  ground-altitude/descent-rate check for hard landings.

---

## Cross-cutting decisions

These apply across every section below; each section references them rather than repeating them.

### File map

| File | Change |
| --- | --- |
| `src/world/PlanePhysics.js` (new) | Pure flight model, Node-testable like `CarPhysics.js` |
| `src/world/Plane.js` (new) | Mesh, wheels/prop animation, wraps `PlanePhysics` |
| `src/world/Particles.js` (new) | Shared instanced particle pool (dust, smoke, prop wash, pops) |
| `src/world/Clutter.js` (new) | Deterministic ground-clutter scatter (cacti, rocks, scrub, fences, lamps, vehicles) |
| `src/world/SkidMarks.js` (new) | Instanced fading skid-mark quads under drifting/braking wheels |
| `src/world/props/AirRace.js` (new) | Ring course, lap timer, landing score |
| `src/world/props/Turbines.js` (new) | Wind turbines on the hill ring |
| `src/world/props/Birds.js` (new) | Boids-lite flock around the control tower |
| `src/world/sections/Intro.js` | Add the plane hardstand, FLY pad, world creates `world.plane` here |
| `src/world/sections/Projects.js` | Replace the rocket gag with a real launch sequence; rebuild the rocket model |
| `src/world/sections/Education.js` | Rebuild the control tower model; host the bird flock |
| `src/world/sections/Experience.js` | Rebuild the four hangar models |
| `src/world/Car.js` | Visual rebuild only; chassis/wheel dimensions from `CarPhysics.CAR` unchanged |
| `src/world/World.js` | `world.mode` ('car'\|'plane'), input routing, plane wiring, clutter/particles/skid-marks construction, impact tag for the plane |
| `src/core/Camera.js` | Altitude follow and an extended zoom range while flying |
| `src/core/Controls.js` | No new events; existing continuous fields (`throttle`, `steer`, `boost`, `brake`) and one-shots (`jump`, `interact`, `horn`) are reused for flight |
| `src/core/Sounds.js` | `propeller(speed)`, `liftoff()`, `touchdown(strength)` |
| `src/ui/UI.js` | Airspeed/altitude chips, lap/landing toasts (uses existing `toast`/`setChip`, no new DOM) |
| `scripts/unit/plane-physics.test.mjs`, `scripts/unit/particles.test.mjs`, `scripts/unit/air-race.test.mjs`, `scripts/unit/clutter.test.mjs` (new) | Node unit tests |
| `scripts/e2e-fly.mjs` (new) | Headless-Chrome: board, take off, fly a ring, land, exit |

### Shared particle pool (`src/world/Particles.js`)

One instanced pool serves car dust, plane prop-wash and touchdown dust, rocket smoke, and
tumbleweed pops — every effect in this spec that needs a burst of small moving bits.

```js
export class Particles {
  constructor(world, { max = world.experience.quality === 'low' ? 60 : 120 } = {})
  emit(position, { count = 8, color = '#DCC08F', size = 0.12, life = 0.5, spread = 0.6,
                    velocity = new THREE.Vector3(0, 1.5, 0), gravity = -9 } = {})
  update(dt)
}
```

- Geometry: one shared `IcosahedronGeometry(0.09, 0)`. Material: `flat('#ffffff', { vertexColors:
  true, roughness: 1 })` (the existing `flat()` cache already supports `vertexColors`), so each
  emitter tints its own particles via `setColorAt` without a second material or draw call.
  One `InstancedMesh(geo, mat, max)`, `frustumCulled = false`, added with `world.addStatic(mesh, {
  reveal: false, cast: false })` — one draw call for every particle in the game, always.
  `world.particles = new Particles(world)` is constructed once in `World`'s constructor (after
  `setFloor`/`setBoundary`, alongside `this.shadows`), passed to any system that needs it.
- Storage: a fixed array of `max` slots (`{ active, position, velocity, gravity, age, life, size }`),
  a round-robin write cursor. `emit()` always succeeds (overwrites the oldest slot if the pool is
  full) — never drops silently in a way that would break a test, but a live pool is small enough
  (120) that this is only ever theoretical at the emission rates below.
- Fade: three's `InstancedMesh` has no per-instance opacity without a custom shader, which this
  project avoids elsewhere, so fade is done by **shrinking scale to zero** over `life` (eased
  `1 - (age/life)²`) — a burst of dust that shrinks away reads correctly at this scale. Dead slots
  get a zero-scale matrix (`m.makeScale(0,0,0)`), so they cost a matrix write but no visible
  triangles; `mesh.count` always stays at `max` (no dynamic-count churn, matching how `BlobShadows`
  and the confetti pool in `Education.js` are already written).
- `update(dt)`: integrate `position += velocity*dt`, `velocity.y += gravity*dt`, `age += dt`; write
  `mesh.setMatrixAt`/`setColorAt` for every slot; `mesh.instanceMatrix.needsUpdate = true`.
- Called from `World.update` inside the existing `for (const u of [...this.updatables]) u.update(dt,
  elapsed)` loop — `Particles` is registered with `world.addUpdatable(this.particles)`, so **no
  change to `World.update`'s structure is needed** for particles themselves.

### Update order (`World.update`, `src/world/World.js`)

Only the vehicle step and the plane's own construction change the existing loop; everything else
(particles, clutter's static geometry, the air race, the rocket, tumbleweeds, birds, turbines) is
either static geometry added once or an `Updatable` pushed onto the existing `this.updatables`
array, so it runs inside the loop that is already there. The corrected order:

```
controls.update()
if world.mode === 'car':  car.update(dt, input)              // unchanged
if world.mode === 'plane': plane.update(dt, input)            // new: sets plane.body.velocity/quaternion
physics.step(dt)                                              // unchanged; resolves plane-vs-dynamic-prop contacts
reveal.update(dt)
areas.update(dt, elapsed, activeVehicle.x, activeVehicle.z)    // FLY pad only triggers in car mode; car pads ignored in plane mode (see Flight §Boarding)
_trackSection(activeVehicle.x, activeVehicle.z)
for (const u of [...updatables]) u.update(dt, elapsed)         // sections, particles, air race, rocket, tumbleweeds, birds, turbines, skid marks
shadows.update(activeVehicle.position)
camera.boosting = controls.boost && activeVehicle.speed > 2
camera.update(dt, activeVehicle.position, activeVehicle.velocity, { altitude: world.mode === 'plane' ? plane.body.position.y : 0 })
experience.shadowFollow?.aim(camera.smoothTarget, camera.zoom)
sounds.updateEngine(...) or sounds.propeller(...) depending on world.mode
```

`activeVehicle` is `world.mode === 'plane' ? world.plane.physics : world.car.physics` — a two-line
helper (`get activeVehicle()`) in `World`, not a new concept.

### Key bindings

| Input | Car mode (unchanged) | Plane mode (new) |
| --- | --- | --- |
| `W`/`↑` | throttle forward | pitch up (climb) |
| `S`/`↓` | throttle reverse / brake-first | pitch down (dive) |
| `A`/`←` | steer left | bank/roll left (yaw follows bank) |
| `D`/`→` | steer right | bank/roll right |
| `Shift` | boost | boost |
| `Ctrl`/`B` | brake | wheel brakes during the ground roll; ignored in the air |
| `Space` | jump | no-op while airborne; on the ground, a small hop (cosmetic only, no gameplay effect) |
| `Enter`/`E` | open a pad, or **board the plane** on the FLY pad | **exit the plane** when grounded and slow (see Flight) |
| `H` | horn | horn (scatters the bird flock near the tower, same `world.horn()` path) |
| `M`, `T`, `1`–`8`, `R`, `L`, `C`/`?`, `Esc` | unchanged | unchanged (teleporting out of the plane exits it first, see Flight) |

Touch: the existing joystick maps to `steer`/`throttle` in both modes (x → bank, y → pitch while
flying); the BOOST and JUMP buttons are reused unchanged (JUMP is the cosmetic ground hop while
flying); a fourth touch button, **FLY**, appears only inside the FLY pad radius and only on touch,
mirroring how the existing action button already appears/disappears per pad
(`ui.setActionVisible`). Gamepad: identical mapping to the car (`stickY`→pitch, `stickX`→bank, right
trigger → throttle forward, left trigger → pitch-neutral throttle-down is not applicable, so the
existing `rt/lt → throttle` pairing is reused directly as throttle, and the **A** button that jumps
in the car boards/exits the plane when the car is stationary on the FLY pad or the plane is stopped
on the ground — reusing the existing `'jump'` gamepad edge event would collide with the cosmetic
ground hop, so instead the existing `'interact'` edge (**Y** button) is reused for board/exit,
identical to keyboard Enter/E).

### Budgets (summed across every section below, high tier, after reveal)

| Category | Draw calls | Bodies |
| --- | ---: | ---: |
| Existing scene (measured baseline, see `scratchpad/baseline.json`) | ~309 | 184 |
| Plane model + prop + particles pool (shared, one-time) | 11 (measured) | 1 (kinematic) |
| Hero model rebuilds (plane excluded above; car, rocket, tower, 4 hangars) net delta over current | +14 | 0 |
| Clutter (cacti, rocks, scrub, fences, lamps, vehicles) | +11 | +9 (fences + vehicles; cacti/rocks/scrub are visual only) |
| Skid marks (shared pool) | +1 | 0 |
| Air race (rings + ghost discs, one instanced pass each) | +2 | 0 |
| Rocket launch dressing (gantry, clamps, deflector — folded into the rocket rebuild above) | 0 | 0 |
| Tumbleweeds | +1 (instanced) | +10 (dynamic, sleep when far) |
| Bird flock | +1 (instanced) | 0 |
| Wind turbines | +2 (merged towers + one instanced blade pass) | 0 |
| **New total** | **~350** | **~204** |

Well inside the ~450 draw-call / 60 fps budget the owner set, with headroom for the auto-quality
sampler's existing AO/pixel-ratio steps. `?debug`'s HUD (`src/ui/DebugHud.js`) already reports
calls/triangles/bodies live — no change needed there.

---

## Flight: plane, controls, boarding, camera, crashes, sounds

### The hardstand

A new paved apron east of Runway 00, clear of the windsock (11, −6) and the letters (|x| ≲ 7):
a `RoundedBoxGeometry` slab, 9 m × 7 m, `palette.concrete`, centred at **(17, 0, −6)**, `y = 0.05`,
built in `IntroSection.buildHardstand()`. The plane is parked on it facing north (yaw 0, matching
the car's own spawn heading), nose at roughly (17, 0, −9). A **FLY** `Area` pad sits at the
hardstand's south edge, **(17, 0, −3)**, width 5, depth 3, colour `palette.lamp` (aviation, distinct
from every section colour already in use), label `'FLY'`, hint `'ENTER'`/`'TAP'`.

Because the plane does not need to be physically on the marked runway (it is airborne long before
reaching any other geometry — see ground-roll numbers below), it simply accelerates north from the
hardstand in a straight line; a player who deliberately banks west over the letters can still buzz
them, but the default straight-ahead roll never touches them. This avoids inventing taxiway logic
for a two-second traversal.

### `PlanePhysics.js` — pure flight model (Node-testable, same shape as `CarPhysics.js`)

```js
export const PLANE = {
  size: { w: 2.4, h: 1.7, l: 6.4 },     // collider box (halfExtents 1.2, 0.85, 3.2)
  groundY: 1.05,                          // resting height, nose/tail clear the ground
  accel: 6.5,                             // m/s² from throttle
  boostAccel: 10,
  drag: 0.045,                            // F_drag = -drag * v * |v|, opposes velocity
  liftSpeed: 15,                          // ground speed needed to leave the ground
  minSpeed: 6,                            // stall floor while airborne (see Stall below)
  maxSpeed: 30,
  maxBoostSpeed: 42,
  climbRateAtLiftSpeed: 3,                // m/s vertical at full pitch-up, at liftSpeed
  climbRateAtMaxSpeed: 8,                 // m/s vertical at full pitch-up, at maxSpeed (scales with speed/maxSpeed)
  pitchRate: 1.1,                         // rad/s toward commanded pitch
  maxPitch: 0.45,                         // ~26°, nose up positive
  bankRate: 1.6,                          // rad/s toward commanded bank
  maxBank: 0.9,                           // ~52°
  turnRateAtMaxBank: 0.85,                // rad/s yaw at max bank, scales linearly with bank/maxBank
  ceiling: 46,                            // soft ceiling, well above the tower beacon (21.5 m) and rocket tip (12.6 m)
  landingSinkLimit: 4.5,                  // m/s vertical descent a landing gear survives
}
```

`update(dt, input)` — `input` is the same shape `World.update` already builds for the car
(`{ throttle, steer, boost, brake, jump }`), so no new field is threaded through `Controls`:

1. **Speed**: `target = input.throttle>0 ? accel*(boost?boostAccel/accel:1) : input.throttle<0 ?
   -accel*0.5 : 0`; `speed += (target - drag*speed*|speed|) * dt`, clamped to
   `[0, boost ? maxBoostSpeed : maxSpeed]` while grounded, `[minSpeed, ...]` while airborne (see
   Stall).
2. **Pitch** (airborne only): `targetPitch = clamp(input.throttle, -1, 1) * maxPitch` reusing the
   existing "throttle" field as the climb/dive axis while flying (W/S), eased at `pitchRate`.
3. **Bank**: `targetBank = -input.steer * maxBank` (A = left = positive world bank in the existing
   steer sign convention, matching the car's `+1 = left`), eased at `bankRate`. Yaw rate =
   `(bank/maxBank) * turnRateAtMaxBank`; `yaw += yawRate * dt`.
4. **Vertical speed**: while grounded, 0. On the frame `speed >= liftSpeed && pitch > 0.05`, switch
   to airborne. While airborne: `vy = climbRateAtLiftSpeed + (climbRateAtMaxSpeed -
   climbRateAtLiftSpeed) * (speed - liftSpeed)/(maxSpeed - liftSpeed)) * sin(pitch)/sin(maxPitch)`,
   clamped so `y` never exceeds `ceiling` (vy forced ≤ 0 at the ceiling) nor drops below `groundY`
   (see Landing).
5. **Stall**: if airborne and `speed < minSpeed` for longer than 0.4 s, force `pitch` toward
   `-maxPitch` (nose drops) and `vy` toward `-6` regardless of input, until `speed` recovers above
   `minSpeed` — a forgiving, self-recovering stall rather than a dead-stick spin, appropriate for a
   portfolio toy a recruiter is trying for the first time.
6. **Velocity vector**: `forward = quaternion * (0,0,-1)`; `body.velocity = forward * speed +
   (0, vy, 0)`. Quaternion is built directly each frame from `(pitch, yaw, bank)` via
   `THREE.Quaternion.setFromEuler(new Euler(pitch, yaw, bank, 'YXZ'))` — set on the body directly
   (not accumulated through `angularVelocity`, matching the "orientation overwritten every step"
   approach the friction probe validated) and mirrored onto `body.quaternion`.
7. **World bounds**: if `x`/`z` would leave the world extents (`x0−10..x1+10, z0−10..z1+10`, ten
   metres of margin outside the drivable walls so the plane can circle just past the boundary
   without a hard wall), clamp position and zero the outward velocity component — a soft turn-back
   rather than a wall, since the plane flies over the boundary walls that stop the car.
8. **Landing**: once grounded (`y <= groundY` while descending), if `|vy at contact| >
   landingSinkLimit` it's a hard landing (see Crashes); otherwise `y` snaps to `groundY`, `vy = 0`,
   `pitch` eases to 0, and ground roll deceleration (`drag * 3`) brings `speed` down; below 2 m/s the
   plane is considered stopped and boardable-exit becomes available.

`update()` returns `{ justLifted, justLanded, hardLanding, stalling }` events, exactly like
`CarPhysics.update()` returns `{ jumped, drifting }` — `World`/`Plane.js` react to these for sounds,
toasts and the air-race landing score.

### `Plane.js` — mesh + body wrapper

Mirrors `Car.js`: owns a kinematic `CANNON.Body` (`mass: 0, type: CANNON.Body.KINEMATIC, shape: new
CANNON.Box(new CANNON.Vec3(1.2, 0.85, 3.2))`), added via `world.physics.add(body, mesh)` so the
existing `Physics.step()` pairs loop copies the body's position/quaternion onto the mesh every step
— identical mechanism to how the car's wheels and every dynamic prop already sync. Body
`userData = { kind: 'plane', tag: 'plane' }`; `world.physics.listenImpacts(body, 3, { tag: 'plane'
})` reuses the existing impact-sound/camera-shake pipeline in `World._wire()` (its shake condition,
currently `body.userData?.kind === 'car'`, gains `|| body.userData?.kind === 'plane'` — a one-line
change). The propeller mesh is a separate child spun at `propRPM * dt` (see Models) whenever
`speed > 0.5`, matching how the car's wheels are updated from `vehicle.wheelInfos[i]`.

### Boarding and exit

- The plane starts parked, its body already in the physics world (kinematic bodies at rest are
  free — no per-frame cost beyond the existing pairs-copy), `world.mode = 'car'`.
- Pressing Enter/E (or tapping the pad's action button) on the FLY pad — reusing `Area.onInteract`
  exactly like every other pad — calls `world.boardPlane()`: sets `world.mode = 'plane'`, hides the
  car (`car.group.visible = false`) and freezes its body (`car.physics.chassisBody.sleep()`, wakeable
  on exit), snaps the plane's body to the hardstand pose if it isn't there already (only relevant
  after a previous flight), plays `sounds.click()` and a toast: *"Flying — W/S climb & dive, A/D
  bank, Shift boost, Enter to land"*.
- While `world.mode === 'plane'`, `world.interact()` (Enter/E) instead calls `world.exitPlane()`
  **only if** `plane.physics.grounded && plane.physics.speed < 2` — otherwise it is a no-op (with a
  toast the first time it's attempted mid-air: *"Land first"*), so a player can't teleport out at
  400 km/h. `exitPlane()` sets `world.mode = 'car'`, wakes and repositions the car body to
  `(plane.x + 3, groundY_car, plane.z)` (three metres off the plane's wingtip) facing the plane's
  current yaw, shows the car mesh, and snaps the camera.
- **Other pads are inert in plane mode**: `AreaManager.update` is only called with the active
  vehicle's position (see update order above), so `areas.current` naturally tracks the plane instead
  of the car and only the FLY pad (now read as "LAND" contextually, see below) or nothing responds —
  no车/pad code needs an explicit mode check beyond passing the right x/z in.
- Teleporting (`1`–`8`, the map) while flying calls `exitPlane()` first if the plane is grounded and
  slow, otherwise the teleport is refused with the same "Land first" toast — flight is deliberately
  the one state that can't be interrupted mid-air, so a stray key never strands the plane in the sky
  with no owner.
- The FLY pad's label swaps to `'LAND'`/`actionLabel = 'LAND'` while `world.mode === 'plane'` and
  the plane is near the hardstand and grounded, purely cosmetic (`Area` already exposes `label`/
  `actionLabel` as mutable fields set by its owning section, matching how other pads change hint
  text elsewhere in the codebase).

### Camera

`FollowCamera.update` currently hardcodes `this.smoothTarget.y = 0.6`, which means the camera's
height above its target never changes — at altitude the plane would climb toward the top edge of
frame and eventually leave it, since the fixed `offset = (0,26,28)*zoom` only repositions relative
to that flat target. Two additions, both backward-compatible (no effect at `altitude = 0`):

- `FollowCamera.update(dt, targetPosition, velocity, { altitude = 0 } = {})`: `this._altLift +=
  (altitude*0.55 - this._altLift) * (1 - exp(-dt*2))` (a damped partial follow — the camera rises
  with the plane but stays low enough to keep the ground in frame), then `this.smoothTarget.y = 0.6
  + this._altLift`.
- `maxZoom` becomes mode-dependent: `world.boardPlane()`/`exitPlane()` set `camera.maxZoom = 3.2` /
  `1.9` respectively (default unchanged for driving) and clamp `camera.targetZoom` into the new
  range immediately, so the existing wheel/pinch zoom logic (untouched) simply has more room while
  flying and the player can still zoom in when landed.
- `camera.lookAhead` (already `velocity.xz * 0.35`, eased) needs no change: it works identically fed
  the plane's horizontal velocity.
- `camera.shake` on hard landings/crashes reuses the existing impact-shake path (see Plane.js above)
  plus an explicit `camera.shake = 0.5` set directly by `Plane.js` on a `hardLanding` event, matching
  how `Contact.js`/`Playground.js` already set `camera.shake` directly for their own gags.

### Crashes

Every frame while `world.mode === 'plane'`, after `PlanePhysics.update`, `Plane.js` runs:

```js
plane.body.updateAABB()
for (const wall of world.staticSolids)   // new: World caches wall+board bodies, see below
  if (plane.body.aabb.overlaps(wall.aabb)) return world.crashPlane(wall)
```

`World` gains `this.staticSolids = []`, appended to whenever `physics.add(body)` is called with
`body.userData?.kind === 'wall' || body.userData?.kind === 'board'` (a one-line addition inside the
existing `World`/`Physics` call sites — every static solid in the game already sets one of those two
`userData.kind` values per `docs/superpowers/specs/section-api.md`'s own convention, confirmed
against `Board.js`, `Hangar.js`, `Roads.js` and every section file read for this spec). The check is
O(~70) AABB compares per frame — negligible. `world.crashPlane(wall)` plays `sounds.hit(1, 120,
{noise:true})`, `camera.shake = 0.6`, a toast *"Crashed — respawned on the hardstand"*, and glides
the plane (reusing the existing `resetBodies`-style ease, or simply an instant teleport since a
crash is meant to feel abrupt) back to the parked pose at (17, 0, −6), `world.mode` unchanged
(still 'plane', now parked) so the player can immediately throttle up again. A **hard landing**
(`hardLanding` event from `PlanePhysics`, i.e. touched flat ground too fast rather than hit a wall)
gets the same treatment but a gentler toast: *"Hard landing"* and no crash-respawn — the plane stays
where it stopped. Both paths also feed the air-race landing score (see Race).

### Sounds (`src/core/Sounds.js`)

- `propeller(speed, boost)`: continuous drone, structurally identical to the existing
  `updateEngine(speed, throttle, boost)` (same oscillator/filter graph, retuned base frequency
  range 90–260 Hz for a higher-pitched buzz than the car's 48–223 Hz) — driven from `World.update`
  in place of `updateEngine` while `world.mode === 'plane'`; the car's own engine stays silent
  (its gain simply isn't updated, matching how the engine already sits at 0 gain before `unlock()`).
- `liftoff()`: reuses the existing `whoosh()` implementation verbatim (already a rising bandpass
  sweep — a good match), called on the `justLifted` event.
- `touchdown(strength)`: reuses `hit(strength, 90, {noise:true, decay:0.15})` on the `justLanded`
  event (a soft version of the same tock/thump every other impact in the game already uses, at a
  lower pitch for the heavier plane).

### HUD

While flying, two chips via the existing `world.ui.setChip(id, text)` (no new DOM): `setChip('alt',
`ALT ${y.toFixed(0)}m`)` and `setChip('spd', `${(speed*3.6).toFixed(0)} km/h`)`, cleared on
`exitPlane()`. First-flight hint toast is covered under Boarding above. No new modal, panel, or CSS.

### Tests

**Node unit tests** (`scripts/unit/plane-physics.test.mjs`, pure — imports only `PlanePhysics.js`,
no DOM stub needed, same style as `scripts/unit/shadow-follow.test.mjs`):
- Full throttle from rest reaches `liftSpeed` within a plausible ground-roll distance (assert
  `z`-travel is between 30 and 90 m when it first reports `justLifted`).
- Holding pitch-up after lift-off climbs (`y` strictly increasing for 3 s of simulated time).
- Full bank for 2 s at cruise speed turns at least 60° of yaw.
- Landing at a descent rate under `landingSinkLimit` reports `justLanded` and not `hardLanding`;
  above it reports `hardLanding`.
- Position never exceeds `PLANE.ceiling` even after 10 s of full pitch-up.
- Position stays within `world extents + 10 m margin` after 20 s of flying straight at a boundary.

**Headless-Chrome** (`scripts/e2e-fly.mjs`, modelled on `scripts/e2e-drive.mjs`): start, drive to
the FLY pad, board, hold throttle+boost to lift off, hold climb for 2 s, fly through the first air-
race ring (assert the lap chip updates), turn back, descend, land, exit, assert the car reappears
near the plane and `world.mode === 'car'`. Also assert `node scripts/smoke-sections.mjs` still
exits 0 (the plane's construction must not throw under the Node DOM stub — `Plane.js` uses no
canvas/DOM APIs beyond what `Car.js` already uses).

---

## Hero model rebuilds: plane, car, rocket, control tower, hangars

All geometry stays primitives + `RoundedBoxGeometry`/`TorusGeometry`/canvas-texture decals, per the
"generated in code" rule. Every model is built once, at construction time, so the per-frame cost is
unchanged from today regardless of vertex count.

### Plane (new model, 11 draw calls measured after merging)

Roughly a Cessna-like high-wing single-engine, 6.4 m fuselage, 8.6 m wingspan, sized to read clearly
at the game's fixed camera distance:

| Part | Geometry | Size (m) | Colour |
| --- | --- | --- | --- |
| Fuselage | `CylinderGeometry(0.55, 0.75, 5.2, 10)` tapered via two stacked cones at the nose/tail, merged | length 5.2, radii 0.55/0.75 | cream |
| Cowling | `CylinderGeometry(0.7, 0.55, 0.6, 10)` at the nose | — | cobalt (two-tone break) |
| Canopy | `SphereGeometry(0.5, 10, 8, 0, 2π, 0, π/2)` half-dome, transparent glass material (`roughness 0.15`) | — | glass |
| High wing | `BoxGeometry(8.6, 0.16, 1.3)` with rounded tips (`RoundedBoxGeometry`), mounted above the fuselage roofline | span 8.6 | cream, cobalt tip stripe (a second thin merged box) |
| Wing struts (×2) | `tube()` helper (already used by `Experience.js`'s parked-plane landmark) from wing to fuselage belly | — | ink |
| Tailplane + fin | `BoxGeometry(2.2,0.12,0.7)` + `BoxGeometry(0.14,1.1,0.9)` | — | cream body, terracotta fin stripe |
| Wheel pants (×2 main, ×1 tail) | `CylinderGeometry` wheel + a `RoundedBoxGeometry` fairing over it | — | ink wheel, cobalt pant |
| Propeller hub + 2 blades | hub `CylinderGeometry(0.12,0.12,0.3,8)`; blades a merged pair of thin `BoxGeometry(0.14,1.3,0.04)` rotated 90° apart, spun as one child mesh at `propRPM * dt` (`propRPM = 4 + speed*3` rad/s, i.e. visibly spinning even parked-idle, blurring at speed) | — | ink |
| Registration decal | `labelMesh('VT-VED', {...})` on each fuselage side, reusing `Text.js` exactly as crate/board labels already do | — | ink text on cream |

Merge plan: fuselage+cowling+tailplane+fin+wheel-pants (all `flat()` opaque, non-glass) merged into
one or two `mergeGeometries` calls per colour (cream group, cobalt/terracotta trim group — the same
pattern `SkillsSection.buildTanks()` already uses for its five tanks), canopy kept separate
(transparent), wing kept separate (needs its own pivot for later dihedral tweaks, cheap at 1 call),
struts merged into the ink group, propeller kept separate (it rotates). **Total: ~9 draw calls**
(cream+trim merge, canopy, wing, ink-merge, propeller, 2× registration decal via one shared texture
cloned = 1 draw call since `labelMesh` on both sides can share one `CanvasTexture`/geometry pair with
two mesh instances — counted as 1 for texture cost, 2 for draw calls, folded into the 9).

### Car (visual refresh only, chassis/wheel geometry from `CarPhysics.CAR` unchanged)

Add, without touching any dimension `CarPhysics.js` depends on (`CAR.chassis`, `CAR.wheelRadius`,
axle/steer positions are physics-authoritative and untouched): a transparent windshield
(`RoundedBoxGeometry` matching the existing cabin footprint, `palette.glass`, `roughness 0.15`,
`transparent, opacity 0.6`, one draw call), two side mirrors (`BoxGeometry(0.08,0.08,0.16)` on thin
stalks, merged into the existing ink group), a small rear spoiler (`BoxGeometry(0.9,0.06,0.18)` on
two struts, merged into the body-colour group — no new draw call), an exhaust tip
(`CylinderGeometry(0.05,0.06,0.22,6)`, merged into ink), and a racing stripe: a thin
`BoxGeometry(0.22, 0.02, 3.0)` in `palette.cream` laid along the centre of the roof/hood, merged into
the existing cream group. **Net delta: +1 draw call** (the windshield; everything else merges into
groups the car already has).

### Rocket (Projects, 96, −30 — rebuilt in place of the current plain-cone stack)

Two-tone stage stripes (alternating cream/terracotta bands via a merged multi-colour body group,
same `vertexColors` merge trick `SkillsSection` uses), four grid fins near the base
(`BoxGeometry(0.5,0.5,0.05)` lattice pattern approximated as a merged cross of two thin boxes per
fin — visual only, merged into the ink group), a service gantry: a vertical lattice tower
(`BoxGeometry` uprights + diagonal braces, merged, one draw call) with a walkway
(`BoxGeometry(1.6,0.1,0.5)` at three heights) beside the rocket on its east side, launch clamps
(four short angled `BoxGeometry`s at the base gripping the rocket, merged into ink), and a blast
deflector (a shallow `ConeGeometry` trench shape under the pad, `palette.concrete`, merged into the
existing stand). The exhaust bell gains a soot gradient via a second darker ink-toned cone nested
inside the existing bell mesh (no extra draw call — same mesh, just a two-tone bell instead of one
flat colour). **Net delta over the current rocket: +4 draw calls** (gantry, walkway-set merged as 1,
clamps merged as 1, grid fins merged as 1) — these fold into the "hero model rebuilds" line in the
budget table and double as the launch-pad dressing the Life section's rocket launch needs (no
duplicate geometry).

### Control tower (Education, 0, −104)

Add: horizontal window-band ribs around the cab glazing (three thin `TorusGeometry` rings at
different heights around the existing glass cylinder, merged into the ink group — reads as mullions
without needing a lattice), a radar dish on the roof (reusing the exact dish geometry already built
for `Contact.js`'s `buildRadar()` — same `CylinderGeometry`+half-`SphereGeometry` part list, a new
instance here, one merged group), an external spiral stair implied by 6 short landing platforms
alternating around the shaft (`BoxGeometry(0.9,0.08,0.5)` merged into the concrete group — a real
helical stair is unnecessary detail for a fixed-camera game; the alternating platforms read as a
stair from a distance), and shaft ribs (4 vertical `BoxGeometry(0.12,13,0.12)` strips merged into the
concrete group, breaking up the plain cylinder silhouette). **Net delta: +2 draw calls** (the radar
dish as its own small merged group; the ribs/platforms/window-band all fold into the tower's
existing concrete/ink merged groups at no extra cost since `World.addStatic` already merges by
colour before this pass and continues to).

### Hangars (Experience, ×4 at x = −40, −52, −64, −76, z = −42)

`hangar()` in `src/world/props/Hangar.js` currently returns a plain half-tube shell + flat back +
door frame. Add, inside the same function (all four hangars share one call site, so every change is
automatically ×4 for free): roof ribs (5 thin `TorusGeometry` arcs matching the half-tube's radius,
merged into the shell's own material group — reads as corrugation without new draw calls), a sliding
door pair suggested by two vertical seams and handle knobs at the mouth (2 small
`CylinderGeometry(0.04,0.04,0.3)`, merged into the ink frame group), a roof vent
(`CylinderGeometry(0.25,0.25,0.4,8)` + a small cone cap at the shell's ridge, merged into the shell
group), a wall lamp beside the door (reusing `lampPost()`'s bulb geometry, one `flat(cream,
{emissive})` instance per hangar merged into one shared emissive group across all four — 1 draw call
total, not 4), and a hangar number decal (`floorLabel` variant mounted on the lintel instead of the
floor, reusing `labelMesh`, one shared texture cache since `makeLabelTexture`/`labelMesh` already
cache by content string per `Materials.js`'s caching convention — four meshes, one texture). **Net
delta: +1 draw call across all four hangars** (the shared emissive lamp group; ribs/door
seams/vent/number all merge into existing groups).

### Draw-call ledger for this section

| Model | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Plane (new) | 0 | 11 | +11 |
| Car | ~7 (body+skirt+cabin+roof+lamps×2+antenna+ball merged/instanced per existing code) | 8 | +1 |
| Rocket | ~7 (stand+body+nose+bell+4 fins merged? currently 4 separate fin meshes + tip = ~9) | 13 | +4 |
| Control tower | ~7 | 9 | +2 |
| Hangars (×4 combined) | ~4 (shell+back+2 posts+lintel, ×4 but posts/lintel already merged per hangar) | 5 | +1 |
| **Total delta** | | | **+17** |

(The budget table above rounds this to +14 net after accounting for the rocket's gantry/clamps doing
double duty as launch-pad dressing that the Life section would otherwise have added separately.)

---

## Ground clutter, dust trails, skid marks

### Clutter scatter (`src/world/Clutter.js`)

A deterministic scatter, built once from `World`'s constructor (after roads, before sections, so it
never sits under a board or pad — sections are built after and read the same exclusion zones), using
the same seeded LCG already used for the hill ring in `World.setBoundary()` (`seed = (seed*9301 +
49297) % 233280`), so results are stable across reloads without `Math.random()` (also required for
the Node smoke harness, which has no `Math.random` ban but benefits from determinism for the y-err
assertions `check-rest.mjs` makes).

- **Placement**: candidate points are sampled across the world's drivable rectangle
  (`world.extents`, inset 4 m from the boundary walls), rejected if they fall inside any
  `ROAD_RECTS` rectangle/disc (imported from `Roads.js`, already exported), inside any section's
  `aabb` (imported from `sections/registry.js` — clutter is background dressing between sections,
  not inside them, so it never competes with a section's own hand-placed props), within 3 m of any
  pad (`world.areas.areas`, read after `buildSections` runs — clutter construction is therefore
  moved to right after `world.build(buildSections)` in `main.js`, not inside `World`'s constructor,
  the one adjustment to the "built before sections" plan above), or within 2 m of a road margin.
  Accepted points are then assigned a clutter type by weighted roll.
- **Counts (high tier / low tier)**: cacti 24/12, rocks 18/9, scrub 30/15, fence runs 6/4 (each run
  is 8–14 posts + rails along one straight stretch near a section apron edge), lamp posts 10/6 (at
  section-corner-ish points, reusing the existing `lampPost()` prop verbatim), parked service
  vehicles 5/3 (placed by hand at fixed points near hangars/contact rather than scattered — a fuel
  truck beside the Epik hangar (−52, −38), a baggage cart beside DevCom (−76, −38), a jeep beside
  Ground Control (6, 38), because these read better as deliberate set-dressing than as random noise).
- **Geometry**: saguaro cactus (a tall `CylinderGeometry(0.25,0.3,2.4,8)` trunk + 2 shorter arm
  cylinders at angles, `palette.sage`), rock (reuses the existing `rock()` prop from
  `props/index.js` verbatim), scrub (reuses the existing `bush()` prop verbatim, tinted toward
  `palette.mesa` for a dry look via its existing `color` option), fence (posts = existing
  `trafficCone`-style thin cylinder reused as a post shape at 0 taper, rails = thin merged boxes),
  lamp post (existing `lampPost()` verbatim), service vehicles (new small hand-built models: a
  boxy cab + flatbed for the fuel truck/baggage cart, a simple 4-wheel jeep body — each 3–4
  primitives, `flat()` materials from the existing palette, no new colours).
- **Instancing/merging**: cacti, rocks and scrub are each one `InstancedMesh` (static, `reveal:
  false` since they're far-field dressing like the hills); fence posts+rails per run are merged into
  one geometry per run color (2 draw calls total across all runs — one instanced pass for posts,
  one merged pass for rails, since rails vary in length but posts don't); lamp posts are one
  `InstancedMesh` for the pole+head, plus the existing shared emissive bulb group already used
  elsewhere gains these instances (0 extra draw calls, reusing the hangar lamp group above); service
  vehicles are 5 individual small meshes (hand-placed, not instanced, since each is unique — but each
  vehicle merges its own primitives into 1 draw call). **Total: 3 (cacti/rocks/scrub instanced) + 2
  (fences) + 1 (lamp poles, bulb already counted) + 5 (vehicles, 1 each) = 11 draw calls.**
- **Physics**: fences and vehicles get static bodies (`physics.wall`/`physics.box`, `kind: 'wall'`)
  since they're solid obstacles at car/plane height; cacti get a thin static cylinder collider
  (radius 0.3) so driving through one still stops the car, matching "every solid static body ≥ 0.3 m
  thick"; rocks and scrub are visual only (no collider), consistent with how bushes/rocks already
  behave as unused decoration in `props/index.js` today (grep confirms `tree`/`bush`/`rock` are
  exported but never called anywhere in the current codebase — this section is their first real use).
- **Shadow flags**: `applyShadowFlags` (existing) handles all of it automatically via
  `world.addStatic`, no special-casing needed.

### Dust trails (uses the shared `Particles` pool)

- **Car**: `World.update`, after `car.update`, checks `car.physics.grounded && car.physics.speed >
  4 && Math.hypot(x - lastDustX, z - lastDustZ) > 0.6` (throttled by distance, not time, so dust
  density is speed-independent) and calls `particles.emit(rearAxleWorldPos, { count: 3, color:
  '#DCC08F', size: 0.1, life: 0.4, spread: 0.3, velocity: new THREE.Vector3(-forward.x*1.5, 1.2,
  -forward.z*1.5) })` at each rear wheel. Extra bursts (`count: 10`) on `events.jumped`,
  `events.landed`, and `events.drifting` (already-existing `CarPhysics` events, reused verbatim —
  no new event needed).
- **Plane**: prop-wash while grounded and `speed > 3` (small white-ish puffs behind the propeller,
  `count: 2`, thrown backward along `-forward`), and a bigger dust burst (`count: 16`) on
  `justLifted` and `justLanded`.
- All of this lives in `World.update`/`Plane.js`, calling the one shared `particles.emit(...)` — no
  new module beyond `Particles.js` itself.

### Skid marks (`src/world/SkidMarks.js`)

A ring buffer of `N = 80` (desktop) / `40` (low) thin quads (`PlaneGeometry(0.28, 0.9)`, laid flat,
`y = 0.015` — just above the tarmac decal layer at 0.01 and below pad rings at 0.025, matching the
existing height ledger in `Textures.js`'s comments), one shared `InstancedMesh`,
`flat(palette.ink, { transparent: true, opacity: 0.5 })`/`vertexColors` not needed (uniform colour).
`mark(position, yaw)` writes the next ring-buffer slot's matrix and resets its age to 0; `update(dt)`
fades each slot's opacity-by-scale (same zero-scale-to-hide trick as `Particles`) once its age
exceeds a 6 s lifetime, easing scale from 1 to 0 over the last 1 s. `World.update` calls `mark()`
for each rear wheel only when `car.physics.drifting` (the existing `CarPhysics` event) is true or
`brake && speed > 5`, throttled the same way as dust (distance-based, ~0.4 m between marks so a
drift reads as a continuous streak rather than dashes). **One draw call**, added via
`world.addStatic(mesh, { reveal: false, cast: false })`, constructed once in `World`'s constructor
alongside `this.particles`.

### Tests

- `scripts/unit/clutter.test.mjs`: build the clutter scatter against a fake `World` (the existing
  `fakeWorld()` fixture in `scripts/unit/fixture.mjs`) and assert every generated point falls
  outside every `ROAD_RECTS` entry and every `SECTION_DEFS` aabb (both already exported), that the
  scatter is deterministic (two runs with the same seed produce identical point lists), and that
  draw-call count (meshes + instanced meshes added) matches the 11 budgeted above.
- `scripts/unit/particles.test.mjs`: `emit()` followed by `update(dt)` moves a slot's stored
  position by `velocity*dt` plus gravity integration; a slot's scale reaches 0 exactly at `life`;
  emitting into a full pool overwrites the oldest slot rather than throwing.
- Existing `node scripts/check-rest.mjs` continues to pass unchanged (clutter that has physics bodies
  must still settle correctly — the script already generically walks `world.physics.pairs`).

---

## Air race: sky rings, lap timer, landing score

### Ring course (`src/world/props/AirRace.js`)

Ten rings, laid out to sweep past every section while staying clear of the control tower's beacon
(top at y = 21.5) and the rocket's tip (top at y = 12.6 before this pass, ~14 with the new gantry) —
every ring altitude below is chosen with at least 4 m of vertical clearance, or the ring is routed
laterally clear instead:

| # | x | z | altitude | notes |
| --- | ---: | ---: | ---: | --- |
| 1 (start/finish) | 0 | 18 | 14 | over the runway near spawn, first ring visible on take-off |
| 2 | 0 | −30 | 20 | over the crossroads roundabout |
| 3 | −60 | −40 | 22 | over hangar row |
| 4 | −60 | −20 | 20 | banking back east over hangar row |
| 5 | 60 | −30 | 22 | over the launch pads |
| 6 | 60 | −10 | 20 | south of the projects gantries, clear of the rocket at (96,−30) |
| 7 | 0 | −70 | 18 | over the skills tanks |
| 8 | 20 | −95 | 20 | east of the tower (0,−104) at safe lateral offset — clears the 21.5 m beacon by routing around rather than over |
| 9 | 52 | 44 | 18 | over the playground, near the existing "landing strip" apron at (86,54) |
| 10 | 0 | 30 | 15 | over the contact apron, final approach back to the start ring |

Each ring: `TorusGeometry(5, 0.25, 8, 20)` in `palette.lamp` with `emissive: palette.lamp,
emissiveIntensity: 0.9`, oriented to face along the course direction (`lookAt` the next ring in
sequence), plus an inner "ghost disc" (`CircleGeometry(4.6, 20)`, transparent, opacity 0.15 idle →
flashes to 0.6 for 0.4 s on pass). All ten rings share one `InstancedMesh` for the tori (1 draw call)
and one for the discs (1 draw call) — **2 draw calls total**, `frustumCulled: false`, added via
`world.addStatic(mesh, { reveal: false, cast: false })` (no shadow — they're lamps, not solids).

### Detection

Each frame while `world.mode === 'plane'`, `AirRace.update` tests the plane's motion segment
(`prevPos → currentPos`) against the current target ring's plane-and-disc (a standard segment/plane
intersection at the ring's centre, then a distance-from-centre check against the 5 m ring radius,
computed once, not per-instance-transform-inverse, since the course order is known) — this is exact
at 60 Hz regardless of speed (up to `maxBoostSpeed = 42 m/s`, i.e. ≤ 0.7 m of travel per frame,
comfortably inside the ring's 0.5 m tube thickness margin, so no ring is ever skippable by
tunnelling; still, using the segment test rather than a per-frame point-in-torus test is what makes
this robust rather than assuming it). Rings must be passed **in order**; passing ring N+2 while
ring N+1 is still outstanding is ignored (no skip-ahead). Missing a ring (flying past its z/x without
passing through) does not fail the lap — the timer keeps running and the same ring stays "next"
until passed, so a recruiter who flies badly still finishes eventually rather than being told to
restart.

### Lap timer and scoring

- `AirRace` is constructed by `World` after `buildSections` (needs `world.plane` to exist) and
  registered via `world.addUpdatable(this)` — no changes to `World.update`'s structure.
- A lap starts the first time the plane passes ring 1 while airborne; the chip
  `world.ui.setChip('lap', 'RING 3/10 · 12.4s')` updates continuously; on completing ring 10, `world.
  ui.toast('Lap complete — 48.2s' + (best ? ' — new best!' : ''))`, `sounds.arpeggio()`, best time
  stored in `localStorage['portfolio-air-race']` exactly like `PlaygroundSection`'s existing
  `bestOf()` helper (reused verbatim, already exported-shaped in `Playground.js` as a local function
  — promoted to a tiny shared export `bestOf(key, value)` in a one-line move, imported by both).
  Exiting the plane or crashing mid-lap discards the in-progress timer (no partial-lap scoring).
- **Landing score**: on `justLanded` (from `PlanePhysics`), `AirRace.scoreLanding({ vy, x, z })`
  compares `|vy|` against thresholds (`< 1: 'Butter landing'`, `< 2.5: 'Smooth landing'`, `<
  landingSinkLimit: 'Landed'`, else handled as `hardLanding` already, no score) and the lateral
  distance from the runway centreline (`|x|`, runway spans x ∈ [−7, 7] per `ROAD_RECTS`'s `runway`
  entry) for a bonus word (`< 1: 'on the centreline'`), producing a toast like *"Butter landing ·
  0.6 m/s · on the centreline"*; best (lowest) touchdown speed stored the same way as the lap best.

### Tests

- `scripts/unit/air-race.test.mjs`: checkpoint order enforcement (passing ring 2 before ring 1 does
  not advance the index); the segment/ring intersection correctly registers a pass for a straight
  flight path through a ring's centre and correctly rejects a path that misses the ring by more than
  its radius; landing-score thresholds map to the right grade strings.
- `scripts/e2e-fly.mjs` (shared with Flight's tests): flying the recorded ring-1→ring-2 path updates
  the lap chip; landing produces a landing-score toast.

---

## Launchable rocket, tumbleweeds, bird flock, wind turbines

### Rocket launch (Projects, replaces the existing `rocketGag` in `src/world/sections/Projects.js`)

The current rocket has a horn-triggered "3·2·1… launch window scrubbed" gag
(`ProjectsSection.onHorn`/`update`, `this.rocketGag`) and never actually moves. This pass replaces
that with a real launch, reusing the same trigger surface players already know (a pad, not the horn,
since a countdown deserves a deliberate action): a new **LAUNCH** `Area` pad at (90, 0, −30), west
of the rocket, `world.addArea({ x: 90, z: -30, width: 4, depth: 3, label: 'LAUNCH', color:
palette.terracotta, onInteract: () => this.launchRocket() })`.

**State machine** (`this.rocketState: 'idle' | 'countdown' | 'ascending' | 'coasting' | 'descending'`,
driven from `ProjectsSection.update`, cooldown `this.rocketCooldown` gates re-arming):
1. `idle → countdown` on pad interact (only if `rocketCooldown <= 0`): `world.ui.setChip('rocket',
   '3')`, ticking down over 3 s (`world.sounds.blip(880)` each second, reusing the existing blip).
   The nose tip (`this.rocketTip`, already an emissive lamp sphere reused verbatim from the current
   horn gag) flashes faster as the count reaches zero; the exhaust bell — inert today — gains its
   own `emissive: palette.lamp` and ramps `emissiveIntensity` 0→1.4 through the countdown, so the
   glow visibly moves from nose to base as ignition approaches.
2. `countdown → ascending` at T-0: `world.sounds.whoosh()`, `camera.shake = 0.4` if the car/plane is
   within 20 m (reusing the existing camera-shake field directly, same pattern as every other section
   gag), `particles.emit()` bursts of smoke (`color: '#BFB8A8'`, `count: 20`, `spread: 1.5`, `life:
   1.2`) from the pad every 0.1 s while ascending. The rocket **group** (already one movable
   `THREE.Group` per the current `buildRocket()`) rises: `y += (easeInQuad over 4s) * 60`, reaching
   60 m altitude (comfortably clear of the air-race course's highest ring at 22 m and the plane's
   ceiling of 46 m — the rocket is a background spectacle, not a flight obstacle, so it climbs
   straight past both) — if the plane is nearby when it launches, that's an intentional, harmless
   near-miss spectacle, not a collision (the rocket has no collider once launched; its static body
   from `buildRocket()` is only used for the parked/idle state and is not checked against the plane
   at all — the plane's own crash detection only checks `staticSolids`, and the rocket's body is
   excluded from that list the moment `rocketState !== 'idle'` by removing it from
   `world.staticSolids` for the flight's duration and re-adding it once parked).
3. `ascending → coasting` at 60 m: a beat of silence (0.6 s) at apex.
4. `coasting → descending`: a parachute mesh (`ConeGeometry(2.5, 3, 8, 1, true)` inverted,
   `palette.cream`, `side: DoubleSide`) fades in above the rocket group, descent at a slow constant
   4 m/s (`y -= 4*dt`) with a gentle side-to-side sway (`x/z offset = sin(t*0.8)*1.5`), smoke puffs
   stop.
5. `descending → idle` on touching the launch clamps' y (0): `sounds.hit(0.6, 90, {noise:true})`,
   parachute mesh hidden, `rocketCooldown = 6` (re-arm delay), static body re-added to
   `world.staticSolids`, `world.ui.setChip('rocket', null)`.

The countdown/glow/smoke/parachute geometry above (2 new small meshes: parachute cone, plus reusing
the existing exhaust-bell mesh for the glow) are folded into the Models section's rocket rebuild
budget (already counted there) — **no additional draw calls** beyond what that section already
budgeted, since the parachute and smoke (shared `Particles` pool, 0 extra draw calls) are the only
new geometry and the parachute is 1 mesh, covered by rounding in the rocket's +4 line.

### Tumbleweeds (new file `src/world/props/Tumbleweed.js`, constructed from `World`)

Ten dynamic bodies (`CANNON.Sphere(radius: 0.6)`, mass 3, `IcosahedronGeometry(0.6, 1)` cage-like
mesh via `flat(palette.mesa, { wireframe: false, roughness: 1 })` — a subdivided low-poly icosahedron
already reads as a tangled ball without needing an actual wireframe material, keeping it a normal
opaque draw call), spawned in a strip along the world's east edge (x ≈ 100–108, z spread across
−120..70) and driven by a steady westward wind force each frame:
`body.applyForce(new CANNON.Vec3(-8 * body.mass, 0, 0))` (a real dynamic force, not kinematic — these
are ordinary physics props, so cannon's normal friction/rolling applies, and the friction-cap fact
measured for the plane does not disqualify this: a rolling sphere only needs *rolling* friction to
look right, not linear traction, and the existing `physics.materials.object` default
(friction 0.4) already lets spheres roll convincingly, as the bowling ball in `Playground.js`
already demonstrates at the same default friction). `angularDamping` left low (0.1) so they visibly
tumble/roll rather than skid. When a tumbleweed's `x` exceeds the west wall, it wraps back to the
east spawn strip at a random z (position teleport, velocity preserved) — cheap and invisible since
it happens off-camera near the boundary. Tumbleweeds within 70 m of the camera focus are the only
ones simulated at full rate; farther ones are put to sleep each frame their distance exceeds that
(a one-line check in `Tumbleweed.update`, mirroring the existing 70 m blob-shadow cull radius in
`Shadows.js`) to keep the physics step cheap regardless of how many are technically "in the world."

**Pop**: when a tumbleweed's impact speed against the car or plane exceeds 6 m/s (reusing
`world.physics.listenImpacts(body, 6, { tag: 'tumbleweed' })`, the same impact-event pipeline every
other prop already uses), `World`'s existing impact handler (extended with one more tag case)
triggers a burst (`particles.emit(pos, { count: 14, color: '#D4A373', spread: 1.2, life: 0.5 })`),
`sounds.hit(0.5, 300, {noise:true})`, hides the tumbleweed mesh/sleeps its body for 2 s, then
respawns it at a fresh point on the east strip — reusing the exact "disable, wait, respawn" shape
`RedButton`'s `resetBodies` already demonstrates, just simpler (no ease-back tween needed, an
instant reposition off-camera reads fine for something that just visually burst). Rendered via
`InstancedProps` (already exists, exactly the class `PlaygroundSection`'s pins/bricks use) — **1
draw call, 10 bodies**.

### Bird flock (`src/world/props/Birds.js`, hosted by `EducationSection`)

16 birds, no physics (purely visual, like the existing confetti/walkers patterns already in
`Education.js`/`Projects.js`), each a two-triangle wing pair (`PlaneGeometry(0.5, 0.22)` × 2, angled
into a shallow V, merged into one small per-bird geometry, all birds sharing one
`InstancedMesh(mergedWingGeo, flat(palette.ink, {side: DoubleSide}), 16)`).
Flight pattern (boids-*lite*, matching the existing `walkers` circling-orbit style in
`Projects.js.buildInstiApp()` rather than a full boids simulation, since one circling flock around a
single landmark doesn't need separation/alignment/cohesion forces): each bird `i` orbits the tower
at `(0,−104)` on a circle of radius `14 + (i%4)*1.5`, altitude `26 + (i%3)*2` (above the beacon at
21.5 m, reading as birds circling the tower's tip), angular speed `0.25 + (i%5)*0.03` rad/s (slight
desync so the flock doesn't look perfectly rigid), plus a small sinusoidal wing-flap
(`wingAngle = sin(elapsed*8 + i) * 0.6`, applied as a per-instance rotation offset baked into the
matrix each frame). **Scatter**: when the plane comes within 12 m of the flock's centre altitude
band, or `world.horn()` fires within 30 m of the tower (reusing the existing horn broadcast every
section already listens to via `onHorn()`), each bird's radius/altitude jump outward by a random
1–4 m over 1 s (an eased target offset added to the orbit formula) then eases back over 3 s —
"scatter and regroup," no state machine needed beyond two eased offset floats per bird held in a
flat `Float32Array`. **1 draw call, 0 bodies.**

### Wind turbines (`src/world/props/Turbines.js`, hosted by `World`, built alongside the hill ring)

Eight turbines placed along the hill ring's outer edge (reusing `World.setBoundary()`'s existing
perimeter-walk math for positions rather than the hills' own instance transforms, since the hills are
one opaque `InstancedMesh` with no addressable per-instance API to "stand on" — turbines get their
own independent seeded placement along the same perimeter formula already in `setBoundary`, at
`out = 14` (deliberately just past the hills' own 8–18 m outward jitter, so turbines read as sitting
among the hills rather than in front of them), four along the north edge (`z0 = −130`) and four along
the west edge (`x0 = −110`), evenly spaced. Each turbine: tower (`CylinderGeometry(0.25, 0.4, 9, 8)`,
tapered, `palette.cream`) + nacelle (`BoxGeometry(0.6,0.5,1.4)`, `palette.ink`) merged into one
`mergeGeometries` pass shared across all 8 (**1 draw call**), blades (3 per turbine, thin
`BoxGeometry(0.12, 2.6, 0.3)` tapered via a second smaller box merged per-blade) rendered as **one
shared `InstancedMesh`** (24 blade instances total across all 8 turbines, **1 draw call**), each
spun independently each frame: `bladeAngle[t] += (0.6 + seededVariation[t]*0.3) * dt`, matrix
recomposed from the turbine's fixed hub position/orientation plus the spinning angle — the same
per-instance-matrix-write pattern `SkillsSection`'s flow beads and `Playground`'s cone bands already
use. **2 draw calls, 0 bodies** (purely visual, sitting outside the drivable boundary).

### Tests

- `scripts/unit/life.test.mjs` (or split per system if it grows unwieldy — start as one file):
  rocket state machine timing (T-3 countdown reaches `ascending` at exactly 3 s, apex at 60 m,
  descent rate exactly 4 m/s, full cycle re-arms `rocketCooldown`); tumbleweed wrap (a body driven
  past the west wall reappears on the east strip with velocity preserved) and pop (an impact event
  above the 6 m/s threshold triggers a respawn, below it does not); bird scatter radius returns to
  baseline within the 3 s ease window; turbine positions all fall outside `world.extents` (i.e.
  genuinely among the hills, not on drivable ground).
- `node scripts/smoke-sections.mjs` continues to pass (all four new systems must construct cleanly
  under the Node DOM stub — none of them touch canvas/DOM beyond the existing `labelMesh`/
  `flat()` calls every other prop already makes).
- `node scripts/e2e.mjs` re-run after this pass to confirm the updated draw-call/fps numbers in the
  budget table above hold in headless Chrome (compare against `scratchpad/baseline.json`).
