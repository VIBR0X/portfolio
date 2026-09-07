# Mars rework: landscape, plane, Projects section, collisions and finish (2026-09-05)

Amends `2026-09-04-scene-upgrade-design.md`. The world layout (section centres, AABBs, roads,
spawn), the resume content, the UI, the car, the lit rendering pipeline and the flight model stay.
This spec moves the range to Mars, rebuilds the plane and the Projects section, replaces every
desert-only ambient system, and closes the drive-through and launch bugs the owner reported.

## The owner's verdict, and what each complaint turned out to be

Verbatim: "Ruined finishing of the game and no plane is actually flyable. I can run through the
assets, and assets like the desert ball randomly disappear in the middle. Make the landscape
Martian (the planet Mars) and improve asset quality and the overall finishing, as the rocket fired
leaves some parts behind. I don't even know what's going on in the projects section, just really
stupid."

Measured on 2026-09-05 in headless Chrome and the Node harness (`scratchpad/hero`, `scratchpad/probe`):

| Complaint | Measured cause |
| --- | --- |
| "no plane is actually flyable" | `Plane.js` builds the fuselage along X with the nose at −X, and the wing along X too (parallel to the fuselage). `PlanePhysics` moves the body along −Z at yaw 0 and pitches about X. The plane sits and flies sideways and its wing is not a wing. `e2e-fly.mjs` passes because it only checks numbers. |
| "the desert ball randomly disappears" | Tumbleweeds are driven by a constant wind force with no rolling resistance, reach 25–30 m/s (measured), and any impact ≥ 6 m/s (a cactus, a fence, a hangar) runs `pop()`, which teleports the weed to the east edge. |
| "the rocket fired leaves some parts behind" | The concrete pedestal is a child of the rocket group and lifts off with it; the four launch clamps are a separate static mesh and stay on the road; the smoke is emitted at a fixed ground point; and the apex (26 m) is above the top of the screen, so the visitor sees clamps and smoke and no rocket (`scratchpad/probe/rocket-2-ascent.png`). |
| "I can run through the assets" | `scripts/check-solids.mjs` (new, in this commit) lists 165 solid-looking static meshes with no static body: all 40 rocks, 69 of 70 scrub bushes, 36 of 40 playground tyre stacks, the Epik warehouse and tank, the DevCom building and podium, the four Skills tank boards, the telephone desk, the trading robot. |
| "I don't know what's going on in the projects section" | Four round pads in a zig-zag, each with an abstract diorama (hut + spinning slip + orbiting cube; 5 m phone with students circling; candlestick bars + robot head + floating cube; a drone that chases the car), full descriptions in small type on the boards, south pads below the bottom edge of the frame. |
| "ruined finishing" | Sage green on everything, hard-coded grey decal colours, cactus/scrub icosahedra, no kerbs, one hill layer, a rocket on the avenue, the material cache making the rocket tip and the robot's eyes flash together. |

## Decisions taken without the owner

The owner asked (2026-09-04) that the recommended option be taken at every decision point and that
work run to completion. Three designers (legibility, world-building, craft) proposed independently,
two judges scored them, and the synthesis below is the craft proposal with the judges' grafts and
every listed flaw resolved. Decisions specific to this pass:

- **Mars is the planet, the base is a flight-test range.** Rust regolith, butterscotch sky, basalt
  pavement, habitat-white shells, cobalt trim, terracotta as a small accent only. A car and a plane
  on Mars are fiction and stay. Nothing is drawn in the sky: from the fixed camera the top of the
  frame is 22.9° below horizontal, so a moon or satellite would never be seen.
- **Tumbleweeds are removed, not fixed.** Dust devils replace them: visual only, no physics body,
  never teleport, never pop. Birds and wind turbines are removed (no life, no wind farms on Mars);
  deep-space dishes take the turbines' positions and three relay beacons blink on the masts.
- **The Projects section is rebuilt as four numbered test stands in one row**, boards behind,
  stencils in front, pads on the avenue, one working model each that reads from 43° above without
  text. The drone no longer follows the car. The rocket becomes an 8 m sounding rocket on a static
  mount whose clamps open, with smoke that follows it and an apex that stays in frame.
- **The plane is rebuilt with the nose toward −Z and the wing along X**, from a shared builder that
  also replaces the mis-oriented landmark plane at Experience. A bounding-box unit test guards the
  axes.
- **One collision rule** (§5), enforced by `scripts/check-solids.mjs` with an explicit allow-list.
- **Cut from the synthesis, deliberately:** the kinematic patrol rover (a second moving vehicle is
  the kind of system that produced the tumbleweed bug; the range has enough motion without it) and
  the tower's plane-tracking dish (the tower keeps its existing radar). Both are recorded here so
  they can be added later if wanted.
- Budget: 60 fps at 1080p on the RTX 3060 laptop, ≤ 450 draw calls all passes (measured baseline
  2026-09-05: 228–445, 246 bodies), ≤ 300 bodies, every module constructing under
  `scripts/dom-stub.mjs`.

---

# The design

Boards behind numbered slabs, one verb per stand, bevelled two-tone models; palette restraint (cobalt and the car's blue are the only saturated cool colours, terracotta only on white, habitat, ink or basalt); a crater decal layer; a two-layer horizon; kerb strips; hangar airlock collars; ground stencils. Where a clearance is quoted it was computed against the real camera (offset (0,26,28)·zoom, focus lift = altitude·0.9, zoom += lift·0.016, vertical FOV 40°, top ray 22.9° below horizontal) and every such number is gated by a measurement in the plan.

Global rule that applies to every section: **any emissive that animates on its own gets its own material** (`flat(...).clone()` or a unique `flat()` key) and its own mesh. `flat()` caches by colour|emissive|intensity, so today the rocket tip already drives the robot's eyes. Never merge two beads that flash at different times.

---

## 1. Mars landscape

### 1.1 Palette (`src/world/Materials.js`)

New keys. Every old key stays as an alias and is re-pointed (second table) so no call site breaks; the reskin list then moves specific call sites off the aliases where the alias no longer fits.

| Key | Hex | Role |
|---|---|---|
| `regolith` | `#B65E38` | ground base tone; the new "lit sand" target |
| `regolithDark` | `#8F4426` | grain low end, crater bowls, skid marks, hill base |
| `regolithLight` | `#D2825A` | grain high end, crater rims, drifts, dust particles |
| `pebble` | `#6E3A24` | 2×2 dot pass in the ground grain |
| `dust` | `#D9A17A` | default particle colour (car, plane, devils, touchdown) |
| `skyBottom` (= `haze`) | `#E6B98E` | fog, clear colour, horizon band, environment horizon |
| `skyTop` | `#B97C50` | zenith (Mars darkens overhead) |
| `basalt` | `#7C5240` | pavement grain base (runway, avenues, aprons) |
| `basaltDark` | `#67433A` | pavement grain low end |
| `concrete` | `#B9B0A2` | sintered block: pedestals, kerbs, tower shaft, feet, stools |
| `habitat` | `#EFEAE0` | every built shell: hangars, tanks, modules, rover bodies, drone top, rocket body — deliberately greyer than board cream |
| `cream` | `#FFF8EA` | boards, markings, labels, plane body, VEDANT letters (brightest surface, unchanged) |
| `cobalt` (= `trim`) | `#2F5D8A` | primary trim: lintels, bands, wing tips, spine, robot body, rising chart |
| `steel` | `#8FA9B8` | equipment grey-blue: catwalks, tank bands, walkways, see-saw plank — replaces every green |
| `steelDark` | `#748E9E` | second equipment tone |
| `rover` | `#2E6DA4` | the car (the one saturated blue in the world) |
| `terracotta` | `#E07A5F` | ACCENT ONLY (≤ 1.5 m and only on cream/habitat/ink/basalt): rocket nose + fins, wing flashes, fin stripe, clinic cross, board accent strips, cones, tail lights |
| `clay` | `#C6634B` | darker accent (SELL label, tail lamps) |
| `navy` | `#1F3550` | solar cell faces |
| `rock` | `#6B4636` | boulders (instance lerp to `#8A5A44`) |
| `hill` | `#8F4426` → `#A85C3E` | near hill ring (instance lerp) |
| `mesaFar` | `#8F4426` → `#B86A45` | far mesa layer (instance lerp; fog-paled) |
| `ink` | `#2B2D42` | unchanged |
| `lamp` | `#FFD166` | unchanged (beacons, eyes, flame, runway lights) |
| `glass` | `#9CCFD8` | canopy, drone rotors, tank glazing |
| `shadow` | `#5A2C18` | blob-shadow discs (`Shadows.js` gradient rgba uses this) |
| `dusk` | `#B8A6A0` | replaces lavender/lilac |

Alias re-pointing:

| Old key(s) | Now |
|---|---|
| `dune`, `sand` | `regolith` |
| `sandDark` | `regolithDark` |
| `tarmac`, `road` | `basalt` |
| `haze` | `skyBottom` |
| `mesa`, `wood` | `regolithLight` |
| `woodDark` | `ink` |
| `sage`, `mint`, `grass` | `steel` |
| `sageDark`, `leaf`, `teal` | `steelDark` |
| `concrete`, `slate` | `concrete` (#B9B0A2) |
| `cobalt`, `blue` | `#2F5D8A` |
| `coral`, `rose` | `terracotta` |
| `coralDark` | `clay` |
| `lavender`, `lilac` | `dusk` |
| `sky` | `glass` |
| `white` | `cream`; `charcoal` → `ink`; `amber` → `lamp` |
| `inkSoft` | unchanged hex, but no longer used by `Area.js` |

Text defaults (`palette.stencil = '#F3E4D2'` is the one key for every floor stencil): `Text.floorLabel` default colour `#8c8798` → `#F3E4D2`; `Area.js` ring idle colour `inkSoft` → `cream`, label colour `#7a768a` → `#F3E4D2`; the hard-coded `#9C8B63` decals (timeline, FUND THESIS, 21 DEVELOPERS, tally, controls hint) → `#F3E4D2`. `Particles.emit` default colour `#DCC08F` → `dust`. `SkidMarks` material `ink` → `regolithDark` (rover tracks, same opacity). `World` passes `palette.rover` to the `Car` constructor.

### 1.2 Ground (`Textures.js`, `World.setFloor`, `Clutter.js`)

`grain()` gains three options, shared by regolith and basalt: `dots` (density, default 0), `dotColor`, `streak` (default 0). After the fbm lerp: for `round(size²·dots)` seeded-rng texels write `dotColor` into the texel and its right and lower neighbours (2×2 pebble); if `streak > 0` multiply `t` by `1 − streak + streak·sin(v·2π·3 + n[i]·4)` (wind streaks along X, parallel to the avenues).

- `regolithGrain()` (replaces `sandGrain`): `grain({ size 1024, seed 3, a regolith, b regolithLight, baseCells 5, octaves 4, speckle 0.05, speckleStrength 0.28, dots 0.004, dotColor pebble, streak 0.08 })`. Tile 24 m; floor mesh, `fitGrain`, `worldToUv` untouched. Floor material roughness 1.
- `wearMap()` gains `discs: [{ cx, cz, r, amount }]`: inside `r` subtract `amount·(1 − smooth(d/r))` (bowl, amount 0.12), then the existing 1.5 m feather outside. Clamp floor 0.80 → 0.78. `World.setFloor` passes `ROAD_RECTS` plus `CRATERS`.
- `CRATERS` (exported from `Clutter.js`): `scatterPoints(world.extents, 12, 23, { margin: 8 })` with `r = 3 + p.r·5` (3–8 m). `scatterPoints(extents, count, seed, { margin = 2.5, sectionMargin = 0 })` gains that options argument; `clearOfRoads`/`clearOfSections` take the margins. Low tier keeps the first 6.
- Crater decal layer (`Textures.craterDecal()` + `World.setFloor`): a 256² RGBA `DataTexture` (no canvas): radial `t`; 0..0.72 → `regolithDark` alpha `0.35·(1 − (t/0.72)²)`; 0.72..0.92 → `regolithLight` alpha `0.4·smooth ramp`; outside alpha 0. One `InstancedMesh(CircleGeometry(1, 24).rotateX(−π/2), MeshBasicMaterial({ map, transparent, depthWrite false, polygonOffset true, polygonOffsetFactor −1, toneMapped false }), 12)` at `(cx, 0.02, cz)` scale `(r, 1, r)`, `renderOrder 1`, `cast false`, `receive false`. `aoMap` only darkens indirect light in three, so the decal is what the visitor sees; the wear bowl deepens it under shadow. No physics (decals are flat).
- Two boulders per crater rim (see §2.4).
- **Ground apron.** The textured floor stays at `extents + 80` so its 512-texel wear map still resolves craters and road wear, which leaves its edge 40 m outside the walls — close enough that from the plane's 34 m ceiling the horizon showed bare sky beyond it. A plain `flat(regolith)` plane 320 m wider and deeper sits at y −0.02 under it, past fog far (170 m) from anywhere the plane can reach: two triangles, one draw call, `castShadow` and `receiveShadow` both false.

### 1.3 Sky

`skyGradient({ bottom: skyBottom, top: skyTop, horizon: 0.55 })`. `THREE.Fog(skyBottom, 90, 170)` high, `(70, 130)` low, `(60, 110)` in the auto-quality fallback. Renderer clear colour `skyBottom`. `environmentScene()`: below = `regolith`, horizon = `skyBottom`, above = `skyTop`, sun disc colour `(4.6, 4.3, 3.9)`. Nothing is drawn in the sky: no moon, no satellite, no birds, no clouds (both judges showed a moon/satellite is outside the frustum from every camera position).

### 1.4 Lighting (`Experience.LIGHTING`, `Materials.ENV_INTENSITY`)

`LIGHTING = { sun: 1.25, hemi: 1.0, sunColor: '#FFF0DE', skyColor: '#F1CFA8', groundColor: '#9C5535', direction: [1, 2, 1] }`. `ENV_INTENSITY 0.55 → 0.60`. Shadow bias/normalBias unchanged; AO unchanged. Boards stay readable by construction: every printed face is `MeshBasicMaterial`, unlit, `toneMapped false`.

First task of the pass, before any visual work: re-baseline `scripts/e2e-finish.mjs` (lit ground target `#B65E38` ±12 per channel, shadowed-ground ratio 0.55–0.70, board-cream assertion unchanged), and `scripts/unit/textures.test.mjs` / `materials.test.mjs` (which pin `sandGrain`/`tarmacGrain`/palette hexes). Blob-shadow gradient rgba → `shadow` `#5A2C18`, strength unchanged.

### 1.5 Hills (`World.setBoundary`)

Two instanced layers, both on the existing seeded perimeter walk:

| Layer | Geometry | Count (high/low) | Distance outside walls | Scale (x, y, z) | y | Colour | Shadows |
|---|---|---|---|---|---|---|---|
| Near hills | `IcosahedronGeometry(1, 0)` | 70 / 50 | 8–18 m (as today) | (6–18, 5–11, 6–18) | −1.5 | `flat('#FFFFFF')`, `setColorAt` lerp `#8F4426`→`#A85C3E` by `rnd()`, seed 7 | cast + receive |
| Far mesas | `CylinderGeometry(0.72, 1, 1, 7)` with `geometry.translate(0, 0.5, 0)` BEFORE instancing so scale acts from the base | 24 / 14 | 30–45 m | (14–22, 9–13, 10–16) | −1 | `setColorAt` lerp `#8F4426`→`#B86A45`, seed 9 | cast false, receive false, `frustumCulled false` |

Mesa tops land 8–12 m above ground, over the 3.5–9.5 m hills (the judges' fix: translate up 0.5, scale y ≥ 9). `setColorAt` is called for every instance in the constructor (allocates `instanceColor` before first render).

### 1.6 Roads (`Roads.js`)

Geometry unchanged. `tarmacGrain()` → `basaltGrain()`: `grain({ size 512, seed 11, a basalt, b basaltDark, baseCells 12, octaves 2, speckle 0.02, speckleStrength 0.2, dots 0.002, dotColor '#8A7568' })`, 12 m per tile. Wear darkening on roads stays at 0.07. All markings, dashes, threshold bars, the `00`, roundabout rings and crossroads arrows stay `cream`.

Kerbs: one merged mesh of `BoxGeometry(len, 0.08, 0.35)` in `concrete`, top at y 0.05, `cast false`, `receive true`, no physics, along both long edges of:

| Road | Edges | Segments (split around roundabouts / crossings) |
|---|---|---|
| North avenue | z −36 and z −24 | x −98..−9 and x 9..98 (gap for the north roundabout, r 8) |
| South avenue | z 25 and z 35 | x 7..84 |
| Runway | x −7 and x +7 | z −112..−38 and z −22..32 |

### 1.7 Per-section recolour list

| Section / prop | Change |
|---|---|
| Hangars (`props/Hangar.js`) | shell + back + ribs `habitat` (DoubleSide); door posts, handles, vent cap `ink`; vent body `concrete`; lintel `cobalt` with cream number; wall lamp unchanged. New: airlock collar `TorusGeometry(radius + 0.05, 0.08, 4, 14, π)` in `terracotta` at the mouth (z = depth/2 + 0.05), and a `cobalt` band `CylinderGeometry(radius + 0.03, radius + 0.03, 0.3, 14, 1, true, π/2, π)` at z = −depth/4; both merged into one mesh per material across all four hangars (+2 draw calls total). Default `color` parameter → `habitat`. |
| Experience dioramas | Epik tank `steel`, pipes `ink`, warehouse `habitat` with `cobalt` roof; Tark boom stripes cream/terracotta; consulting balls → `cream`; corral posts `ink`, ropes `cobalt`; DevCom figures: instance colours `habitat`/`cobalt` alternating; timeline decal `#F3E4D2`. Western landmark plane at (−92, −30): rebuilt with the shared plane builder (§4), static, same paint; body box [8.8, 2.2, 7.0] at (−92, 1.1, −30). |
| Skills tanks | tank cylinders `habitat` with two `cobalt` bands (`CylinderGeometry(r + 0.03, r + 0.03, 0.3)` at 30 % and 70 % height, merged), caps `cobalt`, ladders `ink`, slabs `concrete`, pipes `steel`, flow beads `lamp`; ETL hut walls `habitat`, roof `terracotta`; cargo crates `habitat`/`cobalt`/`steel`/`ink`; PIPELINE YARD stencil `#F3E4D2`. New 8-panel solar row (§2.8). `SECTION_DEFS.skills.color` → `steel`. |
| Education tower | shaft `concrete`, cab `habitat`, cab floor band `cobalt`, catwalk `steel`, roof cone `ink`, beacon `lamp`; podium `concrete`; confetti `terracotta`/`steel`/`lamp`/`cobalt`/`cream`. New roof radar dish (§2.2). |
| Contact building | walls `habitat`, band `cobalt`, hvac + desk `concrete`, dish `cream` on `ink` boom, mast `cobalt`, phone `terracotta`; the four pads keep terracotta fills with cream rings. |
| Playground | lane `concrete`, gutters + backstop `habitat`, pins `cream`, ball `cobalt`, bricks `clay` with cream mortar, see-saw plank `steel` on `cobalt` fulcrum, cones `terracotta` with a cream band, hoop `lamp`, tyres `ink`. Hoop feet get static boxes (§5). |
| Boards (`Board.js`) | panel `cream`, posts `ink`, accent per section: experience `cobalt`, projects `terracotta`, skills `steel`, education `lamp`, contact `cobalt`, intro `terracotta`. |
| Pads (`Area.js`) | idle ring `cream`, active ring section colour, fill section colour at 0.22, label `#F3E4D2`. |
| Intro | VEDANT letters `cream`, THAKRE letters `ink` (both on basalt); hardstand slab `concrete`; windsock stays `terracotta` (accent-sized); runway lights `lamp`. |
| Crossroads signpost | post `ink`, arms `habitat` with section-colour ends; map pad `cream`; crates `rock`. |
| Car (`Car.js`) | body + roof `rover` (roughness 0.55), cabin/skirt/mirrors `ink`, stripe + hubs `cream`, headlights cream-emissive unchanged, tail lamps `clay` emissive, antenna ball `terracotta`, boost flames `lamp`, dust `dust`. |
| Particles | car/plane dust `dust`; touchdown `regolithLight`; rocket exhaust `#D9B08C`; rocket ground cloud `#C98B5F`. |
| Registry | `PROJECTS — Launch Pads` → `PROJECTS — Test Stands`. |

---

## 2. Ambient life on Mars

All modules construct under `scripts/dom-stub.mjs` (geometry, `DataTexture`, `labelMesh` canvases only), use the seeded rng for placement (no `Math.random` in constructors), and `setColorAt` every instance in the constructor.

### 2.1 Tumbleweeds → dust devils (`props/DustDevils.js`, hosted by `World` where `TumbleweedField` was)

- One `InstancedMesh(CylinderGeometry(1.6, 0.35, 9, 8, 1, true), flat(regolithLight, { transparent, opacity 0.32, side DoubleSide, roughness 1 }), 4)` (low tier 2), `material.depthWrite = false`, `renderOrder 2`, `cast false`, `receive false`, no reveal.
- State per devil `{ x, z, heading, speed 2–3, spin 4 rad/s, phase }`. Each frame: `pos += heading·speed·dt`; heading drifts by `N(0, 0.4)·dt`; if the next position is inside any `SECTION_DEFS.aabb` inflated by 6 m, any `ROAD_RECTS` inflated by 3 m, or outside `extents` minus 6 m, rotate the heading by +0.9 rad/s until clear (reflect at extents). Matrix = `compose((x, 4.5, z), Euler(sin(t·1.3 + phase)·0.08, spin·t, cos(t·1.1 + phase)·0.08), (1,1,1))`.
- Dust: every 0.15 s emit 3 particles at `(x, 0.3, z)`, colour `dust`, spread 1.5, velocity `(0, 2.5, 0)`, life 1.0, gravity −2 — only when within 110 m of `camera.smoothTarget`; devils farther than 110 m skip their update entirely.
- No physics body. Car: if the chassis centre is within 3 m of a devil base and its cooldown is 0: apply impulse `(rand·1.2, 2.6·mass, rand·1.2)` to the chassis, `sounds.hit(0.4, 200, { noise })`, 10 dust particles, cooldown 2 s. Plane: flying through one below 12 m sets `PlanePhysics.gust = 0.15 rad` bank nudge decaying over 0.4 s.
- Devils never teleport, pop or sleep — the "disappearing ball" mechanism is gone with the tumbleweeds. Unit test replaces the tumbleweed test: a devil started inside a section AABB exits within 6 simulated seconds; no devil ever leaves extents.

### 2.2 Birds → relay beacons (`Education.js`, `Contact.js`, `Projects.js`)

- The control tower keeps the roof radar it already has (`towerRadar`, slow yaw). Nothing tracks the plane.
- Three relay beacons — tower mast top (0, 22.0, −104), contact mast top (−5, 10.1, 34), rocket gantry top (100.6, 12.3, −30) — each a separate `SphereGeometry(0.16, 8, 6)` mesh with its own cloned `lampMaterial()` (emissive `terracotta`), blinking 0.15 s on every 2 s with phases 0 / 0.7 / 1.4 s. Three meshes, three materials: per-item blinking cannot be done through `instanceColor`, which multiplies diffuse only.
- `Birds.js`, its scatter and horn hook (`Birds.update` plane check, `World` construction), and its unit tests are deleted. The tower's existing horn strobe stays.

### 2.3 Turbines → deep-space dishes (`props/Dishes.js`, replaces `Turbines.js`; `turbinePositions()` kept, `OUT 20`, `HUB_HEIGHT 13`)

- Towers: one merged `habitat` mesh across all 8: `CylinderGeometry(0.35, 0.7, 11, 8)` + `concrete` base `BoxGeometry(2.4, 0.6, 2.4)` at y 0.3 (second merged mesh) + `cobalt` yoke `BoxGeometry(0.5, 1.2, 0.5)` at y 11.6 (third merged mesh). 3 draw calls, static, outside the walls, no physics.
- Dishes: `InstancedMesh(8)` of a merged geometry: reflector `SphereGeometry(3.0, 16, 6, 0, 2π, 0, 1.0)` mirrored in y through `flipY()` (bowl up; the mirror reverses triangle winding, so the index order is restored after it or back-face culling discards the concave side the camera sees — measured) `habitat`, giving a 5.05 m rim, since a 2.4 m saucer 12.4 m up read as a bare pole from inside the walls + feed strut `CylinderGeometry(0.05, 0.05, 1.6)` + feed `BoxGeometry(0.25, 0.25, 0.25)` at the focus. Per frame: `compose((x, 12.4, z), Euler(−(0.95 + 0.1·sin(t·0.15 + i)), 0.5·sin(t·0.08 + i·0.9), 0, 'YXZ'), 1)` — elevation ~55°, slewing ±0.5 rad over ~80 s with staggered phases.
- One merged mesh of 8 `SphereGeometry(0.18)` lamp beads on the yoke tops with a single cloned `lampMaterial` (emissive `terracotta`) blinking together at 0.5 Hz (1 draw call; no per-dish blink).

### 2.4 Cacti → boulders (`Clutter.js`)

`cactusGeometry()` → `DodecahedronGeometry(1, 0)`. Counts unchanged (45 high / 22 low). Material `flat('#FFFFFF', { roughness 1 })`, `setColorAt` lerp `rock #6B4636` → `#8A5A44` by `p.r`. Per instance: `s = 1.1 + p.r·1.3`; matrix `compose((x, 0.55·s, z), Euler(p.r·2, p.r·5, p.r·1.3), (s·(1 + p.r·0.4), s·0.8, s))`; `cast true`. Placement: 24 of them (low 12) in pairs on the crater rims — angle `p.r·2π`, at distance `r·1.05` from each of the 12 crater centres, still passed through `clearOfRoads`/`clearOfSections`; the rest from the existing scatter. Physics: a static sphere `r = 0.8·s` at `(x, 0.5·s, z)`, kind `wall`, for **every** boulder. The spec first bodied only the 24 rim boulders, which left 21 drive-through rocks 1.5–3.2 m tall — exactly the complaint this pass exists to answer.

### 2.5 Rocks → pebbles, scrub → drifts (`Clutter.js`)

- Rocks: same `DodecahedronGeometry(0.6, 0)` instances, scale 0.5–0.9, y 0.22, `setColorAt` lerp `regolithLight` → `#A8674A`, `cast false`, no bodies (ankle-high; driving over reads as intended).
- Scrub → drifts: `SphereGeometry(1, 8, 5)` scaled `(2.4 + p.r·1.2, 0.22, 1.0 + p.r·0.6)`, yaw `p.r·0.6 − 0.3` (streaks along X), colour lerp `regolithLight` → `#DA9068`, y 0, `cast false`, no bodies. Same counts (70 / 34).

### 2.6 Fences → cable barriers

Same three runs, same static box bodies. Posts `CylinderGeometry(0.07, 0.07, 1.0, 6)` `concrete` with a `terracotta` band `BoxGeometry(0.2, 0.15, 0.2)` at y 0.8 (merged); rails replaced by two `cobalt` cables `BoxGeometry(len, 0.05, 0.05)` at y 0.42 and 0.66 (merged into one mesh per run).

### 2.7 Service vehicles → Mars ground vehicles

Same three spots, same static box bodies [1.7, 1.4, 2.6]:

| Old | New | Parts |
|---|---|---|
| truck | tanker rover | cab `RoundedBox(1.5, 1.2, 1.5, 2, 0.1)` `habitat`; tank `CylinderGeometry(0.6, 0.6, 2.2, 10).rotateX(π/2)` `steel` with a `terracotta` band; six wheels `CylinderGeometry(0.3, 0.3, 0.22, 10).rotateZ(π/2)` `ink` (merged) |
| cart | regolith hauler | bed `RoundedBox(1.2, 0.5, 2.0, 2, 0.08)` `cobalt`; heap `DodecahedronGeometry(0.5)` `regolithDark` in the bed; posts `ink`; four wheels `ink` |
| jeep | utility rover | body `RoundedBox(1.5, 0.8, 2.4, 2, 0.1)` `habitat`; cab `RoundedBox(1.2, 0.5, 1.0, 2, 0.1)` `ink` with a `glass` strip; six wheels `ink`; 1.2 m `ink` mast with a lamp bead |

### 2.8 Solar arrays

Panel unit: `InstancedMesh(BoxGeometry(3.0, 0.08, 1.8), flat(navy, { roughness 0.35 }), N)` tilted −0.49 rad about X (top edge north, dark face toward the camera) at y 1.15, plus a second `InstancedMesh` for the frame + legs (merged geometry: two `BoxGeometry(0.08, 1.4, 0.08)` legs at x ±1.3 and a `BoxGeometry(3.04, 0.06, 0.06)` top rail, tilted the same) in `concrete`. Two draw calls per array, `cast true` on panels, `cast false` on legs.

| Array | Positions | Bodies |
|---|---|---|
| Projects south verge | rows z −16.5 and −20.5; x = 22 + i·3.2 (i 0..7) and 54 + i·3.2 (i 0..7) — 32 panels (low: every other one); driving gap x 46..52 | four static boxes [26, 1.6, 2.2] at (33.2, 0.8, z) and (65.2, 0.8, z) for each row |
| Skills east | one row of 8 at x 24, z = −78 + i·3.2 (i 0..7), rotated so the tilt faces +z | one static box [2.2, 1.6, 26] at (24, 0.8, −66.8) |

### 2.9 Windsock and budget

The windsock stays (a flight-test range has one). Draw-call delta for the whole ambient swap: devils +1, dishes +4 (vs turbines 2), beacons +3, craters +1, mesas +1, solar +4, kerbs +1, hangar collars/bands +2 ≈ +23 main pass; birds −1, turbines −2, tumbleweeds −1. Body delta: −10 tumbleweeds (dynamic), −45 cacti, +24 boulders, +5 solar, +2 hoop feet, +40 tyre stacks = +16 (see §5).

---

## 3. Projects section

### 3.1 Concept

Four square test stands in one row on the north side of the avenue, numbered 01–04 west to east, each holding one working model the visitor can name at a glance from 43° above (a field clinic reading slips through a scanner, a campus gate with a stream of students through turnstiles, a trading screen with a robot flipping a BUY/SELL paddle, a drone weaving a painted figure-eight around two pylons). Boards stand behind the stands; a plain-language stencil sits in front of each; the OPEN pad is on the avenue directly south. The range's sounding rocket closes the avenue at the east end; a solar farm edges the south verge. Nothing floats, nothing orbits, nothing follows the car, and the full descriptions live only in the panels.

Why this geometry: from the avenue the camera sees ground from z ≈ −17 (bottom edge) to z ≈ −66 (top edge), so the old south pads were literally off the bottom of the screen. Boards behind the exhibits at z −47.2 with bottom 2.6 m clear every exhibit (the tightest is stand 03: ray over the 4.15 m screen top at z −42.8 from the camera at (y 26, z −5) reaches the board plane at y 1.6, 1.0 m under the panel bottom; with a 3 m northward look-ahead still 1.2 m under). The top-of-frame ray at the board plane is 8.2 m; board top is 5.0 m.

### 3.2 Position table (world metres; slab group origin at (x, 0.3, −42); all inside AABB x 12..100, z −50..−12; avenue z −36..−24 untouched)

| Item | Stand 01 Screening | Stand 02 InstiApp | Stand 03 Trading | Stand 04 Drone |
|---|---|---|---|---|
| Slab centre | (28, 0.15, −42) | (46, 0.15, −42) | (64, 0.15, −42) | (82, 0.15, −42) |
| Slab | `RoundedBoxGeometry(9, 0.3, 9, 2, 0.08)` `basalt`, top y 0.3, spans x ±4.5, z −46.5..−37.5 (all four merged into one mesh); cream border ring `Area.ringGeometry(8.4, 8.4, 0.18, 0.4)` at y 0.31 (merged, one mesh) |
| Slab number | `floorLabel('01'..'04', { width 2.4, height 1.8, color cream, fontSize 1.3, weight 900 })` at (x − 2.9, 0.32, −38.4) — SW corner, 1.3 m type |
| Ground stencil | `floorLabel(text, { width 12, height 1.4, color '#F3E4D2', fontSize 0.85, weight 800 })` at (x, 0.03, −36.8) (between slab edge −37.5 and avenue −36): `MED BAY · LLM READS SLIPS` / `CAMPUS GATE · 5,000 STUDENTS A DAY` / `TRADING FLOOR · DQN AGENT` / `DRONE RANGE · ON-BOARD AUTONOMY` |
| Board | `board(world, { x, z: −47.2, width 7, height 2.6, bottom 2.6, posts true, physics true, accent terracotta, entry id })`; title (titleSize 0.5), subtitle = the stencil text, body = [tags joined ' · '] bodySize 0.34 weight 800 in the accent colour, no paragraph |
| OPEN pad | `addArea({ x, z: −33, width 5, depth 3, label: title.toUpperCase(), color terracotta, actionLabel 'OPEN' })` |
| Exhibit centre | (28, ·, −43) module | (46, ·, −42) gate | (64, ·, −42.8) screen | (82, ·, −42) course |

| Rocket items | Position |
|---|---|
| Launch mount (static) | (96, 0, −30) — pedestal `CylinderGeometry(2.2, 2.6, 0.6, 12)` `concrete`, top y 0.6 |
| Rocket group (flies) | origin (96, 0.6, −30) at rest |
| Service gantry (static) | (100.6, 0, −30), east of the rocket as today (never between the camera and the rocket, never on tarmac) |
| LAUNCH pad | `addArea({ x 90, z −30, width 4.5, depth 3, label 'LAUNCH' })` unchanged |
| Solar farm | see §2.9 |
| Spawn | (40, −31) unchanged |

From the spawn the frame reads: dark avenue left→right through the middle third, stands 01 and 02 with their 1.3 m numbers and boards in the upper third, stencils just above the road, the navy solar rows along the bottom edge, dashes and the `03` numeral pulling east; the rocket fills the top-right after 40 m of driving.

### 3.3 Exhibits (primitive level; local coordinates relative to the slab group origin (x, 0.3, −42), +z toward the camera)

**Stand 01 — field clinic + slip reader** (9 draw calls)

| Part | Geometry | Material | Local position |
|---|---|---|---|
| Module | `RoundedBoxGeometry(4.2, 2.6, 3.4, 2, 0.18)` | `habitat` | (0, 1.3, −1.0) |
| Roof lip | `BoxGeometry(4.4, 0.16, 3.6)` | `cobalt` | (0, 2.68, −1.0) |
| Roof dish | `SphereGeometry(0.45, 8, 4, 0, 2π, 0, 0.5)` inverted on a 0.3 `ink` stem | `cream` / `ink` | (1.4, 2.95, −1.8) |
| Red cross (+z face) | `BoxGeometry(1.2, 0.32, 0.06)` + `BoxGeometry(0.32, 1.2, 0.06)` merged | `terracotta` | (−0.9, 1.6, 0.73) |
| Airlock door | `RoundedBoxGeometry(0.9, 1.7, 0.06, 2, 0.04)` + handle `BoxGeometry(0.5, 0.12, 0.07)` | `cobalt` / `cream` | (1.1, 1.05, 0.73) |
| Bench | `RoundedBoxGeometry(6.0, 0.55, 1.0, 2, 0.08)` | `concrete` | (0, 0.275, 1.9) |
| Slips | `InstancedMesh(BoxGeometry(0.5, 0.7, 0.03), flat('#FFFFFF'), 8)`, `setColorAt` cream before the gate, `cobalt` after | — | on the bench top y 0.9, leaning back 0.2 rad, spaced 0.75, x −2.7..+2.0 |
| Scanner gate | two posts `BoxGeometry(0.08, 1.3, 0.08)` at z 1.9 ± 0.55, crossbar `BoxGeometry(0.08, 0.1, 1.2)` at y 1.85 | `ink` / `cobalt` | x +0.9 |
| Gate bead | `SphereGeometry(0.08)` own mesh, `lampMaterial().clone()` | lamp | (0.9, 1.75, 1.9) |
| SLM unit | `RoundedBoxGeometry(0.9, 0.9, 0.9, 2, 0.15)` + `labelMesh('SLM', 0.7×0.4, cream, 900)` on +z + bead on top (own clone) | `ink` | (2.45, 1.0, 1.9) |

Size 6.0 w × 3.0 h × 4.9 d. Motion: slips glide +x at 0.5 m/s; crossing x = 0.9 flips that instance cream → cobalt over 0.25 s, the gate bead pulses emissive 0.4→1.4→0.4 over 0.3 s, `sounds.blip(1200)` if the car is within 14 m; at x = 2.0 a slip scales to 0 over 0.2 s and reappears at x −2.7 scaling up over 0.2 s (no visible teleport). SLM bead breathes 0.6 ± 0.3 at 1.5 Hz. Horn within 14 m: belt speed ×3 for 3 s. Physics: module box [4.2, 2.6, 3.4] at (28, 1.6, −43); bench box [6.0, 0.55, 1.0] at (28, 0.575, −40.1) (gate posts and SLM unit sit inside its footprint). Slips have no bodies.

**Stand 02 — campus gate + turnstiles + student stream** (12 draw calls)

| Part | Geometry | Material | Local position |
|---|---|---|---|
| Pylons ×2 | `RoundedBoxGeometry(0.7, 3.4, 0.7, 2, 0.1)` (merged) | `cobalt` | (±2.6, 1.7, 0) |
| Lintel | `RoundedBoxGeometry(6.0, 0.55, 0.8, 2, 0.08)` + `labelMesh('CAMPUS GATE · TAP YOUR ID', 4.8×0.42, ink, 800)` on +z | `cream` | (0, 3.45, 0) |
| Counter | `props/Counter` width 4.4 height 1.1 at fontSize 0.5, clearing the lintel top (3.725) facing +z; text `<n> TODAY` → `5,000+ TODAY` — the longer string shrank to ~6 px on screen and could not be read from the camera | — | (0, 4.4, 0) |
| Turnstile posts ×3 | `CylinderGeometry(0.07, 0.07, 1.0, 8)` (merged with rails) | `ink` | (−1.2 / 0 / 1.2, 0.5, 0) |
| Card readers ×3 | `BoxGeometry(0.22, 0.32, 0.12)` (merged with pylons) | `cobalt` | (lane x, 0.95, +0.1) |
| Reader beads ×3 | `SphereGeometry(0.06)`, three separate meshes, each `lampMaterial().clone()` | lamp | (lane x, 1.15, +0.1) |
| Tripod arms | `InstancedMesh(3)` of three `BoxGeometry(0.06, 0.06, 0.6)` at 120° in XZ, each spun about Y | `ink` | (lane x, 0.95, 0) |
| Guard rails ×4 | `BoxGeometry(0.05, 0.9, 1.6)` (merged with posts) | `ink` | x −1.8, −0.6, 0.6, 1.8; y 0.45; z 0 |
| Students | `InstancedMesh(figureGeometry(), flat('#FFFFFF'), 12)`, `setColorAt` cycling `cobalt`, `steel`, `cream`, `#4E6C93`, instance scale 1.4 | — | lanes x −1.2/0/1.2, 4 per lane 2.1 m apart |

Size 6.0 w × 4.55 h × 1.6 d (students span z ±4.2). Motion: each student walks −z from z +4.2 to −4.2 at 0.9 m/s, bobbing 0.03·sin(8t), scaling 0→1 over 0.3 s at spawn and 1→0 over 0.3 s before the wrap; when a student crosses z 0 its lane's tripod rotates 120° over 0.35 s (ease-out), that lane's bead flashes emissive 1.4 for 0.2 s, and `sounds.blip(900)` plays if the car is within 14 m (rate-limited 4/s). Counter starts when the car is within 18 m: +1,000/s to 5,000 then `5,000+ STUDENTS TODAY` highlighted. Horn within 14 m: all three tripods spin and the counter jumps 100 with a ding. Physics: pylon boxes [0.7, 3.4, 0.7] at (43.4 / 48.6, 2.0, −42); one box [4.0, 1.0, 1.7] at (46, 0.8, −42) covering posts, rails and lanes (the gate is a wall to the car by design). Students have no bodies.

**Stand 03 — trading screen + robot trader** (11 draw calls)

| Part | Geometry | Material | Local position |
|---|---|---|---|
| Screen frame | `RoundedBoxGeometry(6.4, 3.2, 0.3, 2, 0.1)`, pivot at its bottom edge, tilted back 0.17 rad about X | `ink` | pivot (0, 0.7, −0.8) → top at world y ≈ 4.15 |
| Display | `BoxGeometry(6.0, 2.8, 0.04)` inset at frame-local z +0.16 | `cream` | child of frame |
| Feet ×2 | `RoundedBoxGeometry(0.5, 0.8, 0.5, 2, 0.06)` (merged with stool) | `concrete` | (±2.4, 0.4, −0.8) |
| Price line | `InstancedMesh(BoxGeometry(1, 0.07, 0.03), flat('#FFFFFF'), 40)`; each instance one segment of a 41-point series across the display (x −2.7..+2.7, y 0.5..2.4 in display space); matrix `compose(midpoint, rotZ(atan2(dy, dx)), (len, 1, 1))`; `setColorAt` `cobalt` rising, `terracotta` falling | — | child of frame at display-local z +0.03 |
| Axis + ticks | `BoxGeometry(5.6, 0.03, 0.02)` baseline + 6 tick boxes (merged with frame) | `cream` | display bottom |
| NOW cursor | `BoxGeometry(0.03, 2.2, 0.02)`, own mesh, `lampMaterial().clone()` | lamp | display right edge |
| Stool | `CylinderGeometry(0.35, 0.4, 0.5, 8)` | `concrete` | (0, 0.25, 1.6) |
| Robot body | `CylinderGeometry(0.42, 0.5, 0.9, 10)` | `cobalt` | (0, 0.95, 1.6) |
| Neck | `CylinderGeometry(0.1, 0.1, 0.3, 8)` (merged with head/arm) | `ink` | (0, 1.55, 1.6) |
| Head | `RoundedBoxGeometry(0.8, 0.7, 0.8, 2, 0.12)`, own mesh (it turns) | `ink` | (0, 2.05, 1.6) |
| Eyes ×2 | `SphereGeometry(0.09)`, merged pair, one `lampMaterial().clone()` | lamp | head-local (±0.2, 0.05, 0.41) |
| Arm | `BoxGeometry(0.08, 0.08, 0.7)` | `ink` | from body right side to the paddle |
| Paddle | `RoundedBoxGeometry(0.55, 0.38, 0.04, 2, 0.03)` + `labelMesh('BUY', cobalt)` on +z and `labelMesh('SELL', clay)` on −z | `cream` | (0.75, 1.7, 1.6), own group (it flips) |

Size 6.4 w × 4.15 h × 3.4 d. Motion: every 0.4 s the series shifts left and appends `v += 0.35·(1.45 − v) + N(0, 0.25)` clamped 0.5..2.4 (seeded rng); the 40 segments are re-posed and re-coloured in one `instanceMatrix`/`instanceColor` update. The paddle flips 180° about Y (ease-in-out 0.3 s) to BUY when the last three points rise and to SELL when they fall; on a flip the head nods (rotation.x 0.15 for 0.25 s) and `blip(700)` within 14 m. The head looks at the car within 16 m (existing lookAt), else faces the screen. Horn within 14 m: an immediate flip. No floating cube. Physics: screen box [6.4, 3.8, 1.2] at (64, 2.2, −42.8); robot cylinder r 0.55 h 2.4 at (64, 1.5, −40.4).

**Stand 04 — obstacle course + rebuilt drone** (9 draw calls)

| Part | Geometry | Material | Position (world) |
|---|---|---|---|
| Pylons ×2 | `CylinderGeometry(0.32, 0.4, 3.0, 8)` (merged) + `cream` collar `BoxGeometry(0.5, 0.08, 0.5)` at y 1.9 | `cobalt` | (80, 1.8, −42) and (84, 1.8, −42) |
| Pylon caps ×2 | `SphereGeometry(0.18)`, two separate meshes, each `lampMaterial().clone()` | lamp | (80 / 84, 3.4, −42) |
| Painted figure-eight | two `TorusGeometry(2.0, 0.05, 4, 32)` flat at y 0.32 (merged) | `cream` | centred (80, −42) and (84, −42); spans x 78..86, inside the slab |
| Home mark | `floorLabel('H', { width 2.2, height 2.2, color cream, fontSize 1.6, weight 900 })` | — | (82, 0.33, −42) |
| Drone top shell | `RoundedBoxGeometry(1.0, 0.16, 1.0, 2, 0.06)` | `habitat` | drone-local (0, 0.08, 0) |
| Drone chassis + arms + pods + skids | chassis `RoundedBoxGeometry(0.9, 0.14, 0.9, 2, 0.05)` at y −0.07; two arms `BoxGeometry(1.5, 0.07, 0.09)` rotated ±45° about Y; four pods `CylinderGeometry(0.1, 0.12, 0.14, 8)` at (±0.62, 0.08, ±0.62); skids `BoxGeometry(0.06, 0.06, 0.9)` at (±0.35, −0.24, 0) on `BoxGeometry(0.05, 0.14, 0.05)` legs (all merged) | `ink` | — |
| Rotors | `InstancedMesh(CylinderGeometry(0.44, 0.44, 0.02, 14), flat(glass, { transparent, opacity 0.5 }), 4)`, each instance spun about its own pod centre | glass | (±0.62, 0.17, ±0.62) |
| Gimbal | `SphereGeometry(0.14)`, own mesh, `lampMaterial().clone()` | lamp | (0, −0.2, 0.3) |
| Camera frustum | `ConeGeometry(0.7, 1.4, 4, 1, true)`, apex at the gimbal, base toward the ground (`rotateX(π)`, translate y −0.9) | glass transparent 0.22 DoubleSide, `depthWrite false`, `renderOrder 1` | child of drone |

Drone home (82, 2.7, −42) (2.4 m above the slab); 1.75 m rotor-to-rotor. Motion: the drone flies the painted figure-eight around the two pylons — lobe A `p = (80 + 2.0·cos a, −42 + 2.0·sin a)`, lobe B `p = (84 − 2.0·cos a, −42 + 2.0·sin a)`, `a` advancing 0.7 rad/s, alternating lobes each 2π (both start at (82, −42) with tangent +z, C1-smooth join); height 2.4 + 0.3·sin(2a) above the slab; yaw faces the tangent; roll 0.25 rad toward the lobe centre; rotors 40 rad/s; when passing the point of each lobe nearest its pylon (a = π for A, 0 for B) that pylon's cap brightens to emissive 1.4 for 0.4 s — obstacle avoidance you can see. The car chase is cut: the drone never leaves the slab. Horn within 12 m: one barrel roll (existing `droneRoll`). Physics: static cylinders r 0.4 h 3 at each pylon. The drone has no body (minimum altitude 2.4 m over the slab, 2.7 m over regolith, above any reachable car height); list it in the audit allow-list.

### 3.4 Rocket (rebuild as an 8 m sounding rocket; only the rocket group flies)

**Static mount** (never moves): pedestal `CylinderGeometry(2.2, 2.6, 0.6, 12)` `concrete` at (96, 0.3, −30) with a `terracotta` ring `TorusGeometry(2.3, 0.08, 4, 24)` on its top edge; flame trench `TorusGeometry(1.3, 0.25, 6, 16)` `ink` sunk to y 0.55; `floorLabel('LAUNCH PAD 1')` 4×0.6 cream at (96, 0.03, −26.6). Four clamp arms, each its own Group parented to the mount, pivot at radius 1.35 on the pedestal top (y 0.6): arm `RoundedBoxGeometry(0.4, 1.1, 0.24, 2, 0.05)` `ink` centred 0.55 above the pivot with a `cream` pad `BoxGeometry(0.42, 0.14, 0.26)` on top. Service gantry at (100.6, 0, −30) as today (two `concrete` uprights at z ±0.35, cross braces, three `steel` walkways reaching west to x 98.4), plus an umbilical arm Group pivoted at (100.6, 5.8, −30): `cobalt` `BoxGeometry(3.6, 0.2, 0.2)` reaching the body at x 96.9. Gantry beacon per §2.2.

**Rocket group** origin (96, 0.6, −30) (sits on the pedestal), local y:

| Part | Geometry | Material | Local y |
|---|---|---|---|
| Bell | `ConeGeometry(0.55, 0.7, 12, 1, true)` inverted, DoubleSide, own material clone with lamp emissive 0 | `ink` | 0.35 (rim 0..0.7) |
| Body | `CylinderGeometry(0.8, 0.8, 5.4, 12)` | `habitat` | 3.4 (0.7..6.1) |
| Bands ×2 | `CylinderGeometry(0.83, 0.83, 0.3, 12)` (merged) | `cobalt` | 2.2 and 4.8 |
| Nose | `ConeGeometry(0.8, 1.8, 12)` (merged with fins) | `terracotta` | 7.0 (tip 7.9) |
| Tip lamp | `SphereGeometry(0.16)`, own mesh, `lampMaterial().clone()` | lamp | 8.0 |
| Fins ×4 | `BoxGeometry(0.14, 1.5, 1.0)` at radius 0.85, inner face 0.05 into the body, rotated outward (merged with nose) | `terracotta` | 1.45 |
| Grid fins ×4 | two crossed `BoxGeometry(0.45, 0.45, 0.05)` at radius 0.95 (merged) | `ink` | 5.5 |
| `VT-1` | `labelMesh` 0.9×0.35 on the +z face | ink on cream | 4.0 |
| Flame | `ConeGeometry(0.5, 2.4, 8)`, apex up inside the bell, base 2.4 below; own `lampMaterial().clone()` emissive 2; visible only while ascending; `scale.y` 0.8–1.2 flicker at 30 Hz | lamp | −0.9 |
| Parachute | `ConeGeometry(2.0, 2.2, 8, 1, true)` DoubleSide `cream` with two `terracotta` gores (second partial cone), rim just above the tip, + four `CylinderGeometry(0.02)` shroud lines to the nose at y 7.6 merged in `ink`; hidden until descending | — | centre 9.3 (rim 8.2, top 10.4) |

Rocket height 8.0 above its base: tip at world 8.6 at rest. Physics: a `CANNON.Body.KINEMATIC` cylinder r 1.0 h 8 at (96, 4.6, −30), `userData { kind: 'wall', tag: 'wall' }` (mass 0 + kind wall keeps it in `staticSolids`, so the plane can still crash into it). Each frame while not idle: `body.velocity.y = (rocket.y − prev.y)/dt; body.position.y = 4.6 + rocket.y` — cannon handles the contact with a car parked against the pad, and the empty pad is never a phantom wall.

**Sequence** (`rocketLaunch.js`, `ROCKET_APEX = 9`): countdown 3 s (chip T-3..T-1, tip lamp blinks, bell emissive 0→1.4); from t 2.4 the clamp arms hinge outward about their tangential axis 0→1.0 rad (ease-out 0.5 s) and the umbilical swings back (rotation.y 0→1.05 rad over 0.6 s); T-0: `LIFT-OFF`, whoosh, flame on, `camera.shake(0.5)` if the car is within 25 m; ascending 3 s with ease-OUT: `y = 9·(1 − (1 − k)²)` (fast off the pad, zero vertical speed at apex, so the 0.5 s camera lag never lets the tip leave the frame); coasting 0.6 s (flame off, bell emissive → 0); parachute scales 0.2→1 over 0.3 s; descending at 2.6 m/s with `x = 96 + descentDrift(t, y)`, where `descentDrift = −1.2·sin(0.8·t)·clamp01(y / 2.5)` — the drift goes **west**, away from the gantry (drifting east put the +x fin through the 7 m and 3.5 m walkways for 38 and 33 frames), and fades to zero over the last 2.5 m so the rocket arrives centred instead of being snapped 0.43 m sideways on touchdown; at y ≤ 0: settle on the pedestal, parachute collapses over 0.25 s, parachute hidden, clamps and arm swing back over 0.5 s, `sounds.hit`, toast `Recovered.`, cooldown 6 s. `rocketStep` stays a pure function; update its unit test for the new curve and apex.

**Smoke follows the rocket**: every 0.06 s while ascending emit 5 particles at `rocketGroup.position + (0, 0.2, 0)` with velocity `(0, −3, 0)`, spread 1.0, gravity +1.0, life 1.4, size 0.35, colour `#D9B08C`; for the first 0.8 s of ascent also 8 particles per 0.06 s at (96, 0.9, −30), velocity `(0, 0.8, 0)`, spread 3.2, gravity 0.5, life 1.8, size 0.45, colour `#C98B5F` (the pad dust cloud). The fixed ground emitter is deleted.

**Camera**: while the state ≠ idle and the car is within 45 m, call `world.requestFocusAltitude(min(7.2, rocket.y · 0.8))` and `world.requestMinZoom(1)` (new: `Camera.update` clamps `zoom` to ≥ the requested floor for that frame, so a visitor scrolled to 0.55 still sees the whole flight). Measured for this design at apex: focus lift 6.48 m, zoom 1.104, camera at y 35.8 and 30.9 m south of the focus; top-of-frame ray at the pad is y 22.75; rocket tip 17.6, parachute top 20.0, pad at 0 and the ground from 12.6 m south of the focus — the whole flight, mount, clamps and chute stay on screen with 2.7 m to spare. Gate: re-run `scratchpad/probe/rocket.mjs` from the LAUNCH pad and confirm `rocket-2-ascent.png` shows tip, body, pedestal and chute inflation in one frame before claiming the fix.

### 3.5 Interactions

OPEN pads (Enter/E/click) at (28|46|64|82, −33) toggle the four resume panels. LAUNCH pad or horn within 14 m of the rocket arms the countdown. Horn within 14 m: stand 01 belt sprints, stand 02 turnstiles spin + counter +100, stand 03 immediate paddle flip; within 12 m of stand 04: barrel roll. Driving within 18 m of stand 02 starts its counter; within 14 m of 01/03 enables their sounds. Bumping a slab kerb, gate, screen, robot, pylon, solar row, mount or gantry gives the normal wall tock. R here recovers the rocket immediately if airborne; there are no dynamic props in the section. Nothing teleports, vanishes or follows the car.

### 3.6 Budget (applied, not deferred)

Main-pass meshes with the whole section in frustum: 4 stands × (slab 1 shared, border 1 shared, number 1, stencil 1, board 3, pad ~3) ≈ 34; exhibits 9 + 12 + 11 + 9 = 41; solar 2; mount 5 (pedestal+ring+trench merged 2, clamps 4 → merge into one mesh per frame? no: 4 small meshes, they rotate independently), gantry 3; rocket 9; LAUNCH pad 3 ≈ 105 vs ≈ 90 today. The old section's 16 loose meshes (candles, orbiting cubes, phone, walkers) are gone, taglines/numerals/stencils are `MeshBasic` and never enter the shadow or AO-normal passes, solar legs are one instanced mesh with `cast false`. Expected all-pass total ≈ 440 at the LAUNCH pad, ≈ 400 at the spawn; measure with `scripts/e2e.mjs` before and after, 450 is the gate. Bodies in the section: 4 slabs, 4 boards, 2 + 3 + 2 + 2 exhibit bodies, 4 solar, mount 1, gantry 1, rocket 1 = 24 (old: 17) → +7.

---

## 4. Plane rebuild (`src/world/Plane.js`, shared builder also used by `Experience.buildPlane`)

Local frame: +X right wing, +Y up, −Z nose (matches `PlanePhysics`: forward = `(sin yaw·cos pitch, 0, −cos yaw·cos pitch)`, quaternion from `Euler(pitch, yaw, bank, 'YXZ')`, pitch about X, bank about Z). Group origin at the physics body centre; `PLANE.groundY 1.05` stays; spawn `[17, 1.05, −6]` stays (nose tip at world z −9.45, inside the hardstand z −9.5..−2.5; wing spans x 12.7..21.3, clear of the windsock at (11, −6)). Note on three's rotations: `CylinderGeometry`/`ConeGeometry` point +Y; `rotateX(+π/2)` maps +Y → +Z (radiusTop end goes to the TAIL); `rotateX(−π/2)` maps +Y → −Z (apex to the NOSE).

| # | Part | Geometry (local metres) | Material | Merge group |
|---|---|---|---|---|
| 1 | Fuselage | `CylinderGeometry(0.44, 0.72, 5.0, 10).rotateX(π/2).translate(0, 0, 0.3)` — 0.72 end at −Z (nose); spans z −2.2..+2.8 | `cream` | body |
| 2 | Cowl | `CylinderGeometry(0.74, 0.62, 0.7, 10).rotateX(π/2).translate(0, 0, −2.5)` — overlaps the fuselage front 0.35 | `cobalt` | trim |
| 3 | Spinner | `ConeGeometry(0.3, 0.6, 10).rotateX(−π/2).translate(0, 0, −3.15)` — tip at z −3.45 | `ink` | ink |
| 4 | Propeller | hub `CylinderGeometry(0.1, 0.1, 0.2, 8).rotateX(π/2)` + `BoxGeometry(1.7, 0.14, 0.05)` + `BoxGeometry(0.14, 1.7, 0.05)` merged; mesh at (0, 0, −2.95); `propHub.rotation.z += dt·(4 + speed·3)` (about Z, the thrust axis — today it spins about X) | `ink` | own mesh |
| 5 | Cabin glazing | `RoundedBoxGeometry(1.16, 0.56, 1.7, 2, 0.12)` at (0, 0.82, −0.55) — bottom sinks into the fuselage, top (1.10) meets the wing underside (1.04): no dome through the wing | `glass` (roughness 0.15, transparent, opacity 0.75) | own mesh |
| 6 | Wing | `RoundedBoxGeometry(8.6, 0.16, 1.4, 2, 0.06).translate(0, 1.12, −0.5)` — span along X, chord along Z | `cream` | body |
| 7 | Tailplane | `BoxGeometry(2.6, 0.12, 0.7).translate(0, 0.32, 2.5)` | `cream` | body |
| 8 | Fin | `ExtrudeGeometry` of Shape (0,0)→(0.9,0)→(0.65,1.25)→(0.25,1.25), depth 0.14, no bevel; `rotateY(−π/2)` so the shape lies in the YZ plane with its base along +Z, then `translate(0, 0.38, 2.0)` — tip at y 1.63, trailing edge z 2.9 | `cream` | body |
| 9 | Wing tips | `BoxGeometry(1.0, 0.18, 1.42)` at (±3.5, 1.12, −0.5) | `cobalt` | trim |
| 10 | Tailplane tips | `BoxGeometry(0.5, 0.14, 0.72)` at (±1.05, 0.32, 2.5) | `cobalt` | trim |
| 11 | Spine | `BoxGeometry(0.34, 0.12, 4.2)` at (0, 0.7, 0.55) — along Z | `cobalt` | trim |
| 12 | Fin cap | `BoxGeometry(0.16, 0.28, 0.5)` at (0, 1.5, 2.45) | `cobalt` | trim |
| 13 | Wheel pants ×2 | `RoundedBoxGeometry(0.34, 0.5, 0.86, 2, 0.08)` at (±1.05, −0.55, −0.35) | `cobalt` | trim |
| 14 | Wing flashes ×2 | `BoxGeometry(0.42, 0.19, 1.42)` at (±2.2, 1.12, −0.5) | `terracotta` | accent |
| 15 | Rudder stripe | `BoxGeometry(0.16, 0.3, 0.55)` at (0, 0.85, 2.35) | `terracotta` | accent |
| 16 | Wing struts ×2 | `CylinderGeometry(0.05, 0.05, 1.9, 6)` oriented by `quaternion.setFromUnitVectors` from (±0.62, 0.18, −0.3) to (±2.3, 1.04, −0.45) | `ink` | ink |
| 17 | Main gear legs ×2 | `BoxGeometry(0.08, 0.5, 0.16)` from the belly (y −0.5) to the axle at (±1.05, −0.75, −0.35) | `ink` | ink |
| 18 | Main tyres ×2 | `CylinderGeometry(0.3, 0.3, 0.22, 12).rotateZ(π/2)` at (±1.05, −0.75, −0.35) — bottom at −1.05 = ground exactly | `ink` | ink |
| 19 | Nose leg + tyre | leg `BoxGeometry(0.08, 0.36, 0.1)` at (0, −0.6, −2.3); tyre `CylinderGeometry(0.24, 0.24, 0.18, 10).rotateZ(π/2)` at (0, −0.81, −2.3) | `ink` | ink |
| 20 | Nav beads + tail beacon | `BoxGeometry(0.12, 0.1, 0.2)` at (±3.98, 1.14, −0.6); `SphereGeometry(0.08)` at (0, 1.66, 2.15); merged, one `lampMaterial().clone()` | lamp | own mesh |
| 21 | Registration | `labelMesh('VT-VED', 1.6×0.4, ink on cream)` cloned at (±0.74, 0.12, 0.9), `rotation.y = sx > 0 ? π/2 : −π/2` (faces outward) | — | 2 meshes |
| 22 | Prop disc | `CylinderGeometry(0.85, 0.85, 0.02, 16).rotateX(π/2)` at (0, 0, −2.95), `glass` transparent 0.5; shown above 8 m/s while the blade prop is hidden | glass | own mesh |

Draw calls: body 1, trim 1, accent 1, ink 1, prop 1, disc 1, glass 1, lamps 1, labels 2 = 10. Every box ≥ 0.5 m is a RoundedBox. Extents: X 8.6 (wing), Z −3.45..+2.9 = 6.35, height −1.05..+1.63. Collider unchanged: `PLANE.size { w 2.4, h 1.7, l 6.4 }` (fuselage box; `l` now correctly along Z). `BlobShadows` entry for the plane: `rx 4.1, rz 3.3` (was sized for the wrong axis). `Experience.buildPlane` calls the same exported `buildPlaneMesh()`; the sideways-built version is deleted.

Paint: cream body, nose cone, wing, tailplane and fin; cobalt cowl, spine, wing tips, tailplane tips, fin cap and wheel pants; terracotta only on the two wing flashes and the rudder stripe; ink spinner, prop, struts, gear; glass cabin; lamp beads. From above: a cream cross with cobalt ends and a cobalt nose — heading is unambiguous, roll shows in the flashes, yaw in the red rudder.

Feel (flight-model numbers stay as measured; e2e-fly numeric checks unchanged):
1. `PLANE.ceiling 46 → 34` so the ground never leaves the frame.
2. Blob shadow altitude cue (`Shadows.update`, plane entry only): `scale · (1 + y/60)` and a per-instance alpha of `clamp(1 − y/80, 0.5, 1)` folded into `diffuseColor.a` by an `onBeforeCompile` patch (`InstancedMesh` has no per-instance opacity), instead of the generic shrink-to-0.15. The spec first said `clamp(1 − y/40, 0.25, 1)`; measured at the 34 m ceiling that peaks at 4.3/255 under the disc — fainter than the flat cue it replaces — because the desktop blob strength was later halved to 0.16.
3. Ground-roll dust: while grounded and speed > 3 m/s emit 2 particles per 0.1 s at each main wheel (`group.localToWorld(±1.05, −0.6, −0.35)`), colour `dust`; 12 particles on `justLifted`. This replaces the single centre-line prop-wash emitter.
4. Visual bank exaggeration: the mesh lives in a child `shell` group whose Euler is rebuilt from the physics values with `bank·1.2` and `pitch + 0.15·sign(vy)` when |vy| > 1; the body keeps the true values.
5. Prop disc swap above 8 m/s (#22).
6. Camera: no change for the plane (the airborne screenshot is already framed; the altitude follow does its job).
7. New unit test (`scripts/unit/plane.test.mjs`): build the plane under the DOM stub, compute the group's `Box3`, assert X extent ≥ 8.4 and Z extent 6.0–7.2, and assert the propeller mesh's position.z < −2.5 (nose end). This is the check that would have caught the sideways plane. Also screenshot the hardstand (`scripts/hero.mjs` intro frame) and confirm the nose points up the runway with the wingspan across it.

---

## 5. Collision rule for the world

One rule, enforced by `scripts/check-solids.mjs` (extend it to walk every mesh under `world.scene` and compare against the body list) with an explicit allow-list:

- **Static body (kind `wall`)**: every prop the car can drive to whose top is ≥ 0.5 m above its local ground and whose footprint is ≥ 0.4 m in both axes. This includes: slabs, boards (via `board()`), exhibit modules/benches/gates/screens/robots/pylons, solar rows (one box per row-half), rocket mount, gantry, hangar walls, tanks, tower, contact building, playground props including the hoop feet (`BoxGeometry`-sized boxes), the ramp and every tyre stack of the tyre ring (one static cylinder r 0.85 per stack, height 0.5 + 0.4·stacks), fences/cable barriers, service rovers, the landmark plane, every boulder (sphere `r = 0.8·s`), the two consulting corral gate posts, and the Skills solar row. Bodies are `sleepy: false`, mass 0.
- **Kinematic body**: things that move on rails and must push the car — the flying rocket (kind `wall`, moved with velocity set each frame). The plane body is already kinematic. `staticSolids` (mass 0 and kind `wall`/`board`) drives the plane crash sweep.
- **Dynamic body (kind `prop`)**: only the existing knockable toys (pins, ball, bricks, crates, cones); nothing new in Projects.
- **No body, by rule**: anything under 0.35 m tall (pebbles, drifts, kerbs at 0.08, decals, floor labels, painted rings, crater decals, slab borders); anything the car cannot reach (roof dishes, drone at ≥ 2.4 m, slips on a bench inside a body, students inside the gate body, rotors, dishes on the horizon, hills and mesas beyond the walls, cable beads); transparent volumes (dust devils, the drone's camera frustum, prop disc) — those instead apply impulses or nothing.
- The audit is `node scripts/check-solids.mjs` (already written; it walks every lit, opaque mesh under `world.scene` whose box is ≥ 0.4 m tall, starts below 1.6 m and has a footprint ≥ 0.5 m in x and z — or ≥ 0.2 m when the mesh is at least 1 m tall, so poles and gate posts are audited too — and requires a static body AABB to overlap it; the 0.5 m floor alone hid the two consulting corral posts the car drove through). It exempts by name: `floor`, `roads`, `road-markings`, `hills`, `mesas`, `car`, `plane`, `red-button`, `hangar` (the drive-in shell), `instanced-props` (dynamic crowds). New allow-list names (set `object.name` on the mesh or group): `drone` (≥ 2.4 m up), `tanks-ink` (ladders on bodied tanks), `signpost` (arms), `totem-cube` (cube tops at 1.55 m over a bodied post), `epik-pipes` (0.2 m pipes inside a drive-in hangar), `dust-devils`, `pebbles`, `drifts`, `crater-decals`, `kerbs`. It must exit 0 at the end of the pass.
- Every new static prop rests on its support (slab top 0.3, pedestal top 0.6, ground 0) with no gap; `check-rest.mjs` must pass with the new list, and it must not be asked to settle kinematic instanced things (students, slips).

Body ledger from today's 246: −10 tumbleweeds, −45 cacti, +24 boulders, +5 solar, +2 hoop feet, +40 tyre stacks, +6 section fixes (Epik warehouse and tank, DevCom building and podium, telephone desk, four Skills boards), +7 Projects net ≈ 280. Static bodies cost nothing per frame in the SAP broadphase once asleep, so the old ≤ 250 line moves to ≤ 300.

---

## 5a. Pads must have room for the car

An interaction pad is only real if the car can stop on it. The FLY pad was 5 x 3 centred at
(17, -3), on the plane's tail: the plane's collider reaches z -2.8, so a car driving up from the
south wedged against it with its centre at z -1.2, while the pad needed -1.5 or less. The pad never
activated and the plane could not be boarded by driving to it at all — the whole flight feature was
unreachable. Every automated check missed it because they teleported the car into the pad instead
of driving to it.

- The hardstand slab is 9 x 10 centred at (17, 0.05, -4.5), and the FLY pad is 5 x 3.4 centred at
  (17, -0.6), which is where a car driving north actually comes to rest against the plane.
- `node scripts/check-pads.mjs` asserts, for all 18 pads, that the car fits at the pad's **centre**
  in the orientation the pad's shape implies (a pad wider than it is deep is entered nose-first
  along z). Testing "some point in the rect is free" is too weak: the old FLY pad had free points at
  its x edges, where a car could thread past the wingtip, and passed.
- `scripts/e2e-fly.mjs` drives the last stretch onto the pad rather than teleporting onto it.

## 6. Open risks

1. **Pixel baselines encode the old desert.** `e2e-finish.mjs`, `textures.test.mjs`, `materials.test.mjs` and the hero/probe checks pin sand `#E9D4A6`, tarmac, haze and a shadow ratio. Re-baseline first (§1.4); then measure, never eyeball — rendering bugs here have hidden from tests before.
2. **Rocket framing is computed, not yet measured.** Numbers in §3.4 assume aspect 16:9 and the `Camera` lift/zoom terms as they exist today; `scratchpad/probe/rocket.mjs` from the LAUNCH pad is the gate. If the tip or chute clips, the fix order is: parachute centre 9.3 → 8.9, then `ROCKET_APEX` 9 → 8. Do not touch the model or the camera terms.
3. **Board clearance must be re-run from the pad**, not from the numbers: `check-boards-clear.mjs` and `check-boards.mjs` with boards at z −47.2 / bottom 2.6 / width 7 / subtitle + tag line at 0.34 — if a tag line overflows, shorten to two tags.
4. **Draw calls**: ≈ 440 all passes at the LAUNCH pad is an estimate with the trims applied. Measure with `scripts/e2e.mjs` at (40, −31) and at (90, −30) before and after. If over 450: merge the four clamp arms into one mesh that animates as a unit (−3), then merge the three reader beads into one (−2, dropping per-lane flash).
5. **Plane orientation must be verified with a screenshot** at the hardstand and in e2e-fly's banked frame; the bounding-box test catches a swapped axis but not a mirrored nose. Double-check the `rotateX` sign note in §4 against three 0.185 before trusting the merged fuselage.
6. **Terracotta on rust is invisible by design**; if any of the remaining accent uses (windsock, cones, pad labels, the clinic cross on white) vanishes in the hero shots, swap that one use to `lamp` or `cream`. If the whole base still reads "brown", lighten `regolithLight` to `#E09466` in the grain — never brighten the sun.
7. **Dark basalt + GTAO can go muddy** in hangar shadow. Fallback if the finish probe fails on pavement: `basalt #86594A`, `basaltDark #71493F`; AO stays.
8. **Transparent devils, drone frustum and prop disc** are `depthWrite false`; they may sort wrongly against the canopy or tank glazing for a frame. Accept it; never enable `depthWrite` (the AO normal pass would treat them as solid) and never let them cast.
9. **Kinematic rocket body**: cannon integrates kinematic motion from `velocity`; setting only `position` leaves the car's contact stale. Set both each frame (§3.4) and confirm with the car parked against the pedestal at T-0 that it is pushed, not embedded.
10. **`setColorAt` before first render**: hills, mesas, boulders, pebbles, drifts, slips, price line, students all rely on `instanceColor`; initialise every instance in the constructor or the mesh renders black.
