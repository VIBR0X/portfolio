# Proving Ground — Vedant Thakre's drivable résumé
## Final build spec (implement verbatim)

Base: **Proposal 3** (world, budget, build order). Grafted: Proposal 2's recruiter layer (top bar, click-any-board raycast, number-key teleports, prev/next, start-screen fact chips, camera swoop, brake-first reverse, timeline decal, playground sign, map resets) and Proposal 1's fun layer (big red reset buttons, physics-as-reveal, confidence-gate boom barrier, 21-developer pins, SOURCED n/9 corral, following drone, per-material impact sounds, squash-and-stretch, camera lead + panel nudge, ramp airtime toast, gamepad, auto-upright/stuck detector). Conflicts resolved below; there are no options in this document.

---

## 1. Concept & tone

A low-poly desert flight-test range you drive around in a small cobalt rover. The résumé is laid out as the stations of the range: a runway where the name stands as twelve knockable 3D letters, a signpost roundabout, a row of four drive-in hangars for Experience (each one is a physics toy that literalises the job: lift Tark's confidence gate with your bumper, watch Epik's seven pipes feed BigQuery, shove nine company balls through a "fund thesis" gate, bowl through DevCom's 21 developers), four launch pads for Projects (a drone that lifts off and follows you), a pipeline yard for Skills (labelled tanks, pipes with flowing data, a stack of cargo crates to topple), a control tower for Education & Awards, a test-range playground (bowling, bricks, slalom timer, ramp + hoop, see-saw), and Ground Control for Contact, placed directly behind the spawn so it is one U-turn away. The metaphor is Vedant's own arc, aerospace engineer turned decision-systems and data-infrastructure builder; every prop is something you would find on a test range and every résumé number is attached to something with mass.

Tone: warm, toy-like, tactile, never a brochure. Flat pastel toon shading, soft blob shadows, pitched synthesised clinks, a car that squashes when it lands. At the same time a hiring manager with 90 seconds is never gated by driving: the start screen pitches him before the world loads, a persistent top bar exposes PDF / Contact / Map / Text at all times, every board and pad is clickable from any distance, number keys teleport, and the detail panel steps through the résumé in order. Driving is the delight, not the gate.

---

## 2. Palette and material rules

| Name | Hex | Use |
|---|---|---|
| Dune | `#E9D4A6` | Ground plane |
| Tarmac | `#CDB07E` | Roads, runway, roundabout slabs, aprons, lane slab |
| Haze | `#F7EFDD` | Renderer clear colour, fog colour, loading/start overlay background |
| Terracotta | `#E07A5F` | VEDANT letters, rocket nose/fins, bricks (odd), cones, warning stripes, red-button domes, section colour Projects |
| Clay | `#C6634B` | THAKRE letters, bricks (even), tail lights |
| Cobalt | `#3D5A80` | Car body, signpost arms, pad border (idle), tower cab trim, section colour Experience |
| Sage | `#81B29A` | Hangar shells, tanks, see-saw plank, pad border (active), section colour Skills |
| Cream | `#FFF8EA` | Board faces, car cabin/roof, pins, gantry crossbars, hub caps |
| Ink | `#2B2D42` | All board text, wheels, posts, drone body, phone frame, tower roof |
| Concrete | `#BFB8A8` | Pad slabs, tower shaft, Ground Control building, ramp, podium, warehouse |
| Glass | `#A8DADC` | Car windshield, tower glazing (opacity 0.6, transparent) |
| Lamp | `#FFD166` | Emissive beacons, gate lamp, trophy, confetti, runway edge lights, boost flame, flow spheres, section colour Education |
| Mesa | `#D4A373` | Boundary hills, fuel drums |
| Shadow | `#6B4E2E` | Blob shadows (radial gradient, 0.28 peak alpha) |

Material rules:
- **One material family: `MeshToonMaterial`** with a shared 3-step `gradientMap` (`DataTexture` 3×1, values 96/168/255, `NearestFilter`, `LinearSRGBColorSpace`), `flatShading: true`. This is the matcap-like look. No `MeshStandardMaterial`, no shadow maps, no image textures.
- Lights: `HemisphereLight(0xFFF3DC, 0xD9B27A, 1.1)` + `DirectionalLight(0xffffff, 0.7)` at direction `(1, 2, 1)`, `castShadow: false`.
- Merged static geometry uses `vertexColors: true` on one Toon material per section-independent colour group (see draw-call ledger). Build merged geometry with `BufferGeometryUtils.mergeGeometries` after `toNonIndexed()` so flat shading stays crisp.
- Emissive props (beacons, lamps, flow spheres, trophy, gate lamp) share one `MeshToonMaterial({ color: Lamp, emissive: Lamp, emissiveIntensity: 0.6 })`.
- Boards: `MeshBasicMaterial` with `CanvasTexture` (Cream face, Ink text), `generateMipmaps: false`, `minFilter/magFilter: LinearFilter`, `colorSpace: SRGBColorSpace`, `anisotropy: 4`.
- Decals/pads/shadows: `MeshBasicMaterial`, `transparent: true`, `depthWrite: false`, `polygonOffset: true, polygonOffsetFactor: -1`. Heights: roads y=0.01, decals 0.02, pads 0.03, shadows 0.04.
- Floor: `PlaneGeometry(280, 240)` Dune, one draw call, `receiveShadow` off.
- Sky/fog: `renderer.setClearColor(Haze)`; `scene.fog = new Fog(Haze, 90, 170)` (mobile: 70, 130). No skybox.
- Renderer: `antialias: dpr <= 1.5`, `powerPreference: 'high-performance'`, `pixelRatio = min(devicePixelRatio, 2)` desktop / `1.5` mobile, `outputColorSpace: SRGBColorSpace`.

---

## 3. World layout

Axes: +x east, −x west, −z north, +z south, y up. Car spawns at `(0, 0.8, 0)` facing north (−z). The camera looks north and down, so every board faces +z (south) and is tilted back 30°.

```
                                    z
   x=-110                            -130 ─── boundary wall ──────────────────────────── x=+110
   ┌───────────────────────────────────────────────────────────────────────────────────┐
   │                  [T] EDUCATION — Control Tower (0,-100)  rack(-9,-98) podium(9,-98) │
   │                          warehouse(-13,-90)   H-pad (0,-96)                         │
   │              tanks(-12,-82) (12,-82 pump)   [S] SKILLS — Pipeline Yard (0,-70)      │
   │              tanks(-12,-70) (12,-70)          pad (0,-70)                           │
   │              tanks(-12,-58) (12,-58)          dock+crates (11,-48)                  │
   │                                              ║                                      │
   │ plane      H4     H3     H2     H1           ║          A(40,-42)     C(64,-42)     │
   │ (-92,-30)  -76    -64    -52    -40          ║                                      │
   │ ══════════[X] EXPERIENCE (-60,-30)══════[+] CROSSROADS (0,-30)═══[P] PROJECTS (60,-30)══ rocket(96,-30)
   │            pads z=-33                        ║          B(52,-18)     D(76,-18)     │
   │                                              ║                                      │
   │                                    THAKRE (0,-14)                                   │
   │                                    VEDANT (0,-9)                                    │
   │                              [I] INTRO — Runway 00  ▲ car (0,0)   btn (9,-4)        │
   │                                              ║                                      │
   │                                   roundabout (0,30) ═══════ [G] PLAYGROUND (52,40)  │
   │                                   pads z=40  ║             bricks(42,26) lane(62,38)│
   │                        [C] CONTACT — Ground Control (0,44)  cones z=54  ramp(70,54) │
   │                                   building (0,52)          hoop(84,54) → 5/10/15 m │
   └───────────────────────────────────────────────────────────────────────────────────┘
                                          z=+75 boundary wall
```

**Section centres, teleport spawns (position, heading):**

| # | Section | Centre (x,z) | Spawn (x,z) | Heading | AABB (x0,z0 → x1,z1) |
|---|---|---|---|---|---|
| 1 | Intro | (0, 0) | (0, 4) | N | (-16,-20 → 16,14) |
| 2 | Crossroads | (0, -30) | (0, -18) | N | (-12,-40 → 12,-20) |
| 3 | Experience | (-60, -30) | (-14, -30) | W | (-100,-50 → -12,-20) |
| 4 | Projects | (60, -30) | (14, -30) | E | (12,-50 → 100,-12) |
| 5 | Skills | (0, -70) | (0, -52) | N | (-18,-86 → 18,-44) |
| 6 | Education | (0, -100) | (0, -86) | N | (-18,-114 → 18,-86) |
| 7 | Contact | (0, 44) | (0, 26) | S | (-20,32 → 20,60) |
| 8 | Playground | (52, 40) | (22, 30) | E | (26,16 → 100,64) |

**Roads** (one merged `BufferGeometry` in Tarmac at y=0.01, 1 draw call; dashes = `InstancedMesh(BoxGeometry(1.6,0.02,0.2))` Cream, 1 draw call):
- Runway N–S: x∈[-7,7], z from +32 to −112. Eight Cream threshold bars `Box(1.2,0.02,5)` at z=2..8 (x=-6..6 step 1.7); runway number "00" decal 6×4 at (0,4).
- North avenue at z=−30: x∈[-98,98], z∈[-36,-24].
- South avenue at z=30: x∈[-6,84], z∈[25,35].
- Roundabout slabs: `Cylinder(8,8,0.15,24)` at (0,−30); `Cylinder(6,6,0.15,24)` at (0,30). Each has three flat Cream ring stripes (`RingGeometry` r 5.6/6.4, 6.8/7.2, 7.6/8 on the north one; scaled 0.75 on the south) that trigger cat's-eye ticks.
- Aprons: Experience apron 52×12 at (-58,−40) (under the hangar mouths); Projects slabs are part of the pads; Skills yard 40×46 at (0,−68) minus runway; Education apron 30×20 at (0,−98); Contact apron 34×22 at (0,46); Playground apron x 28..76, z 18..62 plus landing strip 24×6 from x=74..98 at z=54.

**Boundaries:** four invisible static `cannon.Box` walls, 6 m tall, 1 m thick: x=−110, x=+110 (long axis z, length 205), z=−130, z=+75 (long axis x, length 220). Visual edge: `InstancedMesh(IcosahedronGeometry(1,0), 70)` Mesa hills scaled (6..18, 4..9, 6..18) on a jittered ring just outside the walls; fog hides the rest. World extents: **220 × 205 m** (x −110..110, z −130..75). Ground `PlaneGeometry(280,240)` + one static `cannon.Plane` (friction 0.9 vs wheels).

Landmarks visible over the fog: control tower (north, 20 m), rocket (east, 12 m), parked plane (west), Ground Control mast (south).

**Enter pads (15)** and **red buttons (7)** are detected by a 2D AABB / radius test on the chassis position each frame; no physics triggers.

---

## 4. Section-by-section

Common builds referenced below:
- **Board(w,h)**: two `Cylinder(0.12,0.12,postH,6)` Ink posts + `Box(w+0.4, h+0.4, 0.25)` Cream panel (merged into the static Cream group) + `Plane(w,h)` with its own 1024×512 CanvasTexture (768×384 mobile), tilted `rotation.x = -30°`, bottom edge at the stated y; a static `cannon.Box` 0.6 m thick behind it. Fonts: title 88 px bold, subtitle 52 px, body 40 px, all Ink on Cream, 48 px padding; a 6 px Ink rule under the title; a 24 px strip in the section colour along the top.
- **Small labels** (signpost arms, pad text, diorama labels, floor decals, flight strips, totem glyphs, counters) live in **one 2048×2048 text atlas** (1024 on mobile) with a shelf packer; each label is a `Plane` with a UV rect. All atlas quads share one `MeshBasicMaterial` → 1 draw call.
- **Red button**: `Cylinder(1.0,1.15,0.25,16)` Cream base (merged static) + `Sphere(0.7,12,6,0,2π,0,π/2)` Terracotta dome (one `InstancedMesh(7)`, per-instance scale). Trigger: chassis within radius 1.3 of the centre. On trigger: dome instance scale y 1→0.55→1 over 160 ms, "boop", then the owning group's bodies are set `type = KINEMATIC`, tweened home over 400 ms (back-out) with 25 ms stagger and a rising 8-note run, then set `DYNAMIC`, velocities zero, `sleep()`. 600 ms re-trigger cooldown.

### 4.1 Intro — Runway 00 (0,0)
Purpose: first three seconds: "I can drive and I can smash his name."

Props:
- Runway paint + threshold bars + "00" decal (see roads).
- **Name letters**: 12 `TextGeometry(char, { font: helvetiker_bold, size 2.2, depth 0.8, curveSegments 3, bevelEnabled false })`, `geometry.center()`. Row 1 "VEDANT" Terracotta at z=−9, row 2 "THAKRE" Clay at z=−14; x positions from cumulative glyph widths + 0.45 gap, rows centred on x=0. Each: `cannon.Body({ mass 4, shape Box(halfExtents from Box3), linearDamping 0.1, angularDamping 0.3, allowSleep true })`. 12 draw calls.
- **Tagline board**: Board(7.2, 1.8) at (0, −21), bottom edge y=1.4, facing +z.
- **Controls decal**: atlas quad 6×2 on the floor at (0, 3) (behind the car): desktop "WASD / ARROWS drive · SHIFT boost · SPACE jump · ENTER open · M map · R reset · H horn · L mute"; touch "DRAG to drive · BOOST · JUMP · HORN · TAP pads to open". Opacity tweens to 0 once the car has travelled 6 m.
- **Red button** (letters) at (9, −4).
- **Windsock**: Ink `Cylinder(0.06,0.06,4)` at (11, −6) with a Terracotta `Cone(0.45,1.6,8)` rotated horizontal at the top; yaw = sin(t·0.3)·0.4; when the car is within 12 m the cone stretches `scale.y = 1 + speed/24`. No physics.
- **Runway edge lights**: 40 `Sphere(0.12,6,4)` Lamp along x=±7.5 every 4 m from z=8 to z=−30, in the global emissive-lamps InstancedMesh.
- **Blob shadows**: global `InstancedMesh(CircleGeometry(1,12), 160)` with a radial-gradient CanvasTexture (Shadow colour → transparent), one instance per dynamic body + car, updated each frame: position (x, 0.04, z), scale = footprint radius × (1 − min(height, 3)/3).

Physics: 12 letter bodies; ground plane.

Interactions:
- Drive into the letters: they topple and skid; impact > 1.5 m/s → "tock" (letters pitch) + 6 dust particles.
- Jump on the letters: they squirt out sideways.
- Drive over the red button: letters tween home.
- Honk near the windsock: it whips (scale.y 1.6 for 400 ms) + "pop".
- First entry to the runway threshold shows toast "Follow the runway north to the signposts."

Text (verbatim):
- Letters: `VEDANT` / `THAKRE`.
- Tagline board line 1: `Engineer building autonomous decision systems and the data infrastructure under them.` Line 2 (52 px): `B.Tech Aerospace Engineering, IIT Bombay · Minor in Machine Intelligence and Data Science · built Tark · previously founding data engineer at Epik`.
- No DOM panel.

### 4.2 Crossroads — Signpost (0,−30)
Props:
- **Signpost**: Ink `Cylinder(0.16,0.16,4.6,8)` post at (0,−30) on a Concrete plinth `Box(1.4,0.6,1.4)`; static `cannon.Cylinder(0.3, 0.3, 4.6)`. Six arms from y=4.2 down in 0.42 steps: each Cobalt `Box(3.2,0.5,0.12)` with a `Cone(0.25,0.4,4)` tip at the outer end, yawed to point at its section (Experience W, Projects E, Skills N, Education N, Playground SE, Contact S), carrying an atlas label quad 2.8×0.4 on both faces. Arms merged into the static Cobalt group; labels in the atlas call. On chassis impact the arm group rotates ±4° for 300 ms ("clang").
- Roundabout slab + stripes (roads).
- **Floor arrows**: 6 atlas quads 3×2 at each road mouth: "EXPERIENCE" (-11,−30), "PROJECTS" (11,−30), "SKILLS · EDUCATION" (0,−41), "START" (0,−19), "PLAYGROUND ↘" (5,−19), "CONTACT ↓" (-5,−19).
- **Fuel drums**: 6 Mesa `Cylinder(0.5,0.5,1,10)` at (10,−38), merged static, no physics.
- **MAP pad** at (0,−22): label "MAP".

Interactions: bump the post (wobble + clang); MAP pad → map overlay; driving over the ring stripes → three 2 ms ticks, gated once per crossing (state flag reset when the car is > 10 m from centre).

Text: arm labels `EXPERIENCE`, `PROJECTS`, `SKILLS`, `EDUCATION`, `PLAYGROUND`, `CONTACT`. No résumé text. No panel.

### 4.3 Experience — Hangar Row (−60,−30)
Hangars at x = −40 (Tark), −52 (Epik), −64 (Consulting), −76 (DevCom), centred z=−42, open toward +z (mouth at z=−37.5, back wall at z=−46.5). Newest nearest the crossroads.

Shared hangar build (×4): Sage `CylinderGeometry(4.6,4.6,9,12,1,true,0,π)` rotated so the axis runs along z and the flat side is down (half-tube 9 m deep, 9.2 m wide, 4.6 m tall); back wall `CircleGeometry(4.6,12,0,π)` Sage darkened 12 %; door frame two Ink `Box(0.3,4.6,0.3)` posts + Cobalt lintel `Box(9.4,0.5,0.3)`. Physics per hangar: two static `Box(0.4,4.6,9)` side walls at x±4.6, one static back wall `Box(9.2,4.6,0.4)` at z=−46.5; the mouth is open so the car can drive in and park. Hangar sign: Board(8, 2.2) mounted on the lintel, bottom edge y=5.0, facing +z, Cobalt strip. Enter pads at (x, −33) on the road's north lane. Floor arrows on the road.

- **Timeline decal**: atlas quad 48×1.2 at (−58, 0.02, −37) with a dashed line, ticks "2026" (x −40), "2025" (−52), "2024" (−64), "2023" (−76) and "← EARLIER" at x=−82.
- **Parked plane** (west landmark) at (−92,−30): Cream `Cylinder(0.9,0.6,9,10)` fuselage along x, `Cone(0.9,1.8,10)` nose, `Box(11,0.15,1.8)` wings, `Box(3,0.15,1.2)` tailplane, Terracotta `Box(0.15,1.8,1.6)` fin, three Ink `Cylinder(0.3,0.3,0.6)` wheels; static `cannon.Box(5, 1, 1.5)`. Merged static.

**H1 Tark (−40,−42) — Confidence gate**
- **Boom barrier** across the mouth: Ink pivot post `Box(0.4,1.4,0.4)` at (−44.4,−37.5) static; boom `Box(8.4,0.28,0.28)` with an atlas stripe texture (Terracotta/Cream, text `CONFIDENCE GATE · <5% of cycles`), `cannon.Body(mass 2, Box halfExtents (4.2,0.14,0.14))`, `HingeConstraint(post, boom, { pivotA: (0,1.3,0), pivotB: (−4.2,0,0), axisA: (0,0,1), axisB: (0,0,1), collideConnected: false })`; motor enabled with `setMotorSpeed(−1.2)`, `motorEquation.maxForce = 30`, so the boom returns to horizontal on its own but the car (180 kg) lifts it; a static stop `Box(0.3,0.3,0.3)` under the free end at rest. Creak while angular velocity > 0.3.
- **OTAM ring** inside at (−40,−43): flat Ink `Torus(2,0.08,6,24)` at y=1.2 with four Cream `Box(1.4,0.6,0.2)` tiles at 90° carrying atlas labels `OBSERVE` `THINK` `ACT` `MEASURE`; group yaws 0.4 rad/s; non-physical. **Gate lamp**: Lamp `Sphere(0.25)` above the THINK tile; every 1 s cycle `Math.random() < 0.05` → emissive Terracotta for 300 ms + 1 kHz 15 ms click.
- Canary: Lamp `Sphere(0.22)` + Terracotta `Cone(0.06,0.15)` beak on the pivot post; wings `Box(0.25,0.03,0.12)` flap for 1 s when the boom rises above 20°.

**H2 Epik (−52,−42) — Pipelines**
- Concrete `Box(3,2,2)` warehouse at (−52,−45) with atlas label `BigQuery`; Sage tank `Cylinder(0.8,0.8,1.6,12)` at (−52,−39); **7 Ink pipes** `Cylinder(0.12,0.12,4.2,6)` fanning from the tank to the box; 21 Lamp spheres from the global **pipe-flow InstancedMesh** (3 per pipe) advancing at 1.5 m/s and wrapping. Counter board atlas quad 2.6×0.8 on the warehouse: `2.3M records / day`, counts 0 → 2,300,000 over 2 s (redraw at 10 Hz) the first time the car is within 15 m. Non-physical.

**H3 Independent Consulting (−64,−42) — Deal corral**
- The hangar is the corral. **9 Lavender-tinted Sage balls** `InstancedMesh(Sphere(0.45,10,8), 9)` with `cannon.Sphere(0.45)` mass 0.8, restitution 0.5, allowSleep, resting in a 3×3 block at z −44..−41. Gate: two Ink posts `Cylinder(0.1,0.1,1.2)` at (−66,−37.5) and (−62,−37.5) with an atlas floor decal 3×1 `FUND THESIS` between them. **Scoreboard**: atlas-independent 512×256 CanvasTexture on `Plane(3,1.5)` mounted on the lintel's left, text `SOURCED n / 9`, redrawn only when n changes; a ball counts when its z > −36.5 (in front of the mouth). Ding per ball; 9/9 → arpeggio + 40 confetti particles. Atlas board inside on the back wall: `4,800+ companies · 9 sources`.
- **Magnifying glass**: Ink `Torus(0.7,0.08)` + Glass `Circle(0.62)` + `Cylinder(0.05,0.05,1)` handle, orbiting r=2 at y=2.4 above the balls, 0.5 rad/s. Non-physical.
- Red button (corral) at (−70,−38).

**H4 DevCom, IIT Bombay (−76,−42) — The team**
- Campus building at the back: Concrete `Box(3,2.4,2)` + Terracotta pitched roof (`Box(3.4,2.2,2.2)` rotated 45° about z, scaled y 0.5) at (−76,−45.5), atlas label `InstiApp`. Non-physical (behind the pins).
- **21 developer pins**: global **mini-figure InstancedMesh** (figure = merged `Cylinder(0.18,0.22,0.5,8)` body + `Sphere(0.18,8,6)` head, Cobalt with per-instance colour jitter ±8 %); 21 instances arranged 5-4-5-4-3 rows at z −39.5..−44.5, 0.9 m spacing, facing the road; each `cannon.Cylinder(0.22,0.22,0.7,8)` mass 0.5, allowSleep. Atlas floor decal 4×1 in the mouth: `21 DEVELOPERS`. DOM chip `DOWN n / 21` (a pin is down when up·y < 0.5) shown while inside the Experience AABB and n > 0. 21/21 → arpeggio.
- Podium `Box(1,0.6,1)` Concrete at (−79.5,−45.5) with a 22nd figure holding an atlas flag `+10% MAU`. Static, merged.
- Red button (team) at (−82,−38).

Interactions:
- Read the four hangar signs on one boost pass; Enter on a pad (or click a sign) → detail panel.
- Drive inside a hangar; horn inside → two delayed copies (80 ms −6 dB, 160 ms −12 dB) of the horn.
- Push through the boom (creak, canary flaps); bump the OTAM ring (nothing, it is non-physical) and watch the gate lamp trip.
- Shove balls out of H3 through the FUND THESIS gate; scoreboard counts.
- Bowl through the 21 developers in H4; red button stands them up.
- Ram the plane: metallic hit.

Text (verbatim):
- H1 sign: `TARK` / `Founder & Engineer` / `Oct 2025 – Jul 2026`. Panel 1 (title `Tark — Founder & Engineer`, meta `Oct 2025 – Jul 2026`), bullets: `Consumer brand data sits split across ad platforms, storefront, payments and logistics with no way to trace outcomes back to causes; built Tark, a causal decision engine that closes that gap.` / `Architected the decision core: an Observe/Think/Act/Measure state machine that calls an LLM only when a confidence gate trips (<5% of cycles), paired with a causal model that estimates an action's effect before it is taken.` / `Built the execution chain to fail closed: circuit breakers, hard caps, idempotent claiming, canary testing, risk limits; measurement flags results it cannot confidently verify.`
- H2 sign: `EPIK` / `Founding Data Engineer` / `Jul 2025 – Sep 2025`. Panel 2 bullets: `Built 7 ingestion pipelines on BigQuery processing 2.3M records daily into a warehouse the team could query directly, cutting reporting time to minutes.` / `Designed and shipped real-time pricing and supply–demand pipelines in four weeks.`
- H3 sign: `INDEPENDENT CONSULTING` / `Data Engineering & Deal Sourcing` / `May 2024 – Jun 2025`. Panel 3 bullets: `Data engineering and automation projects for investment firms, consulting and healthcare clients.` / `Deal-sourcing pipeline: crawlers processed 4,800+ companies across 9 registry/filing sources with an LLM layer scoring each target against the fund's thesis.`
- H4 sign: `DEVCOM, IIT BOMBAY` / `Project Lead` / `Dec 2022 – Mar 2024`. Panel 4 bullets: `Elected to lead the 21-developer team owning every core digital product on campus (InstiApp, internal tools); ran roadmap, release cycle, hiring, annual budget.` / `Overhauled InstiApp with a new design system and performance work, +10% MAU across 5,000+ students; earlier built achievement-verification and discussion-forum modules.`
- Diorama labels: `CONFIDENCE GATE · <5% of cycles`, `OBSERVE`, `THINK`, `ACT`, `MEASURE`, `BigQuery`, `2.3M records / day`, `FUND THESIS`, `SOURCED n / 9`, `4,800+ companies · 9 sources`, `InstiApp`, `21 DEVELOPERS`, `+10% MAU`.

### 4.4 Projects — Launch Pads (60,−30)
Pads A (40,−42) N, B (52,−18) S, C (64,−42) N, D (76,−18) S. Enter pads at (40,−33), (52,−27), (64,−33), (76,−27).

Shared pad build (×4): Concrete `Cylinder(5,5,0.3,20)` slab with a flat Terracotta/Cream hazard ring `Torus(4.6,0.12,4,24)`; gantry = two Ink `Box(0.25,6,0.25)` posts + Cream `Box(7.4,0.3,0.25)` crossbar at y=6 carrying a Board(7, 3.4) (Terracotta strip) hung from the crossbar, bottom edge y=2.4, facing +z (north pads) — south pads' boards are on the north edge of their slab so they still face +z toward the camera with the pad in front. Static `cannon.Box(0.15,3,0.15)` per post; slab static `cannon.Cylinder(5,5,0.3)`.

- **A — Rural Patient Screening** (40,−42): clinic hut Cream `Box(3,2,3)` + Terracotta `Cone(2.4,1.2,4)` roof + two Clay `Box(1,0.25,0.06)` crossed on the front; a Cream `Box(0.9,1.2,0.03)` diagnosis slip hovers at y=3.6 spinning 0.8 rad/s; an Ink `Box(0.6)` cube with atlas label `SLM` orbits it. Non-physical except the hut (static Box).
- **B — InstiApp** (52,−18): giant phone `ExtrudeGeometry` rounded rect 2.4×4.8 r 0.3 depth 0.25 Ink, standing upright, leaning back 12° on a `Box(2.6,0.4,1.2)` stand; screen = own 512×1024 CanvasTexture: header `InstiApp`, an ID card (rounded rect, avatar circle, `DIGITAL STUDENT ID`), four buttons `ID`, `MEAL`, `BADGE`, `FORUM`, footer `5,000+ students daily`; static Box body. 5 mini figures (global InstancedMesh, non-physical) walk a circle r=3 around the phone.
- **C — Intelligent Trading Agent** (64,−42): 9 candlesticks `Box(0.5,h,0.5)` h∈[0.6,3.2] Sage/Terracotta merged on a Concrete `Box(6,0.2,1)` base; every 4 s one candle's `scale.y` tweens to a new value. Robot: Ink `Box(0.8,0.8,0.8)` head with two Lamp `Sphere(0.12)` eyes on a `Cylinder(0.1,0.1,0.6)` neck over a Sage `Cylinder(0.4,0.5,0.8)`; head `lookAt(car)` within 15 m. Lamp `Box(0.7)` cube with atlas `DQN` spinning above the tallest candle. Static Cylinder body on the robot only.
- **D — On-Device Drone Autonomy** (76,−18): landing pad atlas decal `Circle(2)` Ink with "H". **Drone**: Ink `Box(1.2,0.3,1.2)` body, four `Cylinder(0.05,0.05,1.3)` arms in an X, four Cream `Cylinder(0.45,0.45,0.04,10)` rotors (`InstancedMesh(4)`, 40 rad/s), Lamp camera sphere under the nose. No physics. Controller: hovers at y=3 over the pad with sin bob; when the car is within 16 m it flies to `carPos + (0, 3.2, −1.5)` with critically damped smoothing (stiffness 4, damping 2√4), banks up to 25° toward its velocity, and returns to the pad when the car is > 24 m away; never below y=2.6. **Stitch trail**: `InstancedMesh(Plane(0.5,0.35), 16)` Cream 0.6 alpha, one dropped every 0.15 s while chasing, fading over 1.5 s. Horn within 10 m → 360° roll tween (0.6 s). Three Terracotta cones (static, merged) on the slab. Rotor buzz gain by `1/(1 + d²/120)`.
- **Rocket** (east landmark) at (96,−30): Cream `Cylinder(1.3,1.3,9,12)`, Terracotta `Cone(1.3,2.8,12)` nose, four Terracotta triangle fins (`ExtrudeGeometry`), Ink open `Cone(1.4,1.2,12,1,true)` bell, Concrete stand; static `cannon.Cylinder(1.5,1.5,12)`; nose Lamp blinks with the tower beacon. Honk within 8 m → toast `3 · 2 · 1 …` then `… launch window scrubbed. Try the ramp.` with a rumble swell. It never launches.

Interactions: Enter/click → panel with verbatim text + GitHub link; drone follows and barrel-rolls; slabs bump the car up 0.3 m; gantry posts thud; robot head tracks the car.

Text (verbatim):
- Billboard A: `RURAL PATIENT SCREENING` / `BIRAC-funded` / `preliminary diagnostic screening for villages in Maharashtra`. Panel A: `Rural Patient Screening (BIRAC-funded): preliminary diagnostic screening for villages in Maharashtra, reading hospital diagnosis slips with an LLM; fine-tuned LLaMA on real slip data into a compact domain-specific small language model.`
- Billboard B: `INSTIAPP` / `IIT Bombay campus app used daily by 5,000+ students`. Panel B: `InstiApp: IIT Bombay campus app used daily by 5,000+ students; digital student IDs, meal access, achievement verification, discussion forums.`
- Billboard C: `INTELLIGENT TRADING AGENT` / `RL agents (DQN variants) trained and backtested on real market data`. Panel C: `Intelligent Trading Agent: RL agents (DQN variants) trained and backtested on real market data.`
- Billboard D: `ON-DEVICE DRONE AUTONOMY` / `obstacle avoidance · path planning · real-time image stitching` / `entirely on the drone's onboard compute`. Panel D: `On-Device Drone Autonomy: obstacle avoidance, path planning, real-time image stitching entirely on the drone's onboard compute.`
- Every project panel footer: link `github.com/VIBR0X` → `https://github.com/VIBR0X`.

### 4.5 Skills — Pipeline Yard (0,−70)
- **Tanks (×5)** at (−12,−58), (−12,−70), (−12,−82), (12,−58), (12,−70): Sage `Cylinder(2.2,2.2,4,14)` on Concrete `Box(5,0.3,5)` footing, Ink ladder (two `Cylinder(0.04,0.04,4.2)` rails + 8 rungs), Cream lid `Cylinder(2.3,2.3,0.2,14)`; each carries a Board(4, 3) (Sage strip) on its runway-facing side, bottom edge y=1.2, rotated to face +z. Static `cannon.Cylinder(2.3,2.3,4)` each.
- **Pump house** at (12,−82): Concrete `Box(3,2.2,3)` + Terracotta pitched roof, atlas sign `ETL / ELT`; Ink flywheel `Torus(0.8,0.1)` on the side spinning 3 rad/s (12 rad/s for 2 s on horn within 12 m). Static Box.
- **Warehouse** at (−13,−90): Concrete `Box(6,3,4)`, atlas label `WAREHOUSE (star schema)`. Static Box.
- **Pipes**: Ink `Cylinder(0.22,0.22,L,6)` segments + quarter-torus elbows merged, ground-level polylines from every tank to the warehouse (cross the runway under the car — no physics); polylines stored for the flow system. 8 Terracotta valve wheels `Torus(0.35,0.06,6,10)` merged.
- **Pipe flow**: 60 instances from the global Lamp-sphere flow InstancedMesh at 2 m/s, wrapping.
- **Cargo crates**: 16 `Box(1,1,1)` `InstancedMesh` with per-instance colours (Sage/Terracotta/Cream/Cobalt) stacked 4 wide × 4 high with 3 mm gaps on a Concrete dock `Box(6,0.4,3)` at (11,−48); `cannon.Box(0.5)` mass 2 each, allowSleep. Atlas board on the dock: `CARGO — knock me over`. Red button at (16,−52).
- Enter pad at (0,−70) on the runway; floor decal `PIPELINE YARD ↑` at (0,−50).

Interactions: pad/click → skills panel; ram the crates (wood "tock"); button restacks; horn at the pump house spins the flywheel and doubles flow speed for 2 s.

Text (verbatim): T1 (−12,−58) `LANGUAGES` / `Python, TypeScript/JavaScript, SQL, Bash, Dart`; T2 (12,−58) `DATABASES` / `Trino, BigQuery, Snowflake, PostgreSQL, Firestore, Redis`; T3 (−12,−70) `DATA ENGINEERING` / `warehouse & star-schema design, ETL/ELT, event-driven pipelines, semantic layers, query optimisation`; T4 (12,−70) `CLOUD` / `GCP (Cloud Functions, Cloud Run, Cloud Scheduler, Pub/Sub, BigQuery, Compute Engine), Firebase`; T5 (−12,−82) `AI / ML` / `LLM agent systems, text-to-SQL, MCP servers, ML pipelines`. Panel (title `Skills`) lists the same five groups as headed lists, and a closing paragraph verbatim: `Python, TypeScript/JavaScript, SQL, Bash, Dart; Trino, BigQuery, Snowflake, PostgreSQL, Firestore, Redis; warehouse & star-schema design, ETL/ELT, event-driven pipelines, semantic layers, query optimisation; GCP (Cloud Functions, Cloud Run, Cloud Scheduler, Pub/Sub, BigQuery, Compute Engine), Firebase; LLM agent systems, text-to-SQL, MCP servers, ML pipelines.`

### 4.6 Education & Awards — Control Tower (0,−100)
- **Tower** at (0,−104): Concrete `Box(5,1,5)` base; Concrete `Cylinder(1.7,2.1,14,8)` shaft; Cobalt `Cylinder(3.4,3.4,0.6,8)` cab floor at y=15; Glass `Cylinder(3.2,3.2,2.4,8,1,true)` glazing (transparent, own draw call); Ink `Cone(3.6,1.4,8)` roof; Ink antenna `Cylinder(0.04,0.04,3)` with Lamp `Sphere(0.3)` beacon blinking every 1.5 s (`emissiveIntensity` 0.2↔1.2); Sage catwalk `Torus(3.6,0.15,6,8)` at y=15.3. Static `cannon.Cylinder(2.2,2.2,16)`.
- **Base board**: Board(5, 2.6) (Lamp strip) on the +z face of the base, bottom edge y=1.1.
- **Coursework rack** at (−9,−98): Ink frame (two posts + rail); 7 Cream "flight strips" = atlas quads 2.2×0.5 stacked with 0.1 gaps, each rotated ±2°. No physics.
- **Trophy podium** at (9,−98): Concrete boxes 1.4 wide, heights 1.2/0.8/0.6 with atlas numerals `1` `2` `3`; on step 1 the trophy = Lamp `Cylinder(0.55,0.3,0.9,10)` cup + two `Torus(0.3,0.06)` handles + `Cylinder(0.25,0.25,0.5)` stem + `Box(0.9,0.15,0.9)` base, merged; `cannon.Cylinder(0.45,0.45,1.5)` mass 3 resting on the step (knockable, metallic clang); slow y-rotation applied via `angularVelocity (0,0.6,0)` only while asleep on the step. Board(3.6, 1.6) on a post beside it. Trophy resets with R inside the section.
- **Confetti**: 48 instanced `Plane(0.18,0.12)` with per-instance colours falling in a 4 m column above the podium, wrapping at the ground; always on.
- **Helipad**: Cream atlas "H" `Circle(2.6)` at (0,−96) = Enter pad location.

Interactions: pad/click → panel; honk near the tower → beacon strobes 3×, glass flashes, toast `Cleared for takeoff`; jump on the H → whoosh + confetti fall speed ×2 for 1 s; knock the trophy off (clang).

Text (verbatim): base board `IIT BOMBAY` / `B.Tech Aerospace Engineering` / `Minor in Machine Intelligence and Data Science`. Flight strips: header `COURSEWORK`, then `ML`, `data analysis`, `optimisation`, `adaptive and learning control`, `control systems`, `flight dynamics`. Trophy board: `WINNER` / `institute-wide Game Dev Hackathon, IIT Bombay` / `led to election as DevCom lead`. Panel (title `Education & Awards`): `IIT Bombay B.Tech Aerospace Engineering, Minor in Machine Intelligence and Data Science; coursework in ML, data analysis, optimisation, adaptive and learning control, control systems, flight dynamics.` and `Winner of the institute-wide Game Dev Hackathon at IIT Bombay (led to election as DevCom lead).`

### 4.7 Playground — Test Range (52,40)
- **Entrance sign**: Board(6.4, 2.4) (Lamp strip) at (36,24) facing +z, bottom edge y=1.4.
- **Bowling**: Concrete lane slab `Box(4,0.05,16)` centred (62,38) with Cream gutter lines; 10 pins = `InstancedMesh` of merged `Cylinder(0.16,0.26,1.0,8)` + `Sphere(0.2,8,6)` head Cream with a Terracotta band `Torus(0.2,0.04)`; triangle apex at (62,33) pointing south (toward the ball), 0.7 m spacing, rows behind to z=30; `cannon.Cylinder(0.24,0.24,1.0,8)` mass 1.5, allowSleep; ball Cobalt `Sphere(0.45,12,10)`, `cannon.Sphere` mass 6, linearDamping 0.15, at (62,45). Backstop Cream `Box(4,1,0.3)` static at z=28.5. DOM chip `PINS n / 10`; pin down when up·y < 0.5; 10/10 → `STRIKE!` toast + arpeggio + 40 confetti. Red button at (58,48).
- **Brick wall** at (42,26), long axis x: 30 bricks `Box(1.2,0.5,0.6)` `InstancedMesh` alternating Terracotta/Clay, 6 wide × 5 high running bond, 3 mm gaps; `cannon.Box` mass 1, linearDamping 0.05, allowSleep. DOM chip `BRICKS n / 30` (fallen = moved > 0.3 m from spawn). Red button at (36,26).
- **Cone slalom**: 12 cones (merged `Cone(0.35,0.9,8)` Terracotta + Cream band + `Box(0.9,0.06,0.9)` base, `InstancedMesh`) every 3 m along x from 32 to 65 at z=54, alternating z ±0.8; `cannon.Box(0.45,0.45,0.45)` mass 0.5. Timer chip `SLALOM 00.0s` starts when the car passes x=32 heading east, stops at x=65; a run is "clean" if no cone moved > 0.3 m; best clean time in `localStorage` (try/catch). Red button at (30,58).
- **Ramp** at (70,54): Concrete `ExtrudeGeometry` wedge (triangle 6 long × 1.7 high, extruded 4.5 wide) rising toward +x, lip at x=73; Cream edge stripe; static `cannon.Box(3, 0.15, 2.25)` rotated `atan2(1.7,6)` about z. Landing strip decals `5 m` `10 m` `15 m` at x=78, 83, 88 and `BIG AIR` at x=93. **Hoop**: Lamp `Torus(2.2,0.15,8,20)` upright at (84,54) on two Ink feet; a 1.8 m trigger sphere at its centre awards `NICE JUMP` when the car passes through with 0 wheels in contact. **Airtime toast**: measured wheels-off (all four `isInContact === false` for > 150 ms, launched from x > 70) to wheels-on; distance from the lip; toast `AIR 1.2 s · 11 m`; best kept in `localStorage`; > 15 m → `BIG AIR` fanfare.
- **See-saw** at (40,44): Sage `Box(6,0.2,1.4)` plank (`cannon.Body` mass 8) on a Terracotta `Cylinder(0.5,0.5,1.6)` fulcrum along z (static body), `HingeConstraint` axis z, `collideConnected: false`; small Terracotta stops `Box(0.2,0.3,1.4)` at each end. Drive up one side; a ball on the far end launches.
- **Tyre barrier**: 40 Ink `Torus(0.6,0.25,6,12)` instanced in stacks of 2–3 ringing the range at r≈26 from (52,40), decorative.

Interactions: bowling, bricks, slalom, ramp+hoop, see-saw as above; R inside the section resets all toys; each red button resets its own toy.

Text (verbatim): entrance sign `TEST RANGE` / `I won IIT Bombay's institute-wide Game Dev Hackathon — this bit is for fun. Nothing important lives here.` Decals `5 m`, `10 m`, `15 m`, `BIG AIR`. Chips `PINS n / 10`, `BRICKS n / 30`, `SLALOM 00.0s`, `DOWN n / 21` (Experience). No résumé text. No panel.

### 4.8 Contact — Ground Control (0,44)
- **Building** at (0,52): Concrete `Box(12,3.2,6)` with a Cobalt roofline band `Box(12.2,0.4,6.2)`, Ink door `Box(1.4,2.4,0.1)`, 3 Concrete HVAC `Box(1,0.8,1)` on the roof, Cobalt mast `Cylinder(0.1,0.1,6)` with Lamp beacon `Sphere(0.2)` (south landmark). Static `cannon.Box(6,1.6,3)`.
- **Big contact board**: Board(8, 3.4) (Terracotta strip) above the door, bottom edge y=3.6, facing +z toward the road — wait, the camera looks north from the south: the building is south of the pads, so the board faces −z? No: **the board is mounted on the building's north face at z=49, facing −z would face away from the camera.** Resolve: mount the board on two posts at (0,38) in front of the pads, facing +z, and put an atlas sign `GROUND CONTROL · get in touch` on the building's north face (readable only up close; the board carries the content).
- **Dish** on the roof at (4,52): Cream `Sphere(2.4,12,8,0,2π,0,π/3)` cap `DoubleSide` on an Ink `Cylinder(0.2,0.2,2.2)` pivot + feed + Lamp tip; yaw sweeps ±40° at 0.2 rad/s; on horn within 15 m it snaps to face the car for 2 s and the beacon strobes.
- **Radar** at (−16,44): Concrete `Cylinder(1.6,1.6,0.4,16)` drum with an Ink `Box(3,0.05,0.4)` sweep bar spinning 1.2 rad/s and a Lamp trailing arc `Torus(1.5,0.05,4,12,0,0.9)`.
- **Link totems (×4)** at z=44, x = −12, −4, 4, 12: Ink post `Cylinder(0.08,0.08,1.6)` + Cream `Box(1,1,1)` cube at y=2.1 with an atlas glyph face (`@`, `in`, `</>`, `PDF`; hand-drawn canvas glyphs, no third-party logos), rotating 0.5 rad/s; static post body. Enter pad in front of each at z=40 with captions `EMAIL`, `LINKEDIN`, `GITHUB`, `RESUME PDF`.
- **Phone board**: atlas quad 3×0.8 on the building wall beside the door: `+91 9145190310`.
- Red telephone on a Concrete `Box(1.2,0.8,0.8)` desk at (7,47): Terracotta `Box(0.5,0.25,0.35)` + `Torus(0.25,0.06,6,10,π)` handset; rings (rotates ±3° for 1 s) when the car enters the apron.
- Parking bay lines (Cream, merged) in front of the pads; two Mesa fuel drums.

Interactions:
- Enter on EMAIL pad (or click the totem): `navigator.clipboard.writeText('thakrevedant63@gmail.com')` + toast `Copied — thakrevedant63@gmail.com` + `window.location.href = 'mailto:thakrevedant63@gmail.com'` in the same handler.
- LINKEDIN → `window.open('https://linkedin.com/in/vedantthakre', '_blank', 'noopener')`; GITHUB → `https://github.com/VIBR0X`; RESUME PDF → `/Vedant_Thakre_Resume.pdf`. All `window.open` calls run synchronously inside the keydown/touchend/pointerup handler.
- First arrival toast: `That's the whole range. Thanks for driving — links are on the pads.`

Text (verbatim): big board header `LET'S TALK`, line 1 `thakrevedant63@gmail.com`, line 2 `+91 9145190310`, line 3 `linkedin.com/in/vedantthakre · github.com/VIBR0X`, footer `Résumé PDF on the pad →`. Contact panel (top bar "Contact" and pad click) lists the same four as real links (`mailto:`, `tel:+919145190310`, LinkedIn, GitHub) plus the PDF link.

---

## 5. Car

**Look** (5 draw calls + 1 wheels):
- Body group merged into one geometry with vertex colours (1 call): Cobalt `Box(1.7,0.45,3.0)` at y 0.55; Cream cabin `Box(1.5,0.5,1.3)` at (0,1.02,−0.15); Ink bumpers `Box(1.8,0.22,0.3)` front and back; Ink roof rails two `Cylinder(0.03,0.03,1.4)`; Ink exhaust `Cylinder(0.06,0.06,0.3)` rear-right; Clay tail lights `Box(0.28,0.14,0.1)`; antenna `Cylinder(0.015,0.015,0.9)` with a Terracotta `Sphere(0.05)` tip, `rotation.x = −speed·0.02`.
- Glass windshield `Box(1.42,0.42,1.1)` inside the cabin (1 transparent call).
- Headlights two Lamp `Box(0.28,0.14,0.1)` in the shared emissive material (1 call).
- Boost flame: two Lamp `Cone(0.12,0.6,6)` behind the exhaust, visible only while boosting, `scale = 1 + 0.3·sin(t·40)` (1 call).
- Dust: pool of 24 Dune `Sphere(0.2,5,4)` instances at the rear wheels when |lateral slip| > 0.6, on jump and on landing; grow ×2.5 and fade over 0.6 s (1 call). Shared with world hit puffs (pool size 120 total in `particles.js`).
- Wheels: `InstancedMesh(4)` of merged Ink `Cylinder(0.38,0.38,0.32,10)` rotated 90° about z + Concrete hub `Cylinder(0.18,0.18,0.34,8)`; matrices copied from `vehicle.wheelInfos[i].worldTransform` each frame (1 call).
- Blob shadow instance scale (2.2, 3.4).
- **Squash-and-stretch**: on landing with vertical impact > 3 m/s the body group scales to (1.08, 0.88, 1.08) and springs back over 200 ms (elastic-out); on jump (0.94, 1.1, 0.94) for 120 ms.

**Physics (cannon-es RaycastVehicle)**:
```
world.gravity = (0, -14, 0); broadphase = SAPBroadphase; solver.iterations = 8
world.allowSleep = true; every dynamic prop: sleepSpeedLimit 0.25, sleepTimeLimit 0.6
step: world.step(1/60, min(dt, 0.05), 3)   // mobile: maxSubSteps 2
chassis: mass 180, Box halfExtents (0.85, 0.28, 1.5) at offset (0, -0.1, 0),
         linearDamping 0.04, angularDamping 0.5, allowSleep false, position (0, 0.8, 0)
wheels (x4): radius 0.38, directionLocal (0,-1,0), axleLocal (-1,0,0),
         chassisConnectionPointLocal (±0.8, 0.05, ±1.05),
         suspensionStiffness 45, suspensionRestLength 0.35, maxSuspensionTravel 0.3,
         dampingRelaxation 2.3, dampingCompression 4.5, frictionSlip 2.6,
         rollInfluence 0.01, maxSuspensionForce 1e5,
         useCustomSlidingRotationalSpeed true, customSlidingRotationalSpeed -30
engine: 420 N per wheel, all four (AWD); reverse -260 N
        soft cap: force *= clamp((topSpeed - speed) / 2, 0, 1), topSpeed 17 m/s
boost (Shift): force × 1.9, topSpeed 26 m/s, fov +4°
brake: 35 on all wheels while Ctrl/B held; auto-brake 6 when no throttle input
reverse: if forward speed > 1.5 m/s, S applies brake 18 until speed < 1.5, then reverses
steer: target ±0.55 rad × clamp(1 - speed/45, 0.4, 1); current lerps toward target at 14 rad/s, returns to 0 at 10 rad/s
jump (Space): allowed when ≥ 3 wheels isInContact and 0.8 s since last jump;
        applyImpulse((0, 180*6.0, 0) + forward * 180*0.9, chassis centre); while airborne angularDamping 0.9
auto-upright: if chassis up·(0,1,0) < 0 for 1.5 s, or speed < 0.3 for 3 s while throttle > 0.5:
        lift 1.5 m, slerp quaternion to yaw-only over 0.5 s, zero velocities
respawn (R outside a section with its own reset, or y < -5): nearest section spawn point (table §3),
        velocities zero, facing the section heading, 250 ms Haze fade
contact materials: ground↔wheel friction 0.9 restitution 0; ground↔prop 0.5/0.1; chassis↔prop 0.3/0.2
collide: chassis and every prop body listen 'collide'; impact = contact.getImpactVelocityAlongNormal()
```

**Camera**: `PerspectiveCamera(fov 40, aspect, near 1, far 220)` (fov 46 on portrait mobile). Never rotates with the car.
```
offset = (0, 19, 14) * zoom;  zoom ∈ [0.55, 1.9], default 1.0 desktop / 1.35 portrait mobile (+4 m height)
target += (carPos + horizontalVelocity * 0.35 - target) * (1 - exp(-6 * dt));  target.y = 0.6
camera.position += (target + offset + panelNudge - camera.position) * (1 - exp(-6 * dt))
camera.lookAt(target)
zoom eases toward wheel/pinch value at (1 - exp(-6 dt)); +0.15 while boosting
panelNudge = (4, 0, 0) while the detail panel is open on desktop, else (0,0,0)
shake: ±0.15 m for 0.15 s on impact > 6 m/s and on NICE JUMP
start swoop: from (0, 60, 40) to the follow position over 1.6 s, cubic-out
```

---

## 6. Interactive Area pads

- Geometry: one `InstancedMesh(ShapeGeometry(roundedRect 3.6 × 2.4, r 0.4), 15)`, `rotation.x = −π/2`, y=0.03, one 512×340 CanvasTexture: Cream fill at 0.9 alpha, 6 px border, key-cap glyph `⏎ ENTER` (touch devices: `TAP`) chosen once at init. Per-instance colour: Cobalt idle → Sage when the car is inside (lerp 8/s). A separate atlas caption quad 3×0.5 sits at the pad's north edge with the pad name.
- Pad table: MAP (0,−22); TARK (−40,−33); EPIK (−52,−33); CONSULTING (−64,−33); DEVCOM (−76,−33); PROJECT A (40,−33); B (52,−27); C (64,−33); D (76,−27); SKILLS (0,−70); EDUCATION (0,−96); EMAIL (−12,40); LINKEDIN (−4,40); GITHUB (4,40); RESUME PDF (12,40).
- Detection: each frame `inside = |car.x − pad.x| < 1.8 && |car.z − pad.z| < 1.2`. On enter: colour to Sage, contextual chip appears (`ENTER — open Tark` / `TAP — open Tark`, link pads `ENTER — open LinkedIn ↗`), 600 Hz blip. On leave: colour back, chip hides; if that pad's panel is open it closes when the car is > 6 m from the pad centre.
- Trigger: keyboard `Enter`/`E`/`NumpadEnter` while inside; touch: the contextual chip (bottom-centre) and the context button (bottom-right cluster) both fire; mouse: click the pad or its board from any distance (raycast on `pointerup` with < 6 px drag, `Raycaster` against a list of pad/board/totem meshes; hover sets `cursor: pointer` and lifts the board 0.1 m).
- Link pads open in the same synchronous handler. Content pads open the detail panel with `panel.open(id)`; a second press toggles it closed.
- MAP pad opens the map overlay.

---

## 7. Loading, start screen and reveal

Boot order:
1. `index.html` ships with the full résumé inside `<main id="resume">` (see §8), a `<noscript>` line, the PDF link, and the loading overlay markup. `main.js` creates the canvas and UI.
2. Loading overlay (Haze background; Ink wordmark `VEDANT THAKRE`; 240 px Cobalt progress bar; below it the one-line summary and three fact chips `Founder, Tark` · `ex-Founding Data Engineer, Epik` · `IIT Bombay Aerospace`; two links `No time? Read the text résumé` and `Download PDF`; a `START` button disabled until ready). Work runs in a chunked queue on successive `requestAnimationFrame`s with weights: renderer + lights + ground/roads/hills 0.10; font parse (helvetiker JSON imported via Vite `?url` → `FontLoader.parse` of the fetched JSON; bundled, no CDN) + 12 letters at 2 per frame 0.25; text atlas + 18 board canvases at 4 per frame 0.25; merged static architecture per section 0.20; instanced props + physics bodies 0.10; car + audio graph + UI 0.10. Stacks (bricks, crates, pins, balls) are spawned with 3 mm gaps and settled for 30 fixed steps, then slept. Bar animates over at least 0.9 s; target total < 1.5 s on a mid laptop.
3. Ready: the bar is replaced by the enabled `START` button (also any key / tap). `WebGL` unavailable, font parse failure, `hardwareConcurrency <= 2`, or a caught renderer error → overlay swaps to the text résumé with `The 3D version needs WebGL.` and a `Try the 3D version` button where applicable.

Reveal sequence (t = START gesture):
- t+0: `AudioContext` created and resumed inside the handler; engine idle fades in over 600 ms; overlay opacity → 0 over 400 ms; physics unpauses.
- t+0: camera at (0,60,40) starts the 1.6 s swoop.
- t+0: car body placed at y=2.5 and drops onto its suspension (thud + dust puff at t≈0.5).
- t+0.2 → t+0.86: the 12 letters are placed at y = 3 + 0.35·i in reading order with 60 ms stagger and woken; each landing plays its pitched "tock". Physics is the animation.
- t+0 → t+1.2: every static section mesh and instanced group within 70 m starts at scale 0 and pops to 1 with overshoot (0 → 1.08 → 1, 450 ms, back-out), delayed by `distance × 6 ms`; groups beyond 70 m are set to scale 1 instantly (in the fog). Dynamic props beyond 70 m stay asleep.
- t+2.5: the Intro section card slides in (see §8).
- Input is accepted from t+0.
- Section transitions (crossing an AABB): 1.2 s top-centre label (`EXPERIENCE — Hangar Row`) + soft whoosh; sections stay revealed.
- `prefers-reduced-motion`: reveal instant, no swoop, no shake, confetti off.

---

## 8. DOM UI

One stylesheet; Cream panels, 16 px radius, 2 px Ink border, hard 4 px Ink drop shadow, `system-ui, Inter, sans-serif`, 16 px minimum, colours from §2. Overlays use `pointer-events: none` except on their own controls. Game layer `aria-hidden="true"`, canvas `role="img" aria-label="Drivable 3D résumé of Vedant Thakre"`.

1. **Start screen**: as in §7, plus a sound toggle (icon, default on unless `localStorage.muted === '1'`).
2. **Top bar** (48 px, always visible after START; mobile collapses to name + `PDF`): left `Vedant Thakre · Engineer, decision systems & data infrastructure · IIT Bombay`; right buttons `Résumé PDF` (`/Vedant_Thakre_Resume.pdf`, `_blank`), `Contact` (opens the Contact panel), `Map` (M), `Text` (T), mute icon (L).
3. **Contextual chips** (bottom-left, real buttons): at spawn `WASD drive` `Shift boost` `Space jump` `? all keys`; when on a pad they collapse to one Sage chip `ENTER — open Tark`; `R reset` appears when the current section's toy has been disturbed; fades to 30 % after 10 s of driving; `?` expands the full legend. Hidden on touch except the contextual chip.
4. **Section label**: top-centre uppercase, 1.2 s on entry.
5. **Section card** (bottom-right 320 px; mobile bottom sheet above the joystick): shown once per section per session on first entry, 1–2 lines, `Details` and `×`, auto-hides after 6 s, `Don't auto-show` toggle persisted in `localStorage`. Card copy: Intro `Vedant Thakre — engineer, decision systems & data infra. Drive north, or press M for the map / T for the text résumé.`; Crossroads `North: Skills, Education. West: Experience. East: Projects. South: Contact, Playground. Press 1–8 to teleport.`; Experience `Tark (founder) · Epik (founding data engineer) · independent consulting · DevCom IIT Bombay (lead of 21 devs). Newest nearest the crossroads.`; Projects `Rural Patient Screening · InstiApp · Intelligent Trading Agent · On-Device Drone Autonomy.`; Skills `Five tanks, one per category. Press ↵ for the full list.`; Education `IIT Bombay, B.Tech Aerospace Engineering · Minor in Machine Intelligence and Data Science · Game Dev Hackathon winner.`; Contact `thakrevedant63@gmail.com · +91 9145190310 — press ↵ on a pad to open.`; Playground `Just for fun. Shift to boost, Space to jump.`
6. **Detail panel**: right drawer 420 px (mobile: bottom sheet 65 % height with drag handle, swipe down to close); section-colour header strip, title, meta line (role · dates), verbatim paragraphs as a bulleted list, footer link; `‹ prev` / `next ›` step in résumé order (Tark, Epik, Consulting, DevCom, Rural, InstiApp, Trading, Drone, Skills, Education & Awards, Contact); opens 250 ms slide with 600 Hz blip; closes with Esc, `×`, tap outside, or driving > 6 m from the pad (450 Hz blip). Driving is not locked; auto-brake 12 while open.
7. **Map / teleport (M)**: centred overlay with an inline SVG of the roads and eight labelled coloured dots; car as a live Cobalt dot; click a dot → 250 ms Haze fade, car placed at the spawn point, velocity zero, facing the heading; buttons `Reset this section's props`, `Reset everything`, `Low quality` toggle, links `Text version`, `PDF`; key legend list.
8. **Toasts**: top-centre pill, 2 s, max 2 stacked: `STRIKE!`, `NICE JUMP`, `AIR 1.2 s · 11 m`, `BIG AIR`, `Copied — thakrevedant63@gmail.com`, `Cleared for takeoff`, `3 · 2 · 1 …`, `Respawned`, `Muted` / `Sound on`.
9. **Playground chips**: `PINS n / 10`, `BRICKS n / 30`, `SLALOM 00.0s` (+ best) only inside the Playground AABB; `DOWN n / 21` inside Experience.
10. **Mute (L)**: top-bar icon; persisted in `localStorage.muted`.
11. **Respawn (R)**: resets the current section's toy if disturbed (letters, crates, pins, bricks, cones, corral, trophy — all of them in the playground); otherwise unflips/teleports the car to the nearest spawn. Long-press JUMP 0.6 s on touch = R.
12. **Text résumé fallback**: `<main id="resume">` present in `index.html` at build time (hand-written from `src/content/resume.js` data via a tiny Vite plugin `resumeHtml()` that injects the rendered article at build so the two never diverge): `<h1>Vedant Thakre</h1>`, contact line (`mailto:`, `tel:`, LinkedIn, GitHub), summary, Experience (4 roles, dates, bullets), Projects, Skills (5 groups), Education & Awards, PDF link. Hidden with the `hidden` attribute once WebGL initialises; shown as a scrollable overlay by T, the top-bar `Text` button, the start-screen link, the map link. Keyboard input to the car is ignored while any overlay or focusable element has focus.
13. **Footer** (inside the text résumé overlay and the start screen): `Built with Three.js + cannon-es, inspired by bruno-simon.com` · `PDF` · `LinkedIn` · `GitHub` · `Email`.
14. **Mobile controls**: left half = floating joystick (appears where the finger lands, 110 px travel, 12 px dead zone; y → throttle, reverse below −0.3; x → steer; released → auto-brake); bottom-right cluster (64 px, 12 px gaps, safe-area insets): `BOOST` (hold), `JUMP`, `HORN`, context button reading `OPEN` on a pad / `RESET` when the section toy is disturbed / `MAP` otherwise; top bar holds map / text / mute. Two-finger pinch zooms; no orbit. `touch-action: none` on the game layer, `overscroll-behavior: none`, `100dvh`, `gesturestart` preventDefault, canvas never focused. Portrait: one-time dismissible banner `Rotate for a wider view (optional)`.
15. **Debug HUD** (`?debug`): fps, `renderer.info.render.calls`, triangles, bodies, awake bodies, physics ms; `window.CONFIG` exposes vehicle/camera params for live tweaking.

Keyboard (all via `event.code`, `preventDefault` on arrows/space): W/↑ throttle, S/↓ reverse, A/D ←/→ steer, Shift boost, Ctrl/B brake, Space jump, Enter/E interact, M map, R reset, L mute, H horn, T text résumé, `?` legend, Esc close, 1–8 teleport, wheel zoom. Blur releases all keys. Gamepad via `navigator.getGamepads()` each frame: left stick steer, RT throttle, LT brake, A jump, X horn, Y interact, LB boost, Start map. All devices write the single input state `{ throttle, steer, boost, brake, jump, interact, horn }` read once per physics step.

---

## 9. Sounds

One `AudioContext` created on START; `master = GainNode(0.7)` → `DynamicsCompressor` → destination; mute ramps master to 0 over 50 ms; persisted in `localStorage` (try/catch). Every sound is a factory `(ctx, dest, params)`; one-shots voice-limited to 12; sources disconnected on `ended`. Nothing loaded from files.

- **Engine**: sawtooth + square (detuned 3 Hz) → lowpass (400 + speed·60 Hz, max 1800) → gain; f = 70 + speed·11 Hz; gain 0.05 idle → 0.22 full throttle, 120 ms ramps; 5 Hz LFO ±3 Hz at idle; boost adds a third sawtooth one octave up at 0.06 and a 2 s pink-noise loop through bandpass 900 Hz at 0.12. Engine runs only after START; stops while `document.hidden`. Inside a hangar (car AABB inside the shell): horn and engine pass through two `DelayNode`s (80 ms −6 dB, 160 ms −12 dB).
- **Impacts** (on `collide` with impact > 1.5 m/s, max 10/s world-wide, 1 per body per 100 ms, gain = clamp(impact/8, 0, 1) × material gain): "tock" = triangle oscillator with exponential pitch drop f0 → 0.6·f0 over 70 ms, 90 ms decay. f0 by body tag: letters 420; crates 260; bricks 300; pins and developer pins 880 with a 1.5× partial ("tink"); balls 500; cones 900 (30 ms noise burst "pok"); trophy 1200 + 1800 partials, 600 ms decay (clang); boom gate 240; see-saw 200; static walls/plane/tower/rocket = 120 ms noise burst through lowpass 250 Hz (thud); chassis-generic 180 Hz 100 ms. Each impact spawns 6 dust particles.
- **Horn (H)**: two square oscillators 370 + 466 Hz → lowpass 1800, 30 ms attack, 120 ms release; held while the key is down. Triggers by proximity: windsock, drone roll, pump flywheel, tower strobe, rocket countdown, dish snap.
- **Screech**: white-noise loop → bandpass 2.2 kHz Q 6, gain follows lateral slip (local-x velocity) when > 3.5 m/s and speed > 6, 80 ms ramps.
- **Jump**: noise through lowpass sweeping 200 → 2000 Hz over 250 ms; **landing**: sine 70 Hz thud 180 ms with gain from vertical impact + short noise burst.
- **Reveal pops**: sine sweep 300 → 900 Hz over 90 ms per static group (throttled to 1 per 40 ms); letters/car use 120 → 240 Hz thuds.
- **Red button**: "boop" 300 Hz square 80 ms; reset run = 8 rising triangle notes (C4 major scale) 60 ms apart.
- **Score**: ball through gate / pin count "ding" 1320 Hz sine 200 ms; STRIKE / 9-of-9 / 21-of-21 / BIG AIR / NICE JUMP = arpeggio C5 E5 G5 C6 triangle, 90 ms apart, 300 ms decays.
- **Gate creak**: sawtooth 120 Hz → lowpass 500, gain ∝ hinge angular velocity. **Gate lamp / OTAM click**: 1 kHz 15 ms.
- **Cat's-eye tick**: 2 ms sine 1.2 kHz ×3.
- **Drone rotor**: 110 Hz sawtooth + 55 Hz square → lowpass 800, gain `0.15/(1 + d²/120)`.
- **Rocket countdown**: 880 Hz square 80 ms pulses ×3 + lowpass-noise rumble swelling over 2 s then cut.
- **Section whoosh**: bandpass noise sweep 400 → 2000 Hz over 300 ms at 0.08.
- **UI**: pad enter 600 Hz sine 60 ms; panel close 450 Hz; toast 900 Hz 30 ms.

---

## 10. Module structure (Vite + vanilla ES modules)

```
index.html                      static shell: loading/start overlay, top bar, chips, panel, map, <main id="resume"> (injected at build)
vite.config.js                  base '/', resumeHtml() plugin injects the rendered résumé article, ?url for the font JSON
public/Vedant_Thakre_Resume.pdf the PDF, copied verbatim
public/_headers                 Cloudflare cache-control for /assets/*
src/main.js                     boot: feature checks, loader queue, start gesture, app.start()
src/style.css                   all DOM styles (palette vars, panels, chips, joystick, sheets)
src/content/resume.js           single data object: contact, summary, experience[], projects[], skills{}, education, award; section copy; card/toast strings
src/core/config.js              every tunable (vehicle, camera, physics, quality, colours) on window.CONFIG in ?debug
src/core/app.js                 render loop, fixed-step physics driver (dt clamp), pause on hidden, section AABB tracking, event bus
src/core/renderer.js            WebGLRenderer, camera creation, resize, pixelRatio policy
src/core/physics.js             cannon World, materials/contact materials, body registry, sleep tuning, settle()
src/core/input.js               single input state; keyboard (event.code), gamepad poll, blur release; exposes onInteract/onHorn/onKey
src/core/camera.js              follow/lead/zoom/nudge/shake/swoop
src/core/audio.js               AudioContext, master chain, mute, engine loop, hangar echo, one-shot factories, voice limiter
src/core/tween.js               tiny tween helper (easings: backOut, cubicOut, elasticOut)
src/core/quality.js             device tier, auto-quality sampler, low-quality switch
src/core/loader.js              chunked rAF build queue with weighted progress
src/world/world.js              assembles ground, roads, boundaries, hills, global pools, sections; owns the draw-call ledger
src/world/materials.js          Toon gradient map, shared materials by palette name, emissive material, board/decal material factories
src/world/textAtlas.js          2048² shelf-packed label atlas; label(text, style) → UV rect; quad() builder
src/world/boards.js             Board(w,h) builder with its own CanvasTexture; canvas layout helpers (title/sub/body, section strip)
src/world/roads.js              merged road/apron geometry, dashes, roundabout slabs + stripe ring triggers
src/world/pads.js               Enter-pad InstancedMesh, AABB detection, active colour, pad registry, raycast targets
src/world/shadows.js            blob-shadow InstancedMesh pool bound to bodies
src/world/particles.js          dust/confetti instanced pool (position, velocity, life, gravity −12)
src/world/flow.js               pipe-flow Lamp-sphere InstancedMesh over stored polylines (Epik + Skills)
src/world/figures.js            mini-figure InstancedMesh (21 dynamic DevCom pins + 5 kinematic InstiApp walkers + podium figure)
src/world/lamps.js              global emissive InstancedMesh (runway lights, beacons) + blink scheduler
src/world/reveal.js             scale-0 → pop wave by distance, letter/car drops, section pop-in on first approach
src/world/sections/index.js     section registry: id, name, colour, centre, spawn, heading, AABB, reset()
src/world/sections/intro.js     letters, tagline board, controls decal, windsock, button, runway paint
src/world/sections/crossroads.js signpost, floor arrows, fuel drums, MAP pad, stripe ticks
src/world/sections/experience.js four hangars + dioramas (gate, OTAM, pipes, corral, pins), timeline decal, plane, pads, buttons
src/world/sections/projects.js  four pad slabs + gantries, hut, phone, chart+robot, drone controller, rocket, pads
src/world/sections/skills.js    tanks, pump house, warehouse, pipes, valves, crates+dock, pad, button
src/world/sections/education.js tower, base board, rack, podium+trophy, confetti, helipad pad
src/world/sections/playground.js sign, bowling, bricks, slalom timer, ramp+hoop+airtime, see-saw, tyres, buttons
src/world/sections/contact.js   building, dish, radar, totems, link pads, phone board, telephone, link handlers
src/world/props/car.js          car meshes, RaycastVehicle, drive/steer/jump/brake, auto-upright, stuck detector, squash, respawn
src/world/props/letters.js      TextGeometry letters + bodies + reset
src/world/props/signpost.js     post + arms + labels + wobble
src/world/props/hangar.js       half-tube shell + frame + sign + wall bodies
src/world/props/gantry.js       project slab + posts + crossbar + billboard
src/world/props/redButton.js    dome InstancedMesh, base geometry, trigger + reset choreography
src/world/props/boomGate.js     hinged boom with motor return, stripe texture, canary
src/world/props/pins.js         bowling pins InstancedMesh + bodies + down-count (used by bowling and DevCom via figures.js)
src/world/props/bricks.js       brick wall InstancedMesh + bodies + fallen count
src/world/props/cones.js        cone InstancedMesh + bodies
src/world/props/ramp.js         wedge + rotated body + landing decals + hoop trigger
src/world/props/seesaw.js       plank + fulcrum + hinge
src/world/props/bowling.js      lane, ball, backstop, strike logic
src/world/props/corral.js       nine balls, gate posts, scoreboard canvas, sourced count
src/world/props/drone.js        quad mesh + follow controller + stitch trail + roll
src/world/props/tower.js        control tower + beacon + glazing
src/world/props/rocket.js       rocket landmark + countdown gag
src/world/props/plane.js        parked plane landmark
src/world/props/tank.js         tank + ladder + lid + board mount
src/world/props/pipes.js        pipe polylines → merged cylinders/elbows/valves
src/world/props/crates.js       cargo crates InstancedMesh + bodies + dock
src/world/props/podium.js       podium + trophy body + confetti column
src/world/props/groundControl.js building, dish, radar, totems, telephone
src/world/props/windsock.js     windsock + wind reaction
src/ui/ui.js                    mounts all UI, wires events, chip/toast/label APIs
src/ui/startScreen.js           loading bar, fact chips, START, WebGL fallback path
src/ui/topBar.js                persistent bar buttons
src/ui/hud.js                   contextual chips, section label, playground/experience counters, toasts
src/ui/panel.js                 detail panel (open(id), prev/next, close rules, mobile sheet)
src/ui/map.js                   SVG map, teleport, section/all resets, low-quality toggle
src/ui/touch.js                 joystick, button cluster, pinch zoom, long-press R, orientation banner
src/ui/textResume.js            show/hide the #resume overlay, focus management
src/ui/debugHud.js              ?debug stats
```

---

## 11. Performance rules and mobile degradation

Draw-call ledger (desktop; must stay ≤ 110 measured, hard cap 150):

| Item | Calls |
|---|---|
| ground, roads, dashes, hills, pads, blob shadows, atlas labels, dust/confetti pool, flow spheres, emissive lamps, mini figures, pad-dome buttons | 12 |
| merged static architecture by colour group (Sage, Concrete, Ink, Terracotta, Cobalt, Cream, Mesa, Clay) | 8 |
| glass (tower + car windshield share one material, 2 meshes) | 2 |
| name letters | 12 |
| boards with own canvases (tagline, 4 hangar, 4 project, 5 tank, base, trophy, playground sign, contact) | 18 |
| scoreboard, phone screen, counter board | 3 |
| car (body, lamps, flame, dust share pool) + wheels | 4 |
| instanced dynamic groups: bowling pins, bricks, cones, crates, corral balls, tyres, confetti | 7 |
| single dynamic/kinetic meshes: ball, see-saw, boom, trophy, drone body + rotors + trail, OTAM group, gate lamp, magnifier, dish, radar ×2, flywheel, candles, robot, slip+cube, windsock, signpost arms group, totem cubes, telephone | ~24 |
| **Total** | **~90** |

Bodies: 1 plane + ~48 static + **113 dynamic** (12 letters, 10 pins, 30 bricks, 12 cones, 16 crates, 21 developer pins, 9 balls, ball, see-saw, boom, trophy), all sleeping at rest.

Rules:
- Every new prop is either merged into a colour group (static) or an instance of an existing group (dynamic). Adding a draw call requires updating the ledger comment in `world.js`.
- `?debug` HUD from the first commit; CI-free check: `renderer.info.render.calls` printed to console after reveal.
- Boards ≤ 1024×512 (768×384 mobile), `generateMipmaps: false`, `LinearFilter`; ≤ 22 canvases total.
- TextGeometry built only in the loader; never at runtime. `curveSegments 3`, no bevel.
- Every solid body ≥ 0.3 m thick (posts 0.3, boards 0.6, walls 0.4) against tunnelling at 26 m/s.
- Physics: fixed 1/60, `maxSubSteps 3`, dt clamped to 50 ms; stacks settled 30 steps before reveal; `allowSleep` everywhere; hinges `collideConnected: false`.
- Frame budget: physics ≤ 3 ms, render ≤ 8 ms on an iGPU at 1080p, dpr 2 → measure with the HUD.
- Loop pauses on `document.hidden`; engine sound stops.
- Blob shadows only for bodies within 60 m of the car.

Mobile degradation (`pointer: coarse` or `maxTouchPoints > 0`):
- `pixelRatio min(dpr, 1.5)`, antialias off above 1.5, fog 70–130, hills 50, dust pool 60, confetti 24, flow spheres 30, boards 768×384, atlas 1024.
- Lite body counts: bricks 18 (6×3), crates 12 (4×3), cones 8, letters/pins/developers/balls unchanged (résumé facts); `maxSubSteps 2`.
- Reveal radius 50 m; drone follow radius 12 m.
- Auto-quality: sample frame time for 3 s after reveal; average > 22 ms → pixelRatio 1, dust/confetti/flow/stitch trail disabled, fog 60–110 (same switch as the map's `Low quality` toggle); never re-raised.
- `hardwareConcurrency <= 2` or no WebGL2 → text résumé with a `Try the 3D version` button.

---

## 12. Acceptance checklist

Rendering and world
- [ ] `npm run build` produces `dist/` with `index.html`, hashed assets, `Vedant_Thakre_Resume.pdf`, `_headers`; no network request other than the bundle (font JSON is bundled).
- [ ] `renderer.info.render.calls` ≤ 110 on desktop after reveal (logged in `?debug`); ≤ 150 at any point in the world.
- [ ] 60 fps on a mid laptop iGPU at 1080p with dpr 2 at every section; physics ≤ 3 ms with all toys disturbed.
- [ ] No image or 3D files in the repo; all geometry primitives/Text/Extrude; all text via CanvasTexture; no shadow maps.
- [ ] Idle for 60 s with no input: no stack drifts, jitters or wakes (bricks, crates, pins, balls, letters).
- [ ] Switching tabs for 30 s and back does not fling any body (dt clamp).

Car and camera
- [ ] WASD/arrows drive, Shift boost (visible flame, fov widen), Ctrl/B brake, S brakes first then reverses, Space jumps only with ≥ 3 wheels grounded, R resets/respawns, H horn.
- [ ] Car flipped upside down rights itself within 2 s; car wedged with throttle held for 3 s is lifted free; falling below y=−5 respawns.
- [ ] Camera never rotates with the car; leads the car under speed; zooms with wheel/pinch within [0.55, 1.9]; swoops in on START; nudges right while the panel is open.
- [ ] Landing squash visible; wheels follow suspension.

Content (verbatim, checked against the brief)
- [ ] Letters spell VEDANT / THAKRE and are knockable; red button restores them.
- [ ] Four hangar signs show company / role / dates exactly; four panels show every experience sentence verbatim.
- [ ] Four project billboards + panels verbatim, each with a working `github.com/VIBR0X` link.
- [ ] Five tank boards carry the five skill groups verbatim; skills panel carries the full line verbatim.
- [ ] Education board, coursework strips, trophy board and the Education & Awards panel verbatim.
- [ ] Contact board shows email, phone, LinkedIn, GitHub verbatim; EMAIL pad copies + opens mailto; LinkedIn/GitHub/PDF pads open in a new tab without popup blocking (keyboard, touch and mouse).
- [ ] `<main id="resume">` is present in the built `index.html` (verify with `curl dist/index.html | grep "Founding Data Engineer"`), contains every section, and is reachable via T / Text button / start-screen link / map / WebGL-failure path.
- [ ] Top bar with `Résumé PDF`, `Contact`, `Map`, `Text`, mute is visible at all times after START.

Interaction
- [ ] All 15 pads highlight on entry, show the contextual chip, and respond to Enter/E, tap, and click-from-anywhere; panels close on Esc/×/outside tap/driving 6 m away; prev/next steps the full résumé order.
- [ ] Number keys 1–8 and map dots teleport with a fade; map `Reset this section` / `Reset everything` work.
- [ ] Boom gate lifts when pushed and returns on its own; gate lamp flashes; OTAM ring spins; Epik counter counts to 2,300,000; corral scoreboard counts to 9/9 with arpeggio; 21 developers fall and the chip counts; red buttons reset each.
- [ ] Drone takes off when the car approaches Pad D, follows, drops trail, barrel-rolls on horn, returns when the car leaves; robot head tracks the car; rocket honk shows the countdown toast and never launches.
- [ ] Playground: pins count + STRIKE at 10; bricks count; slalom timer with clean-run best in localStorage; ramp airtime toast + best; hoop awards NICE JUMP; see-saw tips; all reset by button or R.
- [ ] Section label + whoosh on every section change; section card appears once per section and respects the don't-auto-show toggle.
- [ ] Horn inside a hangar echoes; cat's-eye ticks on roundabout stripes; dish snaps to the car on horn.

Audio
- [ ] No sound before START; engine pitch/gain follow speed and throttle; impacts pitched per material and capped at 10/s; screech under lateral slip; L mutes with a ramp and persists across reloads.

Mobile (real iPhone Safari + Android Chrome)
- [ ] Joystick drives, BOOST/JUMP/HORN/context buttons work, long-press JUMP resets, pinch zooms, no page scroll/zoom/pull-to-refresh, audio unlocks on the START tap, `100dvh` layout with safe-area insets, portrait and landscape both render, panel is a swipe-down sheet.
- [ ] Auto-quality drops pixel ratio and effects on a slow device; low-quality toggle does the same manually.

Accessibility and deploy
- [ ] Canvas layer `aria-hidden`; text résumé is semantic HTML and keyboard-reachable; `prefers-reduced-motion` skips the reveal choreography.
- [ ] Deployed on Cloudflare Pages; `/Vedant_Thakre_Resume.pdf` downloads; text-only fetch of the page contains the full résumé.

---

## 13. Build order and cut list (one day)

Build in this order; the résumé is complete and navigable after step 4.
1. Renderer, ground, roads, boundaries, car + RaycastVehicle + camera; tune the vehicle first with `window.CONFIG`.
2. Letters + reveal + red button + blob shadows + dust.
3. Pads, board builder, text atlas, section registry, signpost, section labels.
4. Detail panel with all résumé text, top bar, text résumé overlay, map/teleport, number keys, click-anywhere raycast.
5. Hangars + signs, tanks + boards, tower + base board, project gantries, Ground Control + link pads, timeline decal, playground sign.
6. Audio (engine, impacts, horn, UI).
7. Playground: bowling, bricks, cones + timer, ramp + hoop + airtime, see-saw.
8. Experience toys: boom gate, 21 pins, corral, Epik pipes + flow, OTAM + lamp.
9. Skills crates, drone follow, trophy body, rocket/plane landmarks, dish/radar, windsock, phone screen, candles + robot.
10. Mobile UI, auto-quality, gamepad, polish.

If time runs short, cut from the bottom of this list, in this order: robot/candles → windsock → dish/radar animation → trophy physics (make static) → drone follow (leave hover) → crates → OTAM ring → Epik flow → corral (leave static balls) → see-saw → hoop/airtime toast. Nothing in steps 1–7 is cut.