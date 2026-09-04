# Scene finish: real-time lighting, shadows, textured ground (2026-09-04)

Amends `2026-09-03-portfolio-design.md`. The adopted look was flat toon shading, blob shadows only,
a single-colour sand plane and no image data of any kind. It reads as unfinished next to
bruno-simon.com, which this site is modelled on. This spec replaces the rendering rules; the world
layout, sections, props, physics, UI and content are unchanged.

## Decisions taken with the owner

- Reference: bruno-simon.com's tactile finish. In scope: ground, lighting, shadows, materials.
  Out of scope: the 2D UI and typography.
- The "no image files, no shadow maps, toon only" rule is dropped. Textures must still be
  **generated in code** (no image files enter the repo), so the README's "no image files" claim
  stays true.
- Desktop first; phones get the same art direction with cheaper settings.
- Props: **materials and lighting only.** No prop or car geometry is rebuilt in this pass.
- Approach: real-time lighting, tiered (chosen over bake-at-load and refined-toon).
- Ambient occlusion runs on phones too; auto-quality removes it if the device is slow.

## 1. Lighting, shadows and materials

### Lights (`src/core/Experience.js`)
- **Sun**: one `DirectionalLight`, warm white, direction kept close to the current `(1, 2, 1)`
  so shadows fall north-west: beside and behind props, never across the pads in front of boards.
  Intensity retuned for lit materials (start ~2.2, tune by screenshot).
- **Fill**: `HemisphereLight`, haze sky colour over a sand ground colour, intensity ~0.9.
- **Environment**: `scene.environment` from `PMREMGenerator.fromScene()` on a tiny procedural
  scene built in `Textures.js`: an inverted sphere with a vertical gradient (warm haze at the
  horizon, pale blue-lilac at the zenith) and a bright disc where the sun is. Generated once at
  boot; the generator and the source scene are disposed, the resulting texture is kept. Materials use `envMapIntensity` ~0.5.
- **Tone mapping**: stays **off** (`NoToneMapping`). Light intensities are budgeted so a fully lit
  white surface lands at ~1.0 without clipping (sun 1.2, hemisphere 1.0, env intensity 0.4 as
  starting values; three divides light intensities by π in the shader). Reason: any curve would
  shift fogged geometry away from the sky gradient and produce a seam at the floor edge, and the
  palette must stay exact. Boards, decals, labels and blob discs keep `toneMapped: false`.

### Shadow map
- `renderer.shadowMap.enabled = true`, `PCFSoftShadowMap` on desktop, `PCFShadowMap` on phones.
- `sun.castShadow = true`; map size 2048 (desktop) / 1024 (phones); `bias` ~-0.0004,
  `normalBias` ~0.03; start values, tuned until the sand shows no acne and boards show no
  peter-panning at their posts.
- **Follow**: a small pure class `ShadowFollow` (`src/core/ShadowFollow.js`, unit-testable in
  Node) owns the sun's target, position and frustum. Each frame `World.update` calls
  `experience.shadowFollow?.aim(focus, zoom)` with the camera's smoothed focus point and current
  zoom. The sun target is the focus; the sun sits at `focus + dir * 90`. The orthographic frustum
  half-size is `26 * zoom + 14` (covers the visible ground at every zoom from 0.55 to 1.9);
  `near`/`far` cover 1 to 220. The target is snapped to the shadow texel grid in light space so
  panning does not shimmer.
- **Flags**: `World.addStatic` and `World.addDynamic` traverse the object and set
  `castShadow = receiveShadow = true` on every `Mesh` and `InstancedMesh`, except:
  - materials with `transparent && !depthWrite` (decals, labels): neither cast nor receive;
  - transparent glazing (`opacity < 1`, depthWrite on): receive only;
  - the floor and hills: floor receives only, hills cast and receive.
  `Car` sets the same flags on its own meshes and wheels. `InstancedProps` meshes cast and receive.
  The blob-shadow `InstancedMesh` does neither.
- `shadowed(mesh)` in `Materials.js` becomes real (sets both flags) so its 18 existing call sites
  keep working; it is no longer required, the traversal covers everything.

### Materials (`src/world/Materials.js`)
- `flat(color, opts)` keeps its name and signature and returns a **`MeshStandardMaterial`**:
  `roughness: opts.roughness ?? 0.85`, `metalness: 0`, `envMapIntensity: 0.5`,
  `flatShading: true`, plus the existing `emissive`, `emissiveIntensity`, `transparent`,
  `opacity`, `side`, `vertexColors` options. New options: `roughness`, `map`, `aoMap`,
  `aoMapIntensity`. The cache key includes every option so materials are still shared.
- `toonGradient()` is deleted. `decal()`, `lampMaterial()`, `vary()` are unchanged.
- Roughness overrides at existing call sites only: car body and roof 0.55, board panels 0.9,
  tower glazing 0.2. Emissive intensities are tuned by screenshot if lamps wash out.
- Flat shading is kept everywhere in this pass; if faceted cylinders (tanks, tower) look wrong in
  review, the follow-up is a `smooth: true` option, not a geometry change.

### Blob shadows (`src/world/Shadows.js`)
- Constructor takes `strength` (peak alpha). Desktop 0.16, phones 0.30 (current 0.34).
- Everything else unchanged: dynamic bodies and the car keep a contact disc that fades with height.

## 2. Ground, roads and sky

All textures are `DataTexture`s built from `Uint8Array`s in **`src/world/Textures.js`** (new).
No canvas is used, so the module runs unchanged under the Node smoke harness.

- **Sand grain** (`sandGrain()`): 1024×1024 RGB, three octaves of seeded value noise plus fine
  speckle, colours lerped between Dune `#E9D4A6` and a warmer darker shade `#DCC08F`.
  `RepeatWrapping`, repeat = world size / 24 m, `anisotropy` 8, sRGB. One shared instance.
- **Wear map** (`wearMap(extents)`): 512×512 single-channel (stored RGB), covering the floor
  rectangle once. Low-frequency noise gives ±4 % blotching; each section apron (rectangles from
  `Roads.js`, which exports its rectangle list as `ROAD_RECTS`) and the runway get soft box darkening of 6-10 %; the roads' own margins get a
  1 m feather so the tarmac edge does not look cut out. Used as `aoMap` with `texture.channel = 0`
  so it reads the primary UVs.
- **Floor** (`World.setFloor`): same `PlaneGeometry`, material `flat('#FFFFFF', { map: sandGrain,
  aoMap: wearMap, aoMapIntensity: 1, roughness: 1 })`. The base colour is white because a standard
  material multiplies colour by map; the grain texture already carries the dune colour. The plane's
  UVs already span 0..1, so the wear map fits once and the grain repeats via its own transform.
- **Roads** (`Roads.js`): after `mergeGeometries`, rewrite `uv` from vertex position:
  `u = (x - x0) / W`, `v = (z - z0) / D` using the floor rectangle, so the tarmac shares the wear
  map with the same world mapping. Tarmac material: `flat(palette.tarmac, { map: tarmacGrain,
  aoMap: wearMap, roughness: 1 })` where `tarmacGrain` is a finer, darker 512² grain repeated
  every 12 m (base colour white for the same reason as the floor). Cream markings, pad rings,
  labels and decals are unchanged.
- **Sky**: `scene.background` becomes a 1×64 RGB `DataTexture` vertical gradient (haze at the
  bottom to `#C9D6E3` at the top), which three.js stretches across the screen. Fog keeps the haze
  colour so the ground meets the horizon band seamlessly. Fog distances unchanged.
- **Hills**: unchanged geometry; they now get lit, cast and receive.

## 3. Ambient occlusion, quality tiers, integration

### Composer (`Experience.js`)
- `EffectComposer` over a `WebGLRenderTarget` with `samples: 4` and `HalfFloatType` so MSAA is
  kept; passes: `RenderPass`, `GTAOPass`, `OutputPass`.
- The AO pass runs its own buffers at **half** the drawing-buffer size (its `setSize` is wrapped
  to halve what the composer hands it) and blends at full size. Its render is wrapped to clear
  `scene.background` while it draws its own normal and depth buffers, so the sky never lands in them. Parameters to start:
  `radius 0.6, distanceExponent 1, thickness 1, scale 1.5, samples 16, blendIntensity 0.9`,
  output mode Default (denoised). Tuned until it reads as contact darkening, not grey haze.
- When effects are off the frame renders directly with `renderer.render`, exactly as today.

### Tiers
Device tier is decided once at boot; the auto-quality sampler then demotes in two steps.

| | high (desktop, fine pointer) | low (touch or width < 768) |
| --- | --- | --- |
| pixel ratio | ≤ 2 | ≤ 1.5 |
| shadow map | 2048, PCF soft | 1024, PCF |
| AO pass | on, half res | on, half res |
| blob strength | 0.16 | 0.30 |
| existing per-section counts | high values | low values (unchanged) |

Auto-quality (`sampleQuality`, unchanged trigger: 3 s window after a 2.5 s delay post-reveal):
1. average frame > 18 ms → **AO off** (composer bypassed), re-sample for another 3 s;
2. still > 22 ms → **pixel ratio 1, shadow map 1024, fog 60-110** (the existing low switch).
Never re-raised. `experience.quality` keeps its `'high' | 'low'` meaning for the sections;
the new flags are `experience.effects` (AO on/off) and the existing `lowQuality`.

### Integration map
| File | Change |
| --- | --- |
| `src/core/Experience.js` | lights, environment, shadow settings, composer, tiers, resize, two-step sampler, `rendered` event, `readPixel()` for tests |
| `src/core/ShadowFollow.js` (new) | sun target/position/frustum from camera focus and zoom, texel snapping |
| `src/world/Materials.js` | `flat()` → standard material with new options; real `shadowed()`; drop `toonGradient()` |
| `src/world/Textures.js` (new) | `sandGrain()`, `tarmacGrain()`, `wearMap()`, `skyGradient()`, `environmentScene()` |
| `src/world/World.js` | shadow flags in `addStatic`/`addDynamic`, new floor, hills flags, call `shadowFollow.aim` each frame |
| `src/world/Roads.js` | planar UVs after merge, textured tarmac |
| `src/world/Car.js` | shadow flags, roughness overrides |
| `src/world/Board.js`, `sections/Education.js` | roughness overrides (panel, glazing) |
| `src/world/Shadows.js` | `strength` option |
| `scripts/smoke-sections.mjs` | fake experience gains `sun`, `aimSun()`, `effects` |
| `scripts/e2e.mjs` | `--no-effects` flag (the existing `--mobile` is the low tier); report effects state per section |
| `scripts/e2e-finish.mjs` (new) | pixel checks: lit sand colour, shadow ratio, board cream, no acne |
| `scripts/unit/*.test.mjs` (new) | `node --test` suites for Textures, Materials, ShadowFollow, World flags, Roads UVs |
| `docs/…/2026-09-03-portfolio-design.md`, `README.md` | note the new rendering rules |

Every new call from `World` into `Experience` is optional-chained so the smoke harness's fake
experience and any future headless use keep working.

## Testing and acceptance
- `node --test scripts/unit/*.test.mjs` passes (pure-Node coverage of textures, materials, shadow
  flags, sun follow, road UVs).
- `node scripts/smoke-sections.mjs` passes unchanged.
- `node scripts/e2e.mjs` reports no errors and 60 fps at every section on the high tier;
  `--tier low` and `--no-effects` runs also pass, so all three render paths are exercised.
- `node scripts/e2e-finish.mjs` reads pixels from the live frame (via `Experience.readPixel`
  inside a `rendered` listener): the mean of 25 lit open-sand samples within ±16/channel of the grain's
  mean colour, sand inside the tower's
  shadow at 50–80 % of lit brightness, a board face within ±6 of Cream, and a 5×5 grid on open
  sand whose darkest sample is ≥ 82 % of its brightest (acne guard).
- Screenshot review of every section at zoom 1 and zoom 1.9: no acne on sand, no shimmer while
  panning (two frames 0.5 m apart compared by eye), shadows reach the frame edge at max zoom,
  AO visible only at contacts.
- Draw calls stay within ~120 per section (current peak is 117 at Experience) (composer adds none to the scene; the AO pass adds
  its own fixed passes).
- Desktop budget: render ≤ 8 ms at 1080p, dpr 2 on an integrated GPU, measured with `?debug`
  which gains a frame-time readout. Phones: the sampler is the guard.

## Risks and fallbacks
- **AO too expensive on integrated GPUs**: step 1 of the sampler removes it; if it is removed on
  most laptops in practice, drop the AO buffers to quarter resolution before removing the pass.
- **Standard material changes the palette feel**: lighting intensities and `envMapIntensity` are
  the tuning knobs; if pastels still look muddy, `MeshLambertMaterial` with the same env map is a
  one-line fallback inside `flat()`.
- **Faceted highlights on curved props**: add a `smooth` option and use it on tanks, domes and
  spheres; no geometry change.
- **Shadow frustum edge visible at max zoom**: raise the half-size multiplier; cost is texel
  density, not draw calls.

## Implemented

Where the built result deviates from the spec above.

- **Environment intensity** is applied once through `scene.environmentIntensity` at 0.55, not per
  material at 0.4: a standard material's own `envMapIntensity` is overwritten by the renderer
  whenever the scene has an environment and the material carries no `envMap` of its own.
- **Shadow filter** is `PCFShadowMap` on both tiers. `PCFSoftShadowMap` is deprecated in three
  0.185.1 and silently downgrades, and `VSMShadowMap` was rejected because it forces every
  receiver to also cast.
- **`applyShadowFlags` gained an unlit rule**: a `MeshBasicMaterial` mesh neither casts nor
  receives, because that shader has no shadow code and the printed board faces and counter signs
  would otherwise cast solid rectangles.
- **`fitGrain` returns a per-surface clone** rather than mutating the shared grain singleton, so
  each surface gets its own `repeat` without disturbing the others.
- **`ShadowFollow` snaps light-space x and y only**: an orthographic shadow camera cannot shimmer
  from motion along its own view axis, so snapping z would be wasted work.
- **The draw-call figure counts every pass in a frame.** `Experience` sets
  `renderer.info.autoReset = false` and resets once per frame, so `calls` covers the shadow pass,
  the main render, the AO pass's own re-render for depth and normals and the fullscreen post
  quads. It reads 258-514 on the high tier and is not comparable to the "~120 per section" figure
  in the testing section above, which counted the main scene render alone.
- **The shadow-ratio check measures linear light, not sRGB bytes.** "Shadow at 50-80 % of lit
  brightness" is unsatisfiable as an sRGB-byte ratio alongside this spec's own light budget:
  sun 1.2 / hemi 0.9 / env 0.4 measures 0.812 on bytes, and the sun intensity needed to reach
  0.80 clips lit sand and fails the sand-colour check in the same script. Decoded to linear
  light the shipped build reads 0.679, inside the band and inside the "shadowed sand = 60-70 %
  of lit" budget documented on `LIGHTING` in `Experience.js`.
- **No `--tier` flag was built.** The low tier is reached with the existing `--mobile` flag on
  `scripts/e2e.mjs`, which sets a phone viewport and touch; the tier is decided from those.
