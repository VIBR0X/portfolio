# Out of this world: landing, light, horizon, tracks and finish (2026-09-09)

Amends `2026-09-05-mars-rework-design.md`. The world layout, the résumé content, the car, the
sections and the lit rendering pipeline stay. This pass fixes the two showpieces that sabotage
themselves, gives the range light and air that the fixed camera can actually see, makes the words
drawn in the world readable, and closes the measured defects in the shell.

## How this pass was scoped

Seven agents read the codebase subsystem by subsystem; two played the site end to end in headless
Chrome (1280×720 and 390×844); five designers proposed 43 improvements from five angles. Every
load-bearing claim below was then re-measured directly, because on this project subagent claims
have been wrong in ways only measurement caught (`memory/verify-agent-claims-independently`).
Two claims changed the plan when checked.

### The owner's answers (2026-09-09)

| Question | Answer |
| --- | --- |
| Landing forgiveness | Flare below 3 m, but **keep** hard landings for stalls and boosted dives |
| Light and atmosphere | Low sun **+** graded fog **+** pilot horizon. **No** sol clock — boot state stays deterministic |
| Autopilot | **Tap-to-go only.** No scripted tour |
| Execution | Write this spec, then build it all with no further check-ins |

## Measured baseline (2026-09-09, this tree)

Taken in headless Chrome (ANGLE) with the auto-quality sampler still armed, then again with it
pinned. **The two runs disagree wildly and only the pinned run is real:**

| Viewpoint | Draw calls (AO on) | Notes |
| --- | --- | --- |
| after reveal | 300 | |
| intro | 298 | |
| crossroads | **380** | worst viewpoint |
| experience | 325 | |
| projects | **378** | previously misreported as 245 on a degraded tier |
| skills | 339 | |
| education | 289 | |
| contact | 304 | |
| playground | 214 | |

257 bodies. **Headroom against the 450 gate is ~70 draw calls, not the ~150 that the stale
"300 after reveal" figure suggests.** Every item below that adds calls says where they come from.

---

# 1. The defects this pass closes

Each was measured, not inferred. The measurement is named so it can be repeated.

### 1.1 The aircraft cannot be landed (blocking)

Simulated `PlanePhysics` directly in Node (`scratchpad/land.mjs`). Airborne, throttle is the
elevator, so the only descent input is full `S`, which drives pitch to `−maxPitch` and gives
`vy = −(3 + 5·(speed−15)/15)`. Airborne thrust equilibrium is ~20 m/s, where that is **−4.67 m/s
against `landingSinkLimit` 4.5**:

| Approach | Cruise | Impact vy | Verdict |
| --- | --- | --- | --- |
| held S from 8 m | 19.24 | −4.58 | hard landing |
| held S from 15 m | 19.69 | −4.65 | hard landing |
| held S from 25 m | 19.91 | −4.67 | hard landing |
| held S from 34 m | 19.97 | −4.67 | hard landing |
| held S boosting | 37.45 | −8.00 | hard landing |

A clean landing needs speed under ~18.4 m/s, which the model does not hold on its own. The HUD
instructs the visitor to dive, and diving is a crash — the play-test crashed six of six. Then
`rollDecel` 3 m/s² gives a 36 m rollout from 20 m/s and 96 m from 24 m/s, and the plane spawns at
(−92, −30) facing east, so the rollout ends at the crossroads signpost pole at (0, −30), a solid
`wall` body: "Crashed — respawned".

### 1.2 The atmosphere is built and invisible

- **The sky never renders.** At the 34 m ceiling the top row of the frame is `[229,184,141]` —
  exactly the fog colour. The 620 m apron plus the 22.9°-below-horizontal top ray mean ground
  fills the frame at every altitude. `README.md`'s "sky gradient … which only the plane brings
  into view" describes something that does not happen.
- **Fog never touches a driving frame.** near/far 90/170, but top-of-frame ground at zoom 1 is
  68 m from the camera, so the fog factor is 0 until zoom ≈ 1.32.
- **The dust devils are invisible**: `regolithLight` at opacity 0.32 against regolith measures
  within **3/255** of the ground behind them.
- **Skills' 60 flow beads run inside opaque pipes**: paths at y 0.45 (`Skills.js:92,155,162-164`),
  pipes of radius 0.20 and 0.24 on the same axis. Fully enclosed, never once seen.
- The tower crown, the eight dishes (20 m outside the walls) and 31 emissive materials are
  outside the frame or one pixel wide.

### 1.3 The light is flat

`LIGHTING.direction [1,2,1]` is 54.7° elevation from the south-east: shadows are 0.71× object
height and fall north-west, up-screen and **behind** the caster, away from a camera that never
rotates. `shots/07-education.png` shows an 11 m control tower casting nothing into frame.
Separately, the shadow frustum (`26·zoom+14`, centred on the focus) misses the top corners at
every zoom: the tower's shade point reads `189,97,56` in the top-right corner against `159,73,36`
mid-frame — identical to unlit ground.

### 1.4 World text is below legibility

Board body copy projects at **3.5–5 px** cap height at 720p and under 8 px at 1080p. Cradle tags
2.3 px, pad labels 3.5 px, `FLY` 4.4 px. Only the counters (~12 px), numerals and road stencils
read. On a phone the boards are blank slips.

### 1.5 The shell lies, and two text exits are dead

- `UI.js:65` binds **every** `[data-close]` to `closeModal()`, which returns early when
  `openModal` is null — so the résumé's "× Back to the world" is **dead on every device**. A phone
  visitor who taps Text is trapped (no Escape key).
- The start screen's "Prefer text?" opens the résumé at z-index 28 **under** the start card at 30.
- The section card persists across sections and through flight; `_trackSection` fires from the
  plane's position.
- Key `2` (Crossroads) spawns at `[0,−18]`, inside the **Intro** aabb `[−20,−20,16,14]`, so it
  shows the Intro label and never fires the Crossroads card.
- The mobile panel sets `max-height:72vh` on a container whose `.panel-inner` resolves `height:100%`
  against an auto height, with `overflow:hidden`: content clips with no scroll and the prev/next
  buttons sit 119 px below the viewport.
- `Sounds.js:9,34` read `localStorage` unguarded — in Safari with site data blocked this throws
  inside `new Sounds()` and the whole boot fails to "The 3D world failed to start".
- Education's `H` helipad is drawn at (−6, −96) but the confetti trigger tests (0, −96).
- Stand 04's drone enters `chase` from the whole Projects aabb inflated by 4 — i.e. from x ≥ 8,
  74 m before stand 04 — so its figure-eight exhibit is never seen and it parks over the stencil
  it exists to demonstrate.
- Contact toasts "That's the whole range. Thanks for driving" on first crossing z ≥ 32, 28 m
  before the pads: a visitor who drives south first is congratulated before starting.

---

# 2. The design

## Tier 0 — gate hygiene (lands first)

Nothing later can be measured until this is true.

- `scripts/e2e.mjs`: after `#start-btn` is clicked, set `experience._sample = null` and
  `experience.setEffects(true)`; report `effects`/`lowQuality` per section; **assert**
  `calls ≤ 450 && bodies ≤ 300` and exit non-zero on breach. The auto-quality sampler drops AO
  ~8 s and the resolution tier ~11 s into every headless run, which is why the same tree reported
  Projects at both "14 fps / 245 calls" and "60 fps / 378 calls".
- Output dirs default to the current scratchpad or `--out`, not a dead session path
  (`e2e.mjs:7`, `e2e-ui.mjs:6`, `e2e-drive.mjs:4`, and the `/tmp/*` defaults in `e2e-fly`,
  `e2e-bay-row`, `e2e-drone`, `hero`).
- Delete `scripts/_tmp-acne2.mjs` (a committed debugging leftover).
- Wrap both `localStorage` accesses in `Sounds.js` in try/catch, as `UI.js` already does.

## Tier 1 — the moments

### 1.1 A landing you can make

`src/world/PlanePhysics.js`, pure and Node-testable:

- New constants `flareHeight: 3.0`, `flareSink: 3.5`.
- In the airborne branch, after `vy` is computed and before the ceiling clamp: when
  `position.y − groundY < flareHeight`, **not** `events.stalling` and **not** `input.boost`,
  apply `vy = Math.max(vy, −flareSink)`. Stalls (which force `vy → −6`) and boosted dives
  (−8.0) bypass the flare, so `hardLanding` and the landing grade keep meaning something.
- `rollDecel` 3 → 8: the 20 m/s rollout goes 36 m → 13.5 m, the 24 m/s rollout 96 m → 36 m, and
  the take-off roll is untouched because the decel only applies at `throttle ≤ 0.05`.
- `World.js` crash sweep (~line 592): when `!plane.airborne && plane.speed < 12`, an AABB overlap
  is a **bump-stop** — speed 0, position pushed 0.6 m back along −forward, `sounds.hit(0.4, 120,
  {noise})`, `camera.shake 0.2` — fired only on the frame speed drops from > 0.3 so a resting
  overlap does not tock every frame. Airborne overlaps still call `crashPlane()`.
- `crashPlane()` gains `ui.fade()` and `camera.snap(...)`, exactly as `teleportTo` does, so a
  crash respawn does not lerp the camera 100 m across the range.
- Chip copy: `↓ DIVE TO LAND · CTRL BRAKES`, then `↵ GET OUT` once stopped.

**Re-baseline:** `scripts/unit/plane-physics.test.mjs`'s "a steep dive lands hard" case becomes a
**boosted** dive (which still does). `scripts/e2e-fly.mjs` re-runs; its landing and hop-out
timings shorten.

### 1.2 A low, raking sun

- `LIGHTING.direction [1,2,1] → [2.0, 0.95, 0.85]`: elevation 23.6°, azimuth east-south-east.
  Shadow length 0.71× → **2.29×** object height, raking **west across** the frame rather than
  behind the caster. The `+z` component stays positive so every camera-facing south face keeps a
  grazing light and nothing falls into silhouette — the legibility constraint.
- `sunColor #FFF0DE → #FFEBD2`, `hemi 1.0 → 1.15`, `groundColor #9C5535 → #A85F3C`, so the
  shadowed-ground ratio stays inside the gated 0.55–0.72 band.
- New `ShadowFollow.setDirection(v)`: renormalise and rebuild the two lookAt matrices. `perZoom`
  26 → 32, which covers the longer shadows **and** closes the measured top-corner gap; texel
  3.9 → 4.8 cm at zoom 1 on the 2048 map, so re-check `normalBias` 0.03.
- `environmentScene({sunDir})` already takes the direction, so the PMREM sun disc follows.

**Re-baseline, by probe and not by arithmetic:** `e2e-finish.mjs`'s tower-shadow sample pair
(−7.5,−111.5) vs (7.5,−111.5) was chosen for the old azimuth and will read "no shadow" under the
new one. Re-derive both points by sampling actual pixels from a live frame, then pin them.
`scripts/unit/shadow-follow.test.mjs` pins the direction and the extent; both change deliberately.

### 1.3 A horizon worth flying toward

Two halves, neither of which moves any geometry the ground camera can see.

**(a) Graded fog.** `src/world/Sky.js` exporting `installGradedFog()`, called from the
`Experience` constructor before any material compiles: override `THREE.ShaderChunk.fog_fragment`
so the fog colour is `mix(skyBottom #E6B98E, skyTop #B97C50, smoothstep(110, 240, vFogDepth))`
rather than a constant. `vFogDepth` is already a varying in three 0.185.1 (verified in
`node_modules/three/src/renderers/shaders/ShaderChunk/fog_fragment.glsl.js`), so this is ~4 lines
of GLSL, one global install, **zero draw calls and zero uniforms**, and it applies to every lit
material — the distant hills grade into the sky instead of floating on it, which is the actual
reason they read as "crude dark lumps". Unlit `MeshBasic` faces have no fog chunk at all, so the
board-cream check is provably unaffected.
Also `fog.near 90 → 55` on the high tier (70 → 50 low, fallback 60 → 45) so haze reaches the top
band of a driving frame. `e2e-finish` samples ~38 m from the camera, where `smoothstep(55,170,38)`
is still 0.

**(b) A tilt the car never gets.** `FollowCamera.tilt` and `World.requestTilt(m)`, mirroring
`requestFocusAltitude`/`_minZoom` exactly (set per frame, consumed and zeroed at `World.js:662`).
`_apply`'s last line becomes `camera.lookAt(focus.x, focus.y + tilt, focus.z)` — the camera
**position** is untouched, so dolly, zoom, shake, look-ahead and the shadow frustum are all
unchanged and only the view direction pitches up. Requested only in plane mode:
`tilt = clamp((y−14)/20, 0, 1) · 22`, zero while a panel is open. At plane zoom 1.53 the camera is
58 m from the focus, so tilt 22 raises the direction ~21°, moving the top of frame from 22.9°
below horizontal to ~4° above — the horizon plus a band of sky in the top tenth of the frame.
**The car camera is bit-identical**, so `check-exhibits`, `check-boards-clear` and every board
clearance number still hold.

**(c) Something to look at.** `src/world/props/Horizon.js`: one open-ended
`CylinderGeometry(340, 340, 90, 96, 3)`, `BackSide`, vertex-coloured `MeshBasicMaterial`
(`fog:false`, `depthWrite:false`, `toneMapped:false`), `renderOrder −1`, `frustumCulled false`,
re-centred on `camera.smoothTarget.x/z` each frame so it never approaches. Lower rim at y −18,
which is below every sight line from the ground camera (at max zoom 1.9 the top ray reaches
y −77 at 300 m). Ridge profile from two octaves of `Textures.valueNoise`; below the line
`mesaFar #B86A45` hazed toward `skyBottom`, above it the same two stops `skyGradient` uses so the
band and `scene.background` agree at the seam. **1 draw call, ~2.4k triangles, no body.**

The "camera never rotates" invariant becomes "the camera never rotates on the ground; above 14 m
in the aircraft it pitches up to show the horizon" — written into this spec and the README, so the
next reader does not treat it as a regression.

### 1.4 Launch Pad 1 as a set piece

None of this touches `rocketStep`'s pinned timing (`ROCKET_APEX` 9, 3 s countdown, 2.6 m/s
descent, 6 s cooldown).

- **Its own smoke.** `ProjectsSection` gets `new Particles(world, {max: 96})`. Today the rocket
  emits 83 trail particles/s at life 1.4 s plus 133/s of pad cloud into the **shared 120-slot**
  pool that car dust, plane dust and four dust devils also use, so the ring cursor overwrites the
  trail at 0.97 s and the column can never reach the length it is written for. `Particles` is
  world-agnostic apart from `addStatic` and skips its whole buffer upload when nothing is alive:
  **+1 draw call, zero per-frame cost when idle.**
- **A shockwave.** One `RingGeometry(1, 1.22, 48)` flat at y 0.03 with a cloned unlit decal
  material, scaled 1 → 26 m over 0.9 s at opacity 0.5 → 0, fired twice 0.25 s apart. **+1 draw
  call**, no body, `{reveal:false, cast:false}`, `renderOrder 1`. A ground ring is the one effect
  a camera locked at 43° reads perfectly.
- **Choreography.** Today the camera moves zoom 1.00 → 1.10 across the entire flight. Replace the
  flat `requestMinZoom(1)` with a curve: 1.0 at T−0, easing to 1.45 by apex, held through the
  chute, easing back over the last 1.5 s; keep `requestFocusAltitude(min(7.2, y·0.8))`; add
  `camera.shake 0.55` at ignition within 25 m. All through the existing per-frame request API,
  none of which is pinned.
- **Sound.** `Sounds.rumble()`: the existing `_noiseBuffer` through a lowpass sweeping 180 → 90 Hz
  over 2.2 s plus a 42 Hz sine with exponential decay, **arriving 0.28 s after the flame** (95 m
  at the speed of sound in thin CO₂).
- **Discoverability.** A `floorLabel('LAUNCH PAD 1 ▶', fontSize ≥ 0.8)` at ~(88, 0.03, −36.8) with
  `{reveal:false, cast:false}` — no body under 0.35 m. `registry.js` projects `hint` and `card`
  name the pad. Chip reads `CHUTE` on descent; `ProjectsSection.onLeave()` clears it, mirroring
  `Playground.js:351-353`.

**Budget:** +2 permanent draw calls at Projects, the second-worst viewpoint (378 → 380 of 450).

### 1.5 Tracks in the regolith

`src/world/Tracks.js` plus one hook in `World.setFloor` and one in `World.update`'s car branch.

- A 1024² single-channel `Uint8Array` `DataTexture` (LinearFilter, ClampToEdge, NoColorSpace)
  mapped over `world.floorRect` (300×285 m → 3.41 px/m) through the **same** `worldToUv`
  (`Textures.js:163`) the wear map uses, so tracks line up with roads and crater bowls exactly.
- Per frame, while `car.physics.grounded && speed > 0.5`, stamp two soft 3 px brushes at the rear
  wheel contact points. **The two-track maths already exists verbatim** at `World.js:604-609`
  (`rx = cos(yaw)·CAR.axleX`, `rz = −sin(yaw)·CAR.axleX`) and is reused, not rewritten. Stamp only
  when the car has moved > 0.25 m; accumulate with a per-texel clamp at 140/255 so repeated passes
  deepen but never go black; mark a dirty rect and upload at most 10 Hz.
- **Zero draw calls.** The floor material is `flat('#FFFFFF', {map, aoMap})` and `flat()`'s cache
  key includes `map.uuid`/`aoMap.uuid` (verified at `Materials.js:88-92`), and the floor's map is a
  `fitGrain` clone — so the floor's key is **unique** and patching it via `onBeforeCompile` is
  safe. Add a `vTrackUv` varying from the raw `uv` attribute (the plane's own 0..1 planar UV,
  untouched by the grain's repeat transform) and after `#include <map_fragment>` do
  `diffuseColor.rgb *= mix(1.0, 0.70, texture2D(uTracks, vTrackUv).r)`. 0.70 is the Curiosity
  read: darker disturbed regolith, no hue shift, so no palette-hex test is involved. Because it
  multiplies diffuse it takes sun and shadow like the ground it is scratched into.
- `world.tracks.clear()`, exposed and called by `e2e-finish.mjs` in the hygiene block where it
  already parks the dust devils and clears the particle pool.

## Tier 2 — what makes it feel finished

### 2.1 Boards that can be read, and a gate that keeps them that way

`makeBoardTexture` already picks the largest scale in [0.7, 1.35] that fits and records the
outcome on `texture.userData.fit`, so this is **fewer, shorter strings at bigger base sizes**, not
a new renderer.

- Two new fields per entry in `src/content/resume.js` (the content rule's only legal home):
  `plain` (outcome-first, ≤ 56 chars, no unexpanded acronym) and `plainShort` (≤ 26 chars).
- Bay and stand boards become kicker + title + role + **one** `plain` line, `bodySize`
  0.26 → 0.60 and 0.34 → 0.58, `titleSize` → 0.60. Measured basis: the 0.78 m Counter reads at
  ~12 px and is the one thing everyone can read; 0.26 gives ~4 px; 0.58–0.62 lands at ~9–10 px at
  720p and ~14 px at 1080p. The removed paragraph is not lost — it is already the panel's bullet
  list, which is where the reading actually happens.
- Raise the sub-legible tags where `fontSize` is free: cradle `LOCAL`/`LLM` 0.28 → 0.7 on a
  2.4×1.0 plane, `RELEASE ▲` and the date plates → ≥ 0.7, pad labels 0.3 → 0.42 with shorter
  strings (`CONSULTING`, `DEVCOM`).
- **New gate** `scripts/check-legible.mjs`, promoted from the scratch probe: project every
  canvas-textured plane through the real camera from its section spawn at zoom 1 / 1280×720 and
  fail below 7 px cap height. This is the check that would have caught the 3.5 px board copy.

**Re-baseline:** `rocket.test.mjs` pins `BOARD {width 7, bodySize 0.34}` and asserts every stand
subtitle fits one line; `e2e-board-fit.mjs` floors scale at 0.7 with five boards already at 0.75.
Write the strings, then re-measure **in a browser** — `dom-stub` fakes `measureText`, so Node
cannot see wrapping.

### 2.2 An honest HUD

- `World._trackSection`: `ui.hideCard()` on leave; skip `showCard`/`showSectionLabel`/whoosh while
  `mode === 'plane'`.
- The bay chip shows the **verb** until you act (`SHOVE THE PUCK INTO THE GATE`, `KNOCK THE DRUMS
  DOWN`, `DRIVE THROUGH THE LANES`, `LIGHT EVERY TILE`), then the tally; and it is cleared while
  the car is on the avenue so it stops covering the neighbouring counter (measured overlap: chip
  y 74..102 vs counters y 85..109).
- `registry.js` crossroads spawn `[0,−18] → [0,−22]`: inside its own aabb, on the roundabout ring's
  south edge, still 5.5 m south of the MAP pad. **New unit test:** every `def.spawn` lies inside
  its own aabb and inside no earlier row's.
- `Contact.onEnter` gates the finishing toast on having seen most of the range or arriving from
  the south (`car.z > 44`).
- `World.respawn` picks the nearest `def.spawn` by distance rather than `currentSection`.

### 2.3 The stations' hidden payloads, made visible

- **Skills:** flow path y 0.45 → 0.85 (`Skills.js:92,155,162-164`) so the r 0.15 beads ride the
  top of the r 0.20–0.24 pipes instead of inside them. Zero cost; verify with a pixel probe at the
  projected instance positions, not by reasoning.
- **Education:** confetti trigger → `hypot(x + 6, z + 96) < 3` so it fires on the `H` that is
  actually drawn at (−6, −96). Tower horn payload gets `requestMinZoom(1.6)` for 1.2 s so the cab
  strobe is in frame.
- **Projects:** drone `chase` gated to `near(car, STANDS[3].x, SLAB_Z, 24)` instead of the whole
  aabb + 4, and the hover target offset off the car's shoulder so it never parks on the stencil it
  demonstrates. **Amend the Mars spec's two lines** that say the chase was cut, so the spec and
  `e2e-drone.mjs` agree.
- **Experience:** `▲ ▲ ▲` lane arrows so Consulting reads as lanes; an `LLM` label on the Tark
  mast; auto-recovery for a wedged puck copying Epik's idle-reset; the FLY pad 0.9 m south so the
  car is not drawn against the wing.
- Dust devils: material → `palette.dust` with a per-height alpha ramp, and spawns brought in off
  the corners. `DEVIL` constants and the pinned wander law are untouched.

### 2.4 Sound that has a room

All in `src/core/Sounds.js`, all created inside `unlock()` so Node construction stays clean, all
zero render cost. Three designers proposed this independently.

- One `DynamicsCompressorNode` before `ctx.destination`: 17 blip sites, 8 hit sites and the engine
  drone currently sum past 1.0 and clip.
- An ambient bed off the existing `_noiseBuffer`: a lowpass sub layer (thin-atmosphere pressure)
  and a bandpass wind layer whose gain follows `speed`, `altitude` and dust-devil proximity. The
  world stops being silent when parked, and the devils get an audible warning.
- **Stereo, free:** the camera never rotates, so world-x **is** screen-x. One `StereoPannerNode`
  per one-shot with `pan = clamp((sourceX − camera.smoothTarget.x)/26, −0.8, 0.8)` spatialises
  every impact correctly, forever, with no listener maths. `x` is an optional trailing option so
  all ~40 existing call sites keep working.
- Engine gain floor 0.05 → 0.012 after 1.2 s parked, so an unmuted parked buggy stops droning.
- `ctx.suspend()`/`resume()` on `visibilitychange`.

### 2.5 The buggy has weight

All on `Car.shell`; the collider, `CAR` constants and every physics gate are untouched.
`CarPhysics` keeps its already-computed lateral slip as a signed `lateral` and adds a smoothed
`accel`. In `Car.update`, after the body→group copy: `shell.rotation.z = −clamp(lateral/8,±1)·0.16`
(roll), `shell.rotation.x = clamp(accel/10,±1)·0.09` (dive under brakes, squat under power),
`shell.position.y = −clamp(accel/10,±1)·0.04`, each eased at `1−exp(−dt·9)`. The real read at 43°
is the shading change on the flat-shaded navy solar panel and cream nose as they tilt out of the
sun. Tail lights: clone the shared material once (the `Pointer._twins` pattern) and ramp
`emissiveIntensity` 0.6 → 2.4 over 80 ms under braking. Fix the boost-flame flicker to run off
`elapsed` rather than `performance.now` so it is reproducible in Node.
`props.test.mjs:174` counts exactly one ink mesh under `car.shell` — **add no meshes**.

### 2.6 Shadows into the corners, and honest tiers

- `ShadowFollow.aim`: centre the frustum on `focus + (0,0,−7·zoom)` in addition to the `perZoom`
  raise from §1.2, then verify the tower's shade in the **top-right corner** reads ≈`159,73,36`
  and not `189,97,56`.
- `Physics.step` copies `interpolatedPosition`/`interpolatedQuaternion` (cannon-es already
  computes them for `world.step(1/60, dt, 4)`), so 120/144 Hz panels stop stepping at 60.
- `Car.update`'s body→group copy moves **after** `physics.step`: today the mesh is one step stale
  while its own blob shadow reads the fresh body — 0.37 m of separation at 22 m/s.
- Re-arm `sampleQuality({delay:1, window:2})` on arrival in a section (it can only ever lower,
  which matches spec §11), and run it for `prefers-reduced-motion` visitors too — it touches only
  AO and resolution, never motion.

## Tier 3 — the recruiter path and reach

### 3.1 Every text exit works

`UI.js:65` routes `[data-close]` by its value (`resume` → `hideResume()`, else `closeModal()`);
`showResume()` hides `#start` (or `.resume` moves above z 30) and `hideResume()` restores it when
the world has not started; `failToText` does the same. `#scene` gets `tabindex="-1"` so
`canvas.focus()` stops being a no-op; `showPanel`/`showModal` move focus to the close button and
restore it on close; the rendered `<h2>` gets `id="panel-title"` (`index.html:61` points at
nothing today).

### 3.2 A phone that works

`.panel { display:flex; flex-direction:column }` and `.panel-inner { flex:1; min-height:0 }` so
the bottom sheet scrolls to its own buttons; touch controls hidden while the panel is open;
`.chips` capped to `calc(100vw − 120px)` and wrapping, so the bay chip stops running under BOOST;
the toast anchor moved off the EMAIL button; `?` and Contact kept on phones (they are
`display:none` under 760 px today, so a phone has no controls help at all); card copy switches to
touch wording. Drop `maximum-scale=1.0, user-scalable=no` (WCAG 1.4.4).

### 3.3 Tap the ground and the rover drives there

The owner chose tap-to-go **without** the scripted tour. A small pure `src/world/Driver.js`:
`update(dt, car) → {throttle, steer, brake}`, no THREE, no DOM, unit-testable in Node.
Control law from the measured envelope: nose `(−sin yaw, 0, −cos yaw)`,
`steer = clamp(1.6·wrapPi(ψ − yaw), ±1)`, `v* = min(10, sqrt(2·6·(d − 1.0)))` and 8 m/s above
0.5 rad of heading error, brake when `forwardSpeed > v* + 1.5`. Measured stopping distances
(3.1 m from 10 m/s) and the 5.1 m full-lock radius are what park a 3.2 m car inside a 5×3 pad.

Hook: `World.update` builds `input` at `:549`; insert the driver immediately after, and **change
`:656` and `:667` to read `input` rather than `controls`** so a scripted drive gets boost-zoom and
engine sound (today it would be silent). `Pointer` gains a fallback branch: when a click or tap
hits none of the 35 registered targets, intersect the ground plane, clamp to `extents`, and if the
point is 3–70 m away call `driver.goTo`. A 0.9 m cream ring marks it (`{reveal:false}` — objects
added after the reveal finishes are hidden forever otherwise). Any key or joystick input cancels.
Pads keep their current click-to-open behaviour exactly.

### 3.4 A link that previews

`scripts/og.mjs` run after `npm run build` in `deploy.sh`, reusing the launch args from
`e2e.mjs` and the framing from `hero.mjs`: screenshot the Bay Row frame at 1200×630 to
`dist/og.png` — **generated at build, never committed**, so the no-image-files rule holds.
`index.html` gains `og:image`, `og:url`, `twitter:card`, `rel=canonical` and a JSON-LD `Person`
generated from `resume.js` by the same Vite transform that injects the résumé. `theme-color` →
`#1F1A24` (it currently paints butterscotch chrome over a near-black start screen). Redraw
`favicon.svg` as the buggy in the Mars palette.

## Cut, and why

| Idea | Why not |
| --- | --- |
| 64-drone swarm spelling the visitor's initials | Reads as noise at 43° from 30 m; L effort; and it stands on the one stand whose exhibit is currently broken — fix the drone first |
| A timed rally through all eight stations | XL for a CV site; widens the audited pad set from 18 to 26 |
| Night mode | 143 unlit `MeshBasic` materials stay full-bright and fight it; huge pixel-gate risk; a recruiter opening a dark portfolio is worse |
| Sol clock / time of day | Owner chose determinism. Boot state must stay noon for the pixel gates |
| Returning patrol / supply rover | The Mars spec cut it as exactly the class of system that produced the disappearing-tumbleweed bug |
| Walking range crew | Bay Row is the most audited area in the world; figures at z −39.5 sit between a viewpoint and an exhibit |
| Dust storm front | 40 s of degraded legibility; `fog.near` 48 is the measured legibility cliff |
| Sky-crane EDL arrival | XL, and it spends the site's best measured property: the car moves 780 ms after START |
| Three doors on the start screen | Splitting the build across frames creates a window where a section does not exist yet — the exact class of bug that hides from tests |
| Anything drawn in the sky from the ground | Provably outside the frustum; `textures.test` pins the env dome to two children |
| Bloom / tone mapping / colour grading | Breaks the exact cream-face check and the "boards readable by construction" rule |

---

# 3. Build order

Each step ends green on the full gate set before the next begins.

1. **Tier 0 gate hygiene.** Nothing measured after this point means anything until the tier is
   pinned.
2. **Cheap correctness batch:** Safari `localStorage` guard, text exits, crossroads spawn, helipad
   trigger, Contact greeting, drone gate, chip and card hygiene. Land them, run everything, record
   a clean baseline with frames.
3. **Tier 2.1 world text** and the new `check-legible` gate — boards settle *before* the set
   pieces, so every later frame and the `e2e-finish` cream sample are measured against the final
   layout.
4. **Tier 1.1 landing** — self-contained in `PlanePhysics` plus one branch in the crash sweep.
5. **Tier 1.4 launch set piece** — before the atmosphere work, which also touches particle sizes,
   so attribution stays clean.
6. **Tier 2.3 station payloads** and **2.5 buggy feel**.
7. **Tier 2.6 shadows, interpolation, tiers** — core changes that move the measurement baseline;
   measure here, before the fog changes.
8. **Tier 1.2 + 1.3 sun, graded fog, horizon** — one deliberate `e2e-finish` re-baseline, with the
   plane-ceiling and shadow-corner probes as the proof.
9. **Tier 1.5 tracks.**
10. **Tier 2.4 sound.**
11. **Tier 3 shell, phone, tap-to-go, OG image**, then regenerate the hero shots and deploy.

# 4. Acceptance

- `npm run test:unit` green; the seven Node audits green; every `e2e-*` green **with the tier
  pinned**.
- ≤ 450 draw calls and ≤ 300 bodies at the crossroads and Projects spawns, asserted by `e2e.mjs`.
- A held-`S` approach from 8 m, 15 m, 25 m and 34 m reports `Landed`, and a boosted dive and a
  stall still report a hard landing.
- The top row of a frame at the plane's ceiling is **not** the fog colour.
- The Education tower's shade in the **top-right corner** matches its mid-frame value.
- No board's body line projects below 7 px cap height at zoom 1 / 1280×720.
- The résumé's Back button returns to the world on desktop and phone; the mobile panel scrolls to
  its own prev/next buttons.
- Every claim in this document that ends in a number was re-measured after the change, not
  reasoned about.
