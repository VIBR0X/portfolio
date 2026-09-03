# Section implementation contract

Every section is a class in `src/world/sections/<Name>.js` extending `Section` and built by
`buildSections(world)` in `src/world/sections/index.js` (do not edit the registry; the class names
are fixed: `IntroSection`, `CrossroadsSection`, `ExperienceSection`, `ProjectsSection`,
`SkillsSection`, `EducationSection`, `ContactSection`, `PlaygroundSection`).

```js
import { Section } from './Section.js'
export class IntroSection extends Section {
  constructor(world, def) {
    super(world, def)          // def = { id, short, label, color, centre:[x,z], spawn:[x,z], heading, yaw, aabb:[x0,z0,x1,z1], card }
    // build everything here, synchronously, using the World API below
  }
  update(dt, elapsed) {}      // optional, called every frame
  onEnter() {} onLeave() {}   // optional, when the car crosses the section AABB
  onHorn() {}                 // optional, H key anywhere (check distance yourself)
  openDetails() {}            // optional, the section card's "Details" button
  reset() { super.reset() }   // optional; super restores every body passed to this.track(body) and runs this.onReset(fn) handlers
}
```

## Coordinates
+x east, −x west, **−z north**, +z south, y up. The car spawns at (0,0) facing north (−z); the camera
sits south of the car looking north, so **boards must face +z** (their default) to be readable.
Section centres/AABBs are in `SECTION_DEFS` (from the panel spec §3). Stay inside your AABB.

## World API (`src/world/World.js`)
| Call | Purpose |
|---|---|
| `world.addStatic(object3D, { delay = 0, reveal = true })` | Add decoration/architecture. Registered with the pop-in reveal (objects > 70 m from the origin skip it). No physics. |
| `world.addDynamic(mesh, body, { tag = 'default', impact = true, minImpact = 1.5, shadow = true, shadowRadius = { rx, rz }, delay = 0 })` | A physics prop. Mesh follows the body; the body joins the physics world at reveal time (falling from wherever you placed it). Records `body.userData.home` for resets and adds a blob shadow. `tag` picks the impact sound: `letter, crate, brick, pin, figure, ball, cone, trophy, gate, seesaw, drum, default`. Returns `{ mesh, body }`. |
| `world.physics.add(body)` | Add a **static** body (mass 0) immediately, e.g. walls, hangar sides, slabs. Use `world.physics.box/cylinder/sphere/wall({...})` factories (see below). |
| `world.addArea({ x, z, width = 4.5, depth = 3, label, hint = 'ENTER', color, onInteract(area), onEnter(area), onLeave(area) })` | An Enter pad (ring + floating key cap). `onInteract` fires on Enter/E/tap while the car is inside. Set `area.actionLabel` (e.g. `'OPEN'`, `'OPEN ↗'`) for the touch button text. |
| `world.addUpdatable(obj)` / `world.removeUpdatable(obj)` | Per-frame `obj.update(dt, elapsed)`. |
| `world.resetBodies(bodies)` | Glide bodies back to their `userData.home` pose (used by `Section.reset()` and `RedButton`). |
| `world.car.physics.position` / `.velocity` / `.speed` / `.grounded` / `.vehicle.wheelInfos[i].isInContact` | Car state for proximity gags, airtime, etc. |
| `world.ui.togglePanel(entryId)` | Open/close the detail panel for a résumé entry: `tark, epik, consulting, devcom, screening, instiapp, trading, drone, skills, education, contact, about`. **Panels are already written** in `src/ui/UI.js`; do not duplicate their text. |
| `world.ui.toast(text, ms)` · `world.ui.setChip(id, text|null)` · `world.ui.showModal('map')` | HUD helpers. |
| `world.sounds.hit(strength, f0)`, `.blip(f)`, `.ding()`, `.arpeggio()`, `.boop()`, `.resetRun()`, `.whoosh()`, `.horn()`, `.click()` | Synth sounds. All no-ops before START. |
| `world.experience.isTouch` / `.quality` (`'high'|'low'`) | Device hints; halve optional prop counts on `'low'`. |
| `world.sectionAt(x, z)` | Section containing a point. |

Physics factories (`src/core/Physics.js`, all return a `CANNON.Body` positioned at `position`, with `updateAABB()` already called):
`physics.box({ size:[w,h,d], mass, position:[x,y,z], quaternion?, sleepy=true })`,
`physics.cylinder({ radiusTop, radiusBottom, height, segments, mass, position })`,
`physics.sphere({ radius, mass, position })`, `physics.wall({ size, position })` (static).
`import { CANNON } from '../../core/Physics.js'` for constraints (`CANNON.HingeConstraint`, `CANNON.Body.KINEMATIC`).
If you set `position`/`quaternion` on a **static** body after creating it, call `body.updateAABB()` (cannon-es caches AABBs at construction).

## Building blocks
- Materials: `import { flat, palette, lampMaterial, decal, vary } from '../Materials.js'`. `flat(hex, { emissive, emissiveIntensity, transparent, opacity, side })` returns a cached toon material. Palette names: `dune, tarmac, haze, terracotta, clay, cobalt, sage, sageDark, cream, ink, concrete, glass, lamp, mesa, shadow, lavender`.
- Text: `import { textMesh, boardMesh, labelMesh, floorLabel, makeBoardTexture, makeLabelTexture } from '../Text.js'`.
  `textMesh('VEDANT', { size, depth, color })` → extruded letters (bounding box in `mesh.userData.size`, resting on y=0, centred in x/z).
  `labelMesh(text, { width, height, color, fontSize, weight, background })` → plane with crisp text, faces +z.
  `floorLabel(text, { width, height, color })` → the same lying flat on the ground (y=0.02).
- Boards: `import { board } from '../Board.js'` → `board(world, { x, z, yaw = 0, width, height, bottom, title, subtitle, body: [..], footer, accent, align })` builds posts + panel + tilted face + static body and adds it to the world. Returns `{ group, body, texture, face }`.
- Shared props: `import { tree, bush, rock, trafficCone, crate, signpost, pathStrip, slab, lampPost } from '../props/index.js'`. `trafficCone(physics, { position })` and `crate(physics, { size, position, label, color, mass })` return `{ mesh, body }` for `world.addDynamic`.
- Red button: `import { RedButton, resetBodies } from '../props/RedButton.js'` → `new RedButton(world, { x, z, bodies, onReset })`; call `button.setBodies(bodies)` after creating dynamic props.
- Reveal easing: `import { easeOutBack } from '../Reveal.js'`.
- Three helpers: `RoundedBoxGeometry` from `three/examples/jsm/geometries/RoundedBoxGeometry.js`, `mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js` (merge static same-material geometry to save draw calls).

## Rules
- Only primitives + `TextGeometry` + `CanvasTexture`; no textures/models from disk, no network.
- Résumé text must be **verbatim** from `src/content/resume.js` (import it; never retype sentences).
- Keep each section under ~35 draw calls (count meshes + instanced meshes you add; merge static geometry, use `InstancedMesh` for repeated dynamic props with `instanceMatrix` updated from bodies in `update`).
- All dynamic bodies: `mass > 0`, `allowSleep` (factories do this), placed ≥ 3 mm apart in stacks.
- Every solid static body ≥ 0.3 m thick (the car reaches 30 m/s).
- No `setTimeout` for game logic; use `update(dt)`. No globals; no DOM except through `world.ui`.
- Register bodies you want restored with `this.track(body)`; call `this.disturbed = true` isn't needed (impacts do it).
- Run `node scripts/smoke-sections.mjs --text "<a verbatim phrase you placed>"` until it exits 0: it builds the world with your section, drives through it, presses every pad, resets, and checks the text is on a texture.
- Files you may create: `src/world/sections/<Name>.js` and `src/world/props/<yourPropName>.js` (new files only; never edit shared files).
