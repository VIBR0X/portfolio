# Mars Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the range to Mars, rebuild the plane with correct axes, rebuild the Projects section
as four legible test stands with a rocket that launches cleanly, replace every desert-only ambient
system, and give every reachable prop a collision body.

**Architecture:** One foundation task (palette, textures, sky, lighting, hills, roads, shared
helpers) lands first on the `mars-rework` branch. Four independent tasks then run in parallel git
worktrees branched from that commit and touch disjoint files: the plane, the ambient systems, the
Projects section, and the per-section recolour/collision pass. A final task merges, updates the
docs and runs every gate. Model geometry is specified primitive-by-primitive in the spec; tasks
below give the interfaces, the tests and the gates, and point at the spec table to build from.

**Tech Stack:** Vite 8, three 0.185 (`MeshStandardMaterial`, `InstancedMesh` + `setColorAt`,
`RoundedBoxGeometry`, `ExtrudeGeometry`, `mergeGeometries`, `DataTexture`), cannon-es 0.20
(`KINEMATIC` bodies, `Body.aabb`), Node 22 `node:test`, playwright-core + headless Chrome.

**Spec:** `docs/superpowers/specs/2026-09-05-mars-rework-design.md` (referred to as "spec §n").

---

## Conventions

- Run everything from `/home/vedant/kriv/portfolio` (or the worktree root for Tasks 1–4).
- Unit tests: `npm run test:unit`. Node gates: `node scripts/smoke-sections.mjs && node scripts/check-rest.mjs && node scripts/check-boards-clear.mjs && node scripts/check-boards.mjs && node scripts/check-solids.mjs`.
- Browser gates need a dev server. The main session uses port 5179; **a worktree task starts its
  own** with `npx vite --port 51NN --strictPort` (Task 1: 5181, Task 2: 5182, Task 3: 5183, Task
  4: 5184) and passes `--url http://localhost:51NN/` to `scripts/e2e.mjs`; scripts without a
  `--url` flag are run through a copy in the scratchpad with the port edited.
- Rendering claims are measured, never reasoned: a screenshot or a pixel/NDC probe from a live
  frame is the evidence (`scratchpad/probe/*.mjs` show the pattern: launch Chrome with
  `--use-gl=angle --use-angle=default --enable-gpu --ignore-gpu-blocklist`, `window.__world`).
- Code style: ES modules, 2-space indent, no semicolons, single quotes, `/** */` doc comments on
  exports. `flat()` is cached by colour|emissive|intensity: **any emissive that animates on its own
  gets `flat(...).clone()` or `lampMaterial().clone()`** (spec, global rule).
- `InstancedMesh` colours: call `setColorAt` for every instance in the constructor, before the
  first render, or the mesh renders black.
- Static bodies: `world.physics.box/cylinder/sphere({ ..., mass: 0, sleepy: false })`, then
  `body.userData = { kind: 'wall', tag: 'wall' }` and `world.physics.add(body)`.
- Commit after every task with a message ending `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- After each task, `node scripts/smoke-sections.mjs` must still exit 0: it constructs the whole
  world under the Node DOM stub and is the fastest signal that a new module throws.

## Execution model

```
main ──► mars-rework: Task 0 (foundation) ──┬── worktree wt-plane    (Task 1) ──┐
                                             ├── worktree wt-ambient  (Task 2) ──┤ merge in this
                                             ├── worktree wt-projects (Task 3) ──┤ order, then Task 5
                                             └── worktree wt-sections (Task 4) ──┘
```

Tasks 1–4 must not edit each other's files. Shared files and their owner:

| File | Owner |
| --- | --- |
| `src/world/World.js` | Task 0 (floor/boundary), Task 2 (ambient wiring, lines that construct tumbleweeds/birds/turbines), Task 1 (one line: the plane's blob-shadow entry; and the ground-roll dust block in `update`), Task 3 (`requestMinZoom`) — different regions, merge cleanly |
| `src/world/sections/Experience.js` | Task 1 (`buildPlane` only), Task 4 (everything else) |
| `src/world/Shadows.js` | Task 0 (colour), Task 1 (altitude cue) |
| `scripts/unit/life.test.mjs` | Task 0 moves the rocket tests out to `rocket.test.mjs`; Task 2 deletes the file |

## File map

| File | Responsibility after this plan |
| --- | --- |
| `src/world/Materials.js` | Mars palette (spec §1.1), aliases re-pointed, `ENV_INTENSITY 0.6`, `palette.stencil` |
| `src/world/Textures.js` | `grain({ dots, dotColor, streak })`, `regolithGrain()`, `basaltGrain()`, `wearMap({ discs })`, `craterDecal()`, Mars `skyGradient`/`environmentScene` defaults |
| `src/world/Craters.js` (new) | `craterPoints(extents, { low })` — the 12 crater discs, seeded, used by the floor and by Clutter |
| `src/core/Experience.js` | `LIGHTING`, fog, clear colour for Mars |
| `src/world/World.js` | floor with crater decals and wear bowls, two hill layers, `requestMinZoom`, ambient wiring |
| `src/world/Roads.js` | basalt grain, kerb strips |
| `src/world/props/Beacon.js` (new) | `relayBeacon(world, { x, y, z, phase })` blinking lamp bead |
| `src/world/props/PlaneModel.js` (new) | `buildPlaneMesh()` — the one plane model, nose −Z, wing along X |
| `src/world/Plane.js` | uses `buildPlaneMesh`, prop spin about Z, prop-disc swap, visual-bank shell |
| `src/world/PlanePhysics.js` | `ceiling 34` |
| `src/world/Shadows.js` | Mars shadow colour; per-item `altitudeCue` |
| `src/world/props/DustDevils.js` (new) | `stepDevil()` pure + `DustDevils` updatable |
| `src/world/props/Dishes.js` (new, replaces `Turbines.js`) | `dishPositions()` + slewing dish instances |
| `src/world/Clutter.js` | boulders, pebbles, drifts, cable barriers, Mars vehicles, solar rows, crater-rim boulders |
| `src/world/sections/Projects.js` | four test stands, sounding rocket, mount, gantry, LAUNCH pad |
| `src/world/sections/rocketLaunch.js` | `ROCKET_APEX 9`, ease-out ascent, 2.6 m/s descent |
| `src/core/Camera.js` | `minZoom` request in `update()` |
| `src/world/sections/*.js`, `props/Hangar.js`, `Car.js` | recolour + missing bodies (Task 4) |
| `scripts/check-solids.mjs` | collision audit with the allow-list (exists; Task 4 finalises the list) |
| `scripts/unit/{textures,materials,world,clutter,rocket,plane,dust-devils,dishes}.test.mjs` | Node unit tests |
| `README.md`, `index.html` | Mars copy |

---

### Task 0: Foundation — palette, ground, sky, lighting, hills, roads, shared helpers

**Branch:** `git checkout -b mars-rework` from `main` (the spec commit).

**Files:**
- Modify: `src/world/Materials.js`, `src/world/Textures.js`, `src/core/Experience.js`, `src/world/World.js` (`setFloor`, `setBoundary`), `src/world/Roads.js`, `src/world/Shadows.js`, `src/world/Area.js`, `src/world/Text.js` (`floorLabel` default colour), `src/world/Particles.js` (default colour), `src/world/SkidMarks.js` (material colour), `src/world/Clutter.js` (`scatterPoints` margin option only)
- Create: `src/world/Craters.js`, `src/world/props/Beacon.js`, `scripts/unit/rocket.test.mjs`
- Modify tests: `scripts/unit/textures.test.mjs`, `scripts/unit/materials.test.mjs`, `scripts/unit/world.test.mjs`, `scripts/unit/life.test.mjs` (remove the rocket tests), `scripts/e2e-finish.mjs`, `scripts/e2e-context.mjs`

- [ ] **Step 1: Palette test**

Append to `scripts/unit/materials.test.mjs`:

```js
import { palette, ENV_INTENSITY } from '../../src/world/Materials.js'

test('the Mars palette carries the new keys and re-points every old alias', () => {
  assert.equal(palette.regolith, '#B65E38')
  assert.equal(palette.regolithDark, '#8F4426')
  assert.equal(palette.regolithLight, '#D2825A')
  assert.equal(palette.skyBottom, '#E6B98E')
  assert.equal(palette.skyTop, '#B97C50')
  assert.equal(palette.basalt, '#7C5240')
  assert.equal(palette.habitat, '#EFEAE0')
  assert.equal(palette.steel, '#8FA9B8')
  assert.equal(palette.rover, '#2E6DA4')
  assert.equal(palette.navy, '#1F3550')
  assert.equal(palette.stencil, '#F3E4D2')
  // aliases
  assert.equal(palette.dune, palette.regolith)
  assert.equal(palette.sand, palette.regolith)
  assert.equal(palette.haze, palette.skyBottom)
  assert.equal(palette.tarmac, palette.basalt)
  assert.equal(palette.sage, palette.steel)
  assert.equal(palette.sageDark, palette.steelDark)
  assert.equal(palette.mesa, palette.regolithLight)
  assert.equal(palette.cobalt, '#2F5D8A')
  assert.equal(palette.concrete, '#B9B0A2')
  assert.equal(palette.lavender, palette.dusk)
  assert.equal(ENV_INTENSITY, 0.6)
})
```

Run `npm run test:unit` — expected: the new test fails on `regolith`.

- [ ] **Step 2: Rewrite the palette** in `src/world/Materials.js` from spec §1.1: the new-key table
verbatim (`regolith`, `regolithDark`, `regolithLight`, `pebble`, `dust`, `skyBottom`, `skyTop`,
`basalt`, `basaltDark`, `concrete`, `habitat`, `cream`, `cobalt`, `steel`, `steelDark`, `rover`,
`terracotta`, `clay`, `navy`, `rock`, `rockLight '#8A5A44'`, `hill '#8F4426'`, `hillLight
'#A85C3E'`, `mesaFar '#8F4426'`, `mesaFarLight '#B86A45'`, `ink`, `lamp`, `glass '#9CCFD8'`,
`shadow '#5A2C18'`, `dusk`, plus `stencil '#F3E4D2'` for every floor stencil colour) and the alias
table (`dune`/`sand` → regolith, `sandDark` → regolithDark, `tarmac`/`road` → basalt, `haze` →
skyBottom, `mesa`/`wood` → regolithLight, `woodDark` → ink, `sage`/`mint`/`grass` → steel,
`sageDark`/`leaf`/`teal` → steelDark, `slate` → concrete, `blue` → cobalt, `coral`/`rose` →
terracotta, `coralDark` → clay, `lavender`/`lilac` → dusk, `sky` → glass, `white` → cream,
`charcoal` → ink, `amber` → lamp, `inkSoft` unchanged). `ENV_INTENSITY = 0.6`. Keep the palette a
plain object literal; aliases are written as literal hex strings equal to their target (the test
compares values).

- [ ] **Step 3: Texture tests** — replace the `sandGrain`/`tarmacGrain` tests in
`scripts/unit/textures.test.mjs` with:

```js
import { hexBytes, grain, regolithGrain, basaltGrain, fitGrain, wearMap, craterDecal, skyGradient, environmentScene } from '../../src/world/Textures.js'
import { palette } from '../../src/world/Materials.js'

test('regolithGrain and basaltGrain are shared singletons with a metres-per-tile hint', () => {
  assert.equal(regolithGrain(), regolithGrain())
  assert.equal(regolithGrain().userData.metres, 24)
  assert.equal(basaltGrain().userData.metres, 12)
  assert.notEqual(regolithGrain(), basaltGrain())
})

test('grain dots stamp 2×2 pebbles of dotColor at the requested density', () => {
  const size = 64
  const tex = grain({ size, seed: 3, a: '#800000', b: '#800000', speckle: 0, dots: 0.01, dotColor: '#00FF00' })
  const d = tex.image.data
  let green = 0
  for (let i = 0; i < size * size; i++) if (d[i * 4 + 1] === 255 && d[i * 4] === 0) green++
  // round(64²·0.01) = 41 dots × up to 4 texels, minus overlaps and edge clipping
  assert.ok(green >= 41 && green <= 164, `green texels ${green}`)
})

test('grain streak modulates along v without changing the mean much', () => {
  const plain = grain({ size: 64, seed: 5, speckle: 0 }).image.data
  const streaked = grain({ size: 64, seed: 5, speckle: 0, streak: 0.08 }).image.data
  let diff = 0
  for (let i = 0; i < plain.length; i += 4) diff += Math.abs(plain[i] - streaked[i])
  assert.ok(diff > 0, 'streak changes the texture')
  assert.ok(diff / (plain.length / 4) < 12, 'but only subtly')
})

test('wearMap discs cut a bowl that is darkest at the centre and fades to the rim', () => {
  const rect = { x0: -50, x1: 50, z0: -50, z1: 50 }
  const tex = wearMap(rect, { size: 100, blotch: 0, discs: [{ cx: 0, cz: 0, r: 10, amount: 0.12 }] })
  const d = tex.image.data
  const at = (x, z) => { const px = Math.floor((x - rect.x0) / 100 * 100); const py = Math.floor((rect.z1 - z) / 100 * 100); return d[(py * 100 + px) * 4] }
  assert.ok(at(0, 0) < at(6, 0), 'centre darker than mid-bowl')
  assert.ok(at(6, 0) < at(9.5, 0), 'mid-bowl darker than the rim')
  assert.equal(at(30, 0), 255, 'untouched ground is exactly 1.0')
  assert.ok(at(0, 0) >= Math.round(0.78 * 255), 'clamped at 0.78')
})

test('craterDecal is a transparent 256² RGBA with a dark bowl and a light rim', () => {
  const tex = craterDecal()
  assert.equal(tex.image.width, 256)
  const d = tex.image.data
  const px = (x, y) => Array.from(d.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4))
  const centre = px(128, 128)
  const rim = px(128 + Math.round(0.82 * 128), 128)
  const outside = px(255, 128)
  assert.deepEqual(centre.slice(0, 3), hexBytes(palette.regolithDark))
  assert.ok(centre[3] > 60 && centre[3] <= 90, `centre alpha ${centre[3]}`)
  assert.deepEqual(rim.slice(0, 3), hexBytes(palette.regolithLight))
  assert.ok(rim[3] > 0)
  assert.equal(outside[3], 0)
})

test('the sky and the environment dome are Mars-coloured', () => {
  const sky = skyGradient()
  const d = sky.image.data
  assert.deepEqual(Array.from(d.slice(0, 3)), hexBytes(palette.skyBottom))
  assert.deepEqual(Array.from(d.slice(d.length - 4, d.length - 1)), hexBytes(palette.skyTop))
  const env = environmentScene()
  assert.equal(env.children.length, 2)
})
```

Keep the existing `fitGrain` / `worldToUv` / `valueNoise` tests, switching `sandGrain` to
`regolithGrain`. Run — expected: fails on the missing exports.

- [ ] **Step 4: Implement the textures** in `src/world/Textures.js` per spec §1.2–1.3:
  - `grain()` gains `dots = 0`, `dotColor = palette.pebble`, `streak = 0`. After the fbm/speckle
    lerp of `t`: if `streak > 0`, `t *= 1 - streak + streak * Math.sin((y / size) * Math.PI * 2 * 3 + n[i] * 4)`
    then clamp; after the colour write, stamp `Math.round(size * size * dots)` pebbles from a
    second `rng(seed + 7)`: for each, pick `x, y` and write `dotColor` into `(x, y)`, `(x+1, y)`,
    `(x, y+1)`, `(x+1, y+1)` when inside the texture.
  - `regolithGrain()` replaces `sandGrain()`: `grain({ size: 1024, seed: 3, a: palette.regolith, b: palette.regolithLight, baseCells: 5, octaves: 4, speckle: 0.05, speckleStrength: 0.28, dots: 0.004, dotColor: palette.pebble, streak: 0.08 })`, `metres = 24`.
  - `basaltGrain()` replaces `tarmacGrain()`: `grain({ size: 512, seed: 11, a: palette.basalt, b: palette.basaltDark, baseCells: 12, octaves: 2, speckle: 0.02, speckleStrength: 0.2, dots: 0.002, dotColor: '#8A7568' })`, `metres = 12`.
  - `wearMap()` gains `discs = []`; for each `{ cx, cz, r, amount = 0.12 }`, `d = hypot(wx-cx, wz-cz)`; if `d < r`: `v -= amount * (1 - smooth(d / r))`; else if `d < r + feather`: `v -= amount * (1 - smooth((d - r) / feather)) * 0` — no, the bowl already fades to 0 at the rim, so nothing outside. Clamp floor 0.78.
  - `craterDecal()`: 256² RGBA `DataTexture`, sRGB, radial `t = hypot(x-128, y-128) / 128`; `t <= 0.72` → regolithDark, alpha `round(255 * 0.35 * (1 - (t/0.72)**2))`; `0.72 < t <= 0.92` → regolithLight, alpha `round(255 * 0.4 * (1 - smooth((t - 0.72) / 0.2)))`; else alpha 0. Note the centre alpha is `0.35·255 ≈ 89`.
  - `skyGradient` defaults `bottom = palette.skyBottom`, `top = palette.skyTop`, `horizon 0.55`.
  - `environmentScene` colours: below `regolith`, horizon `skyBottom`, above `skyTop`; sun disc `new THREE.Color(4.6, 4.3, 3.9)`.

- [ ] **Step 5: `Craters.js`** — create with its test:

```js
// scripts/unit/clutter.test.mjs (append)
import { craterPoints } from '../../src/world/Craters.js'
import { scatterPoints } from '../../src/world/Clutter.js'
import { ROAD_RECTS } from '../../src/world/Roads.js'
import { SECTION_DEFS } from '../../src/world/sections/registry.js'

const EXTENTS = { x0: -110, x1: 110, z0: -130, z1: 75 }

test('twelve craters, 3–8 m, seeded, clear of roads and sections by their own radius plus 2 m', () => {
  const craters = craterPoints(EXTENTS)
  assert.equal(craters.length, 12)
  assert.deepEqual(craters, craterPoints(EXTENTS), 'deterministic')
  for (const c of craters) {
    assert.ok(c.r >= 3 && c.r <= 8, `r ${c.r}`)
    for (const rd of ROAD_RECTS) {
      const dx = Math.max(0, Math.abs(c.cx - rd.cx) - rd.w / 2)
      const dz = rd.disc ? 0 : Math.max(0, Math.abs(c.cz - rd.cz) - rd.d / 2)
      const d = rd.disc ? Math.max(0, Math.hypot(c.cx - rd.cx, c.cz - rd.cz) - rd.w / 2) : Math.hypot(dx, dz)
      assert.ok(d >= c.r + 2 - 1e-6, `crater at ${c.cx},${c.cz} r ${c.r} touches ${rd.name}`)
    }
    for (const s of SECTION_DEFS) {
      const [x0, z0, x1, z1] = s.aabb
      const inside = c.cx > x0 - c.r && c.cx < x1 + c.r && c.cz > z0 - c.r && c.cz < z1 + c.r
      assert.ok(!inside, `crater at ${c.cx},${c.cz} overlaps ${s.id}`)
    }
  }
  assert.equal(craterPoints(EXTENTS, { low: true }).length, 6)
})

test('scatterPoints honours a road margin and a section margin', () => {
  const pts = scatterPoints(EXTENTS, 40, 11, { margin: 8, sectionMargin: 8 })
  for (const p of pts) {
    for (const rd of ROAD_RECTS) {
      if (rd.disc) assert.ok(Math.hypot(p.x - rd.cx, p.z - rd.cz) >= rd.w / 2 + 8 - 1e-6)
      else assert.ok(Math.abs(p.x - rd.cx) >= rd.w / 2 + 8 - 1e-6 || Math.abs(p.z - rd.cz) >= rd.d / 2 + 8 - 1e-6)
    }
    for (const s of SECTION_DEFS) {
      const [x0, z0, x1, z1] = s.aabb
      assert.ok(p.x < x0 - 8 || p.x > x1 + 8 || p.z < z0 - 8 || p.z > z1 + 8)
    }
  }
})
```

Implement `scatterPoints(extents, count, seed = 11, { margin = 2.5, sectionMargin = 0 } = {})` in
`Clutter.js` (`clearOfRoads(x, z, margin)`, `clearOfSections(x, z, sectionMargin)` inflate by the
margins) — this is the only `Clutter.js` change in Task 0 — and `src/world/Craters.js`:

```js
import { scatterPoints } from './Clutter.js'

/**
 * The range's craters: twelve seeded discs, 3–8 m across, clear of every road and section by their
 * own radius plus 2 m. Shared by the floor (wear bowls + decals) and by Clutter (rim boulders).
 */
export function craterPoints(extents, { low = false } = {}) {
  const pts = scatterPoints(extents, 12, 23, { margin: 10, sectionMargin: 8 })
  const craters = pts.map((p) => ({ cx: p.x, cz: p.z, r: 3 + p.r * 5 }))
  return low ? craters.slice(0, 6) : craters
}
```

(`margin: 10` ≥ `r + 2` for every `r ≤ 8`; `sectionMargin: 8` ≥ `r`.) Run the tests — expected: pass.

- [ ] **Step 6: Floor and hills in `World.js`** per spec §1.2 and §1.5:
  - `setFloor`: `this.craters = craterPoints(this.extents, { low })`; `wearMap(floorRect, { rects: ROAD_RECTS, discs: this.craters.map((c) => ({ ...c, amount: 0.12 })) })`; grain `regolithGrain()`; then the crater decal `InstancedMesh(CircleGeometry(1, 24).rotateX(-π/2), MeshBasicMaterial({ map: craterDecal(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, toneMapped: false }), craters.length)`, each instance at `(cx, 0.02, cz)` scale `(r, 1, r)`, `renderOrder 1`, `frustumCulled false`, `name 'crater-decals'`, `castShadow = receiveShadow = false`, added straight to the scene.
  - `setBoundary`: hills keep their placement; material `flat('#FFFFFF')` with `setColorAt(i, new Color().lerpColors(new Color(palette.hill), new Color(palette.hillLight), rnd()))`; add the far mesa layer: `CylinderGeometry(0.72, 1, 1, 7)` translated `(0, 0.5, 0)` before instancing, 24 (low 14) instances on the same perimeter walk with a second seed (9), 30–45 m outside the walls, scale `(14–22, 9–13, 10–16)`, y −1, colour lerp `mesaFar → mesaFarLight`, `castShadow = receiveShadow = false`, `frustumCulled = false`, `name 'mesas'`.
  - Update `scripts/unit/world.test.mjs`: the floor test now expects `regolithGrain()`'s image, and add `test('the scene has a mesa layer of 24 coloured instances behind the hills', ...)` asserting `scene.getObjectByName('mesas').count === 24` and `instanceColor` non-null, and `scene.getObjectByName('crater-decals').count === 12`.

- [ ] **Step 7: Lighting, fog, sky in `Experience.js`**: `LIGHTING = { sun: 1.25, hemi: 1.0, sunColor: '#FFF0DE', skyColor: '#F1CFA8', groundColor: '#9C5535', direction: [1, 2, 1] }`; clear colour `palette.skyBottom`; `scene.fog = new THREE.Fog(palette.skyBottom, low ? 70 : 90, low ? 130 : 170)`; `setLowQuality` fog `(60, 110)`; `scene.background = skyGradient()` (defaults now Mars).

- [ ] **Step 8: Roads** — `Roads.js` uses `basaltGrain()`; add `buildKerbs(world)` called from `buildRoads`: one merged `flat(palette.concrete)` mesh of `BoxGeometry(len, 0.08, 0.35)` strips centred at y 0.04 along the edges in spec §1.6 (north avenue z −36 and −24 for x −98..−9 and 9..98; south avenue z 25 and 35 for x 7..84; runway x ±7 for z −112..−38 and −22..32, rotated 90°), `name 'kerbs'`, `addStatic(mesh, { reveal: false, cast: false })`. Add to `scripts/unit/roads.test.mjs`: `scene.getObjectByName('kerbs')` exists and its geometry's bounding box spans x −98..98.

- [ ] **Step 9: Small colour moves**: `Shadows.js` gradient rgba `(90, 44, 24, …)` and `color: palette.shadow`; `Area.js` idle ring `flat(palette.cream)`, label colour `palette.stencil`; `Text.js` `floorLabel` default `color = palette.stencil`; `Particles.js` default colour `palette.dust` (import palette); `SkidMarks.js` material colour `palette.regolithDark`.

- [ ] **Step 10: `props/Beacon.js`**:

```js
import * as THREE from 'three'
import { lampMaterial, palette } from '../Materials.js'

/**
 * A relay beacon: one lamp bead with its own material, 0.15 s on every 2 s from `phase`.
 * Separate meshes on purpose — instanceColor multiplies diffuse only, so per-item blinking needs a
 * material each. Returns the mesh; registers itself as an updatable.
 */
export function relayBeacon(world, { x, y, z, phase = 0, period = 2, on = 0.15 }) {
  const mat = lampMaterial().clone()
  mat.emissive.set(palette.terracotta)
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat)
  mesh.position.set(x, y, z)
  world.addStatic(mesh, { reveal: false, cast: false })
  world.addUpdatable({ update(dt, elapsed) { mat.emissiveIntensity = ((elapsed + phase) % period) < on ? 1.6 : 0.15 } })
  return mesh
}
```

Test (`scripts/unit/props.test.mjs`, append): build with `fakeWorld()`, call
`world.updatables.at(-1).update(0, 0)` → intensity 1.6; `update(0, 1)` → 0.15; `update(0, 2.05)` → 1.6.

- [ ] **Step 11: Split the rocket tests** — create `scripts/unit/rocket.test.mjs` holding the five
`rocketStep` tests currently in `life.test.mjs` (unchanged for now; Task 3 rewrites them), and
delete them from `life.test.mjs` (which keeps the tumbleweed/bird/turbine tests until Task 2
deletes the file).

- [ ] **Step 12: Re-baseline the pixel gates** — `scripts/e2e-finish.mjs`: lit-ground target is
the mean of `palette.regolith` and `palette.regolithLight` (computed from the two hexes at
runtime, ±16 per channel), shadow ratio window 0.55–0.72, board-cream assertion unchanged, acne
guard unchanged. `scripts/e2e-context.mjs` only compares before/after and needs no change beyond the
comment. Start the server (`npx vite --port 5179 --strictPort &` if not running) and run
`node scripts/e2e-finish.mjs` — expected: all checks pass; if the lit mean is outside the window,
adjust `LIGHTING.sun` by ±0.05 steps (never the palette) and record the final value in the spec.

- [ ] **Step 13: Gates and commit**

```bash
npm run test:unit && node scripts/smoke-sections.mjs && node scripts/check-rest.mjs && node scripts/check-boards-clear.mjs && node scripts/check-boards.mjs
node scripts/e2e.mjs --out /tmp/claude-1000/-home-vedant-kriv-portfolio/3a417e19-95d4-4f67-b084-4bdb5c5077dd/scratchpad/t0   # 60 fps, calls ≤ 450 everywhere, errors: none
node scripts/hero.mjs /tmp/claude-1000/-home-vedant-kriv-portfolio/3a417e19-95d4-4f67-b084-4bdb5c5077dd/scratchpad/t0-hero   # look at 01-intro.png: rust ground, tan sky, dark basalt runway, red hills, mesas behind
git add -A && git commit -m "Mars foundation: regolith and basalt grains, craters, butterscotch sky, two hill layers, kerbs, beacons"
```

(`check-solids.mjs` is expected to still fail here — Task 4 closes it.)

---

### Task 1: Plane rebuild (worktree `wt-plane`, port 5181)

**Files:**
- Create: `src/world/props/PlaneModel.js`, `scripts/unit/plane.test.mjs`
- Modify: `src/world/Plane.js`, `src/world/PlanePhysics.js` (`ceiling: 34`), `src/world/Shadows.js` (altitude cue), `src/world/World.js` (plane shadow entry `{ rx: 4.1, rz: 3.3, altitudeCue: true }`; ground-roll dust block), `src/world/sections/Experience.js` (`buildPlane` only), `scripts/e2e-fly.mjs` (screenshot names + one orientation check)

- [ ] **Step 1: The test that would have caught the sideways plane**

```js
// scripts/unit/plane.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { fakeWorld } from './fixture.mjs'
import { buildPlaneMesh } from '../../src/world/props/PlaneModel.js'
import { Plane } from '../../src/world/Plane.js'

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
```

Run: `node --test scripts/unit/plane.test.mjs` — expected: fails (`buildPlaneMesh` missing).

- [ ] **Step 2: `props/PlaneModel.js`** — `export function buildPlaneMesh({ registration = 'VT-VED' } = {})`
returning `{ group, shell, propHub, propDisc, lamps }`, built exactly from the 22-row table in spec
§4 (materials, local coordinates, merge groups). `shell` is a child group holding every part;
`group` is the root the body drives. Rotation notes from the spec apply: cylinders/cones point +Y;
`rotateX(π/2)` sends +Y to +Z (tail); `rotateX(−π/2)` sends the apex to −Z (nose). Apply
`applyShadowFlags(group)` at the end.

- [ ] **Step 3: `Plane.js`** uses the builder: `const m = buildPlaneMesh(); this.group = m.group; this.shell = m.shell; this.propHub = m.propHub; this.propDisc = m.propDisc`. In `update`: `propHub.rotation.z += dt * (4 + speed * 3)`; `propHub.visible = speed < 8; propDisc.visible = speed >= 8`; visual bank/pitch on the shell only: `shell.rotation.set(extraPitch, 0, bank * 0.2, 'YXZ')` where `extraPitch = |vy| > 1 ? 0.15 * sign(vy) : 0` (the body keeps the true values; the shell adds the exaggeration on top of the group's physics quaternion). `PLANE.ceiling = 34`.

- [ ] **Step 4: Shadows altitude cue** — `BlobShadows.add(target, { rx, rz, baseY, altitudeCue = false })`; in `update`, for items with `altitudeCue`: `k = clamp(1 - h / 40, 0.25, 1)` as the strength factor written into `instanceColor`… BlobShadows has no per-instance alpha, so implement the cue as scale only: `s = (1 + h / 60)`, `rx * s * (0.35 + 0.65 * k)` — the disc grows and lightens by shrinking its dark core. Document that in the doc comment. `World` registers the plane with `{ rx: 4.1, rz: 3.3, altitudeCue: true }`.

- [ ] **Step 5: Ground-roll dust** in `World.update` (plane branch): replace the single prop-wash
emitter with two wheel emitters: every 0.1 s while `plane.grounded && plane.speed > 3`, for `sx` of
±1.05, `p = plane.group.localToWorld(new THREE.Vector3(sx, -0.6, -0.35))`, `particles.emit(p, { count: 2, color: palette.dust, spread: 0.6, life: 0.5, size: 0.12 })`; on `justLifted` emit 12 at the plane position (colour `dust`). Landing dust colour `regolithLight`.

- [ ] **Step 6: Experience landmark plane** — `buildPlane()` in `Experience.js` becomes: `const { group } = buildPlaneMesh(); group.position.set(-92, 1.05, -30); group.rotation.y = Math.PI / 2 /* nose east, toward the hangars */; world.addStatic(group)`; body box `[8.8, 2.2, 7.0]` at `(-92, 1.1, -30)` — note the box is wider than long because the plane is turned 90°: use `[7.0, 2.2, 8.8]`.

- [ ] **Step 7: Measure** — start `npx vite --port 5181 --strictPort &`, copy `scripts/hero.mjs`
and `scripts/e2e-fly.mjs` to the scratchpad with the port changed, run both, and open
`01-intro.png` and `01-airborne.png`: the parked plane must show the wingspan across the runway
direction (left–right on screen) and the nose pointing up-screen (north); the airborne frame must
show a banked cross. Add to `e2e-fly.mjs` a numeric orientation check: after boarding, the world
position of `propHub` minus the group position has `z < -2.5` and `|x| < 0.2`.

- [ ] **Step 8: Gates and commit**

```bash
npm run test:unit && node scripts/smoke-sections.mjs && node scripts/check-rest.mjs
git add -A && git commit -m "Rebuild the plane nose-forward from a shared builder; prop disc, visual bank, wheel dust, altitude shadow cue"
```

---

### Task 2: Ambient life on Mars (worktree `wt-ambient`, port 5182)

**Files:**
- Create: `src/world/props/DustDevils.js`, `src/world/props/Dishes.js`, `scripts/unit/dust-devils.test.mjs`, `scripts/unit/dishes.test.mjs`
- Delete: `src/world/props/Tumbleweed.js`, `src/world/props/Birds.js`, `src/world/props/Turbines.js`, `scripts/unit/life.test.mjs`
- Modify: `src/world/Clutter.js` (everything except `scatterPoints`), `src/world/World.js` (construction lines only), `scripts/unit/clutter.test.mjs`, `README.md` (the "Between the stations" paragraph and the layout tree only)

- [ ] **Step 1: Dust-devil tests**

```js
// scripts/unit/dust-devils.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { stepDevil, DEVIL } from '../../src/world/props/DustDevils.js'
import { SECTION_DEFS } from '../../src/world/sections/registry.js'
import { ROAD_RECTS } from '../../src/world/Roads.js'

const EXTENTS = { x0: -110, x1: 110, z0: -130, z1: 75 }
const env = { extents: EXTENTS, sections: SECTION_DEFS, roads: ROAD_RECTS }
const rng = () => 0.5 // no drift

test('a devil started inside a section AABB steers out of it within 6 s', () => {
  const d = { x: 0, z: -30, heading: 0, speed: 2.5, spin: 4, phase: 0 } // the crossroads
  let t = 0
  while (t < 6 && !clear(d)) { stepDevil(d, 1 / 60, env, rng); t += 1 / 60 }
  assert.ok(clear(d), `still inside at ${d.x},${d.z} after ${t.toFixed(1)}s`)
})

test('a devil never leaves the extents minus the 6 m margin', () => {
  const d = { x: 100, z: 60, heading: Math.PI / 4, speed: 3, spin: 4, phase: 0 }
  for (let i = 0; i < 60 * 60; i++) {
    stepDevil(d, 1 / 60, env, rng)
    assert.ok(d.x >= EXTENTS.x0 + 6 && d.x <= EXTENTS.x1 - 6 && d.z >= EXTENTS.z0 + 6 && d.z <= EXTENTS.z1 - 6, `${d.x},${d.z}`)
  }
})

function clear(d) {
  for (const s of SECTION_DEFS) { const [x0, z0, x1, z1] = s.aabb; if (d.x > x0 - 6 && d.x < x1 + 6 && d.z > z0 - 6 && d.z < z1 + 6) return false }
  for (const r of ROAD_RECTS) {
    if (r.disc) { if (Math.hypot(d.x - r.cx, d.z - r.cz) < r.w / 2 + 3) return false; continue }
    if (Math.abs(d.x - r.cx) < r.w / 2 + 3 && Math.abs(d.z - r.cz) < r.d / 2 + 3) return false
  }
  return true
}
```

- [ ] **Step 2: `DustDevils.js`** per spec §2.1: `export const DEVIL = { height: 9, radiusTop: 1.6, radiusBottom: 0.35, turn: 0.9, margin: 6 }`; `export function stepDevil(d, dt, env, rng = Math.random)`: advance `d.x/d.z` by `heading·speed·dt`; `d.heading += (rng() - 0.5) * 0.8 * dt`; if the new position is inside a section AABB inflated by 6, a road inflated by 3, or outside extents minus 6: undo the move, `d.heading += DEVIL.turn * dt` (and for the extents case reflect: flip the heading component pointing outward); return `d`. `class DustDevils { constructor(world, { count = low ? 2 : 4 }) ... update(dt, elapsed) }` with one `InstancedMesh(CylinderGeometry(1.6, 0.35, 9, 8, 1, true), flat(palette.regolithLight, { transparent: true, opacity: 0.32, side: DoubleSide, roughness: 1 }), count)`, `material.depthWrite = false`, `renderOrder 2`, `name 'dust-devils'`, `addStatic(mesh, { reveal: false, cast: false })`. Starting positions from `scatterPoints(extents, count, 31, { margin: 3, sectionMargin: 6 })`. Per frame: skip devils beyond 110 m of `world.camera.smoothTarget`; `stepDevil`; matrix `compose((x, 4.5, z), Euler(sin(t·1.3+phase)·0.08, spin·t, cos(t·1.1+phase)·0.08), 1)`; every 0.15 s emit 3 particles at `(x, 0.3, z)` (`dust`, spread 1.5, velocity (0, 2.5, 0), life 1.0, gravity −2). Car bump: chassis centre within 3 m and cooldown 0 → `chassis.applyImpulse(new CANNON.Vec3((rng-0.5)*2.4, 2.6 * mass, (rng-0.5)*2.4))`, `sounds.hit(0.4, 200, { noise: true })`, 10 particles, cooldown 2 s. Plane: within 3 m horizontally and below 12 m → `world.plane.physics.gust = 0.15` (add `gust` to `PlanePhysics`: `this.bank += this.gust; this.gust *= Math.exp(-dt / 0.4)` before the bank easing — a one-line addition; keep it in `PlanePhysics.js` even though Task 1 owns `Plane.js`).

- [ ] **Step 3: Dishes** — `scripts/unit/dishes.test.mjs` copies the old turbine-position test
(eight positions, all outside the walls) against `dishPositions`. `Dishes.js` per spec §2.3:
`dishPositions(extents)` (identical to `turbinePositions`), three merged static meshes (habitat towers, concrete bases, cobalt yokes), one `InstancedMesh(8)` of the reflector + feed geometry, one merged lamp-bead mesh with one cloned `lampMaterial` (emissive terracotta) blinking at 0.5 Hz; `update(dt, elapsed)` slews each dish: `compose((x, 12.4, z), Euler(-(0.95 + 0.1·sin(t·0.15 + i)), 0.5·sin(t·0.08 + i·0.9), 0, 'YXZ'), 1)`.

- [ ] **Step 4: Clutter rewrite** per spec §2.4–2.8, keeping `scatterPoints` and the `instanced()` helper:
  - boulders: `DodecahedronGeometry(1, 0)`, 45/22, white material + `setColorAt` lerp `rock → rockLight` by `p.r`, `s = 1.1 + p.r·1.3`, matrix from the spec, `cast true`, name `boulders`; the first 24 (low 12) placed in pairs on crater rims (`craterPoints`, angle `p.r·2π`, distance `r·1.05`, then `clearOfRoads`/`clearOfSections` re-checked — skip a point that fails), the rest from `scatterPoints`. Static sphere body `r = 0.8·s` at `(x, 0.5·s, z)` for those 24 (low 12).
  - pebbles: the old rocks, scale 0.5–0.9, y 0.22, colour lerp `regolithLight → '#A8674A'`, `cast false`, no bodies, name `pebbles`.
  - drifts: `SphereGeometry(1, 8, 5)` scaled `(2.4 + p.r·1.2, 0.22, 1.0 + p.r·0.6)`, yaw `p.r·0.6 − 0.3`, colour lerp `regolithLight → '#DA9068'`, y 0, `cast false`, no bodies, name `drifts`, counts 70/34.
  - cable barriers: same three runs and bodies; concrete posts with terracotta bands (merged), two cobalt cables at y 0.42 and 0.66 (merged).
  - Mars vehicles: same three spots and bodies; tanker rover / regolith hauler / utility rover from the spec table.
  - solar rows: `buildSolar(world, low)` builds every row in spec §2.8 (Projects verge: rows z −16.5 and −20.5, x = 22 + i·3.2 and 54 + i·3.2 for i 0..7, gap x 46..52; Skills east: x 24, z = −78 + i·3.2, rotated so the tilt faces +z) as two `InstancedMesh`es total (`navy` panels `cast true`, `concrete` frames+legs `cast false`), low tier every other panel, and one static box per row-half (`[26, 1.6, 2.2]` at `(33.2, 0.8, z)` and `(65.2, 0.8, z)` for each Projects row; `[2.2, 1.6, 26]` at `(24, 0.8, −66.8)` for Skills).
  - `clutter.test.mjs`: keep the scatter tests; add `test('boulders: 45 instances, 24 with sphere bodies, all coloured', ...)` using `fakeWorld()` + `buildClutter(world)`: count bodies whose `shapes[0]` is a `CANNON.Sphere` with `mass 0` → 24; `scene.getObjectByName('boulders').instanceColor` non-null; and `test('solar rows: 40 panels on the high tier, 5 row bodies')`.

- [ ] **Step 5: World wiring** — replace the tumbleweed/bird/turbine construction with `this.dustDevils = new DustDevils(this); this.addUpdatable(this.dustDevils); this.dishes = new Dishes(this); this.addUpdatable(this.dishes)`; remove the three imports; remove `tumbleweed` from `IMPACT_PITCH`. Delete the three prop files and `life.test.mjs`. Update the "Particles" doc comment (`tumbleweed pops` → `dust-devil dust`).

- [ ] **Step 6: Measure** — `npx vite --port 5182 --strictPort &`; run the `e2e.mjs` sweep with
`--url http://localhost:5182/` (calls ≤ 450, errors none); a probe that teleports the car to a devil
(`window.__world.dustDevils.devils[0]`) and confirms a chassis-velocity jump; a hero shot of the
intro and projects frames showing boulders, drifts, solar rows, no green anywhere.

- [ ] **Step 7: Gates and commit**

```bash
npm run test:unit && node scripts/smoke-sections.mjs && node scripts/check-rest.mjs
git add -A && git commit -m "Replace tumbleweeds, birds, turbines and cacti with dust devils, deep-space dishes, boulders, drifts, solar rows and Mars rovers"
```

---

### Task 3: Projects section (worktree `wt-projects`, port 5183)

**Files:**
- Modify: `src/world/sections/Projects.js` (rewrite), `src/world/sections/rocketLaunch.js`, `src/core/Camera.js` (`minZoom` in `update`), `src/world/World.js` (`requestMinZoom` + pass-through, three lines), `src/world/sections/registry.js` (label `PROJECTS — Test Stands`), `scripts/unit/rocket.test.mjs`

- [ ] **Step 1: Rocket tests** — rewrite `scripts/unit/rocket.test.mjs` for the new curve:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { rocketStep, ROCKET_APEX } from '../../src/world/sections/rocketLaunch.js'

test('countdown holds for 3 s then ascends', () => {
  let s = { state: 'countdown', t: 0, y: 0 }
  for (let i = 0; i < 176; i++) s = rocketStep(s, 1 / 60)
  assert.equal(s.state, 'countdown')
  for (let i = 0; i < 6; i++) s = rocketStep(s, 1 / 60)
  assert.equal(s.state, 'ascending')
})

test('ascent is ease-out: half the height in the first 0.9 s, zero vertical speed at the apex', () => {
  let s = { state: 'ascending', t: 0, y: 0 }
  for (let i = 0; i < 54; i++) s = rocketStep(s, 1 / 60) // 0.9 s
  assert.ok(s.y > ROCKET_APEX * 0.48 && s.y < ROCKET_APEX * 0.55, `y ${s.y}`)
  let prev = s.y
  for (let i = 0; i < 131; i++) { s = rocketStep(s, 1 / 60); prev = s.y } // to 3.08 s
  assert.equal(s.state, 'coasting')
  assert.ok(Math.abs(s.y - ROCKET_APEX) < 0.05)
  assert.equal(ROCKET_APEX, 9)
})

test('descends at 2.6 m/s and re-arms after a 6 s cooldown', () => {
  let s = { state: 'descending', t: 0, y: 5.2 }
  s = rocketStep(s, 1)
  assert.ok(Math.abs(s.y - 2.6) < 1e-9)
  s = rocketStep(s, 1.1)
  assert.equal(s.state, 'idle')
  assert.equal(s.y, 0)
  assert.equal(s.cooldown, 6)
})
```

`rocketLaunch.js`: `ROCKET_APEX = 9`; ascending `k = min(1, t/3)`, `y = APEX·(1 − (1 − k)²)`; descending `y -= 2.6·dt`.

- [ ] **Step 2: Camera floor** — `Camera.update(dt, target, velocity, { altitude = 0, minZoom = 0 } = {})`: `zoomTarget = max(this.targetZoom, minZoom) + boost + altLift·0.016`. `World.requestMinZoom(z) { this._minZoom = max(this._minZoom, z) }`, passed as `minZoom: this._minZoom` and cleared with `_focusAltitude` each frame.

- [ ] **Step 3: Rewrite `Projects.js`** from spec §3.2–3.5: `PADS` → `STANDS = [{ id: 'screening', x: 28, stencil: 'MED BAY · LLM READS SLIPS' }, { id: 'instiapp', x: 46, ... }, { id: 'trading', x: 64, ... }, { id: 'drone', x: 82, ... }]`; `buildStands()` (merged slabs, merged borders, numerals, stencils, boards with `body = [tags.join(' · ')]` at `bodySize 0.34`, pads at z −33); `buildScreening()`, `buildGate()`, `buildTrading()`, `buildDrone()`, `buildRocket()` (static mount + clamp arm groups + gantry + umbilical + the rocket group + the kinematic body), `buildLaunchPad()`; `update()` drives the slips, students/turnstiles/counter, price line/paddle/head, drone figure-eight, rocket sequence with the clamp/umbilical animation, smoke that follows the rocket, and the camera requests (`requestFocusAltitude(min(7.2, rocket.y·0.8))`, `requestMinZoom(1)` while not idle and the car is within 45 m). Every animated lamp uses `lampMaterial().clone()`. Rocket body: `CANNON.Body({ mass: 0, type: KINEMATIC, shape: Cylinder(1, 1, 8, 10) })` at `(96, 4.6, -30)`, `userData { kind: 'wall', tag: 'wall' }`; each frame while not idle `body.velocity.y = (rocket.y - prevY) / dt; body.position.y = 4.6 + rocket.y`; idle → velocity 0. Set `this.drone.name = 'drone'`. Relay beacon on the gantry top via `relayBeacon(world, { x: 100.6, y: 12.3, z: -30, phase: 1.4 })`. `onHorn` per §3.5.

- [ ] **Step 4: Measure the launch** — `npx vite --port 5183 --strictPort &`; copy
`scratchpad/probe/rocket.mjs` with the port, and extend it to project the tip, the parachute top
and the pedestal into NDC at apex and at the first descent frame: all `|x| < 1`, `y` in
`(−0.95, 0.92)`. Open `rocket-1-liftoff.png` and `rocket-2-ascent.png`: pedestal on the ground,
clamps open, flame under the rocket, smoke trailing from the bell, whole rocket in frame. If the
chute clips: parachute centre 9.3 → 8.9, then `ROCKET_APEX` 9 → 8 (spec risk 2). Then `node scripts/check-boards-clear.mjs` and `node scripts/check-boards.mjs` (shorten to two tags if a line overflows).

- [ ] **Step 5: Gates and commit**

```bash
npm run test:unit && node scripts/smoke-sections.mjs --only projects && node scripts/smoke-sections.mjs && node scripts/check-rest.mjs && node scripts/check-boards-clear.mjs && node scripts/check-boards.mjs
node scripts/e2e.mjs --url http://localhost:5183/ --sections projects,projects:90:-30 --out <scratchpad>/t3   # calls ≤ 450 at both
git add -A && git commit -m "Rebuild Projects as four test stands with a sounding rocket that launches from a static mount"
```

---

### Task 4: Per-section recolour and collision pass (worktree `wt-sections`, port 5184)

**Files:**
- Modify: `src/world/props/Hangar.js`, `src/world/sections/Experience.js` (not `buildPlane`), `src/world/sections/Skills.js`, `src/world/sections/Education.js`, `src/world/sections/Contact.js`, `src/world/sections/Playground.js`, `src/world/sections/Crossroads.js`, `src/world/sections/Intro.js`, `src/world/Car.js`, `src/world/props/index.js`, `src/world/sections/registry.js` (`skills.color → palette.steel` only), `scripts/check-solids.mjs` (allow-list), `scripts/unit/props.test.mjs`

- [ ] **Step 1: Recolour** per spec §1.7 table, section by section. Hangars: default colour `habitat`, collar torus (`terracotta`) and cobalt band per hangar merged per material. Car: constructor default `color = palette.rover`, cabin/skirt `ink`, stripe `cream`, tail lamps `clay`. Every hard-coded `'#9C8B63'` / `'#8E8778'` / `'#7a768a'` → `palette.stencil`. Consulting balls `cream`; DevCom instance colours `habitat`/`cobalt`; Skills tanks `habitat` with cobalt bands, ETL hut roof `terracotta`; tower cab `habitat`, roof `ink`, catwalk `steel`; contact building `habitat`; playground per the table; confetti colours; signpost arms `habitat`.

- [ ] **Step 2: Missing bodies** (from `node scripts/check-solids.mjs` on `main`, all `mass 0, sleepy false, kind wall`):
  - `Experience.buildEpik`: box `[3.4, 2.2, 2.2]` at `(-52, 1.1, -45.2)`; cylinder r 0.9 h 1.8 at `(-52, 0.9, -39.2)`. `buildDevCom`: box `[3.2, 2.2, 2]` at `(-76, 1.1, -45.6)`; box `[1.2, 0.7, 1.2]` at `(-79.4, 0.35, -45.4)`. Name the pipe fan group `epik-pipes`.
  - `Skills.buildTanks`: the five `board()` calls get `physics: true`.
  - `Contact.buildTelephone`: box `[1.4, 0.9, 1.0]` at `(9, 0.45, 44)`; name each totem cube `totem-cube`.
  - `Playground.buildRamp`: hoop feet boxes `[0.32, 1.2, 0.32]` at `(84, 0.6, 54 ± 1.6)`. `buildTyres`: one static cylinder per stack, `r 0.85`, height `0.5 + 0.4·stack`, centred on the stack.
  - `Crossroads`: name the signpost group `signpost`.
  - Beacons: `relayBeacon(world, { x: 0, y: 22.0, z: -104, phase: 0 })` in `Education.buildTower`; `relayBeacon(world, { x: -5, y: 10.1, z: 34, phase: 0.7 })` in `Contact.buildBuilding`.
  - `check-solids.mjs`: extend `SKIP_NAMES` with `'mesas', 'drone', 'tanks-ink', 'signpost', 'totem-cube', 'epik-pipes', 'dust-devils', 'pebbles', 'drifts', 'crater-decals', 'kerbs'`.

- [ ] **Step 3: Measure** — `npx vite --port 5184 --strictPort &`; hero shots of hangars, skills, tower, contact, playground: no green, habitat-white shells with cobalt trim, terracotta only as small accents; `node scripts/check-solids.mjs` exits 0 except for the Projects robot and the old clutter (owned by Tasks 2 and 3 — list what remains in the commit message).

- [ ] **Step 4: Gates and commit**

```bash
npm run test:unit && node scripts/smoke-sections.mjs && node scripts/check-rest.mjs && node scripts/check-boards-clear.mjs && node scripts/check-boards.mjs
git add -A && git commit -m "Recolour every section for Mars and give every reachable prop a body"
```

---

### Task 5: Merge, verify, document (on `mars-rework`)

- [ ] **Step 1: Merge** `wt-ambient`, `wt-projects`, `wt-sections`, `wt-plane` in that order (`git merge --no-ff <branch>`); resolve any `World.js` / `Experience.js` conflicts by keeping both sides.

- [ ] **Step 2: Every gate**

```bash
npm run test:unit
node scripts/smoke-sections.mjs && node scripts/check-rest.mjs && node scripts/check-boards-clear.mjs && node scripts/check-boards.mjs && node scripts/check-solids.mjs
node scripts/e2e.mjs && node scripts/e2e.mjs --no-effects && node scripts/e2e-finish.mjs && node scripts/e2e-context.mjs && node scripts/e2e-ui.mjs && node scripts/e2e-ui.mjs --mobile && node scripts/e2e-drive.mjs && node scripts/e2e-fly.mjs && node scripts/e2e-stability.mjs
node scripts/hero.mjs <scratchpad>/final-hero
node <scratchpad>/probe/rocket.mjs <scratchpad>/final-probe
```

Every script exits 0; `e2e.mjs` reports 60 fps and ≤ 450 calls in every section; bodies ≤ 300.
Look at every hero frame and the rocket frames with your own eyes.

- [ ] **Step 3: Docs** — `README.md`: intro paragraph (Mars flight-test range), "The world" table
(Projects row: four numbered test stands, the sounding rocket), the "Between the stations"
paragraph (boulders, drifts, craters, dust devils, dishes, solar rows, rovers), layout tree
(`DustDevils · Dishes · Beacon · PlaneModel · Craters`), tests list (`check-solids`, `plane`,
`rocket`, `dust-devils`, `dishes` tests), performance paragraph (new draw-call and body figures,
no tumbleweeds). `index.html`: meta description / og copy "Drive a rover around a Mars flight-test
range", `theme-color` `#E6B98E`, start-screen hint unchanged. `docs/superpowers/specs/2026-09-05-mars-rework-design.md`:
fold in any number that changed during implementation (lighting, apex, parachute).

- [ ] **Step 4: Commit and merge to main**

```bash
git add -A && git commit -m "Document the Mars range, the test stands and the collision audit"
git checkout main && git merge --no-ff mars-rework
```

---

## Self-review notes

- Spec coverage: §1.1–1.6 → Task 0; §1.7 → Task 4 (hangars, sections, car) and Task 1 (landmark
  plane); §2.1, 2.3–2.8 → Task 2; §2.2 → Task 0 (helper) + Tasks 3/4 (placements); §3 → Task 3;
  §4 → Task 1; §5 → Tasks 2, 3, 4 + the audit in Task 4; §6 risks 1–2 → Task 0 step 12 and Task 3
  step 4, 3 → Task 3 step 4, 4 → Task 3 step 5 and Task 5, 5 → Task 1 step 7, 9 → Task 3 step 3,
  10 → conventions.
- `palette.stencil` is introduced in Task 0 so Task 4 can retire the hard-coded greys without
  touching `Materials.js`.
- `PlanePhysics.gust` is added by Task 2 (one line in `PlanePhysics.js`); Task 1 changes only
  `ceiling` in that file — different lines.
- The solar rows live in `Clutter.js` (Task 2) so neither section task touches them; their bodies
  are counted in Task 2's tests.
