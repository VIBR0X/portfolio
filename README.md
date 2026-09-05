# Vedant Thakre — drivable portfolio

An interactive 3D resume: you drive a little car around a desert flight-test range where each
station is part of the CV — and when you find the plane parked beside Runway 00, you can fly it.
Deeply inspired by [bruno-simon.com](https://bruno-simon.com).

Everything in the scene is generated at runtime: Three.js primitives, extruded text, canvas
textures for words, and noise textures for the sand, tarmac and sky. Lighting is a shadow-mapped
sun whose frustum follows the camera, a prefiltered environment map built from a generated dome,
and a half-resolution ambient-occlusion pass. Behind the fog sits a generated sky gradient, which
the fixed camera angle rarely brings into view. There are no 3D models, no image files and no
audio files in the repository.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
npm run preview    # serve the built site on :4173
```

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrows | Drive |
| `Shift` | Boost |
| `Ctrl` / `B` | Brake |
| `Space` | Jump |
| `Enter` / `E` | Open whatever you are parked on, or board the plane on its FLY pad |
| `H` | Horn (several things react to it) |
| `M` | Map and teleport |
| `1`–`8` | Teleport straight to a section |
| `T` | Text resume |
| `R` | Reset this section's props, or respawn |
| `L` | Mute |
| `C` / `?` | Controls |
| Scroll / pinch | Zoom |

While flying, the same keys mean different things: `W`/`S` climb and dive, `A`/`D` bank into a
turn, `Shift` boosts, `Ctrl`/`B` brakes during the ground roll, and `Enter` lands you and hops you
out (press it while still rolling and the plane brakes to a stop first). Sky rings appear only
while you are airborne — fly them in order for a timed lap, and your touchdown gets graded.

Touch devices get a joystick plus BOOST, JUMP and HORN buttons. Gamepads work too
(left stick steers, triggers drive, A jumps).

Add `?debug` to the URL for a frame-rate, draw-call and body-count overlay.

## The world

| Section | Where | What is there |
| --- | --- | --- |
| Intro | `(0, 0)` | The name in twelve knockable letters on Runway 00, the summary board, and the plane on its hardstand |
| Crossroads | `(0, -30)` | Six-armed signpost, map pad |
| Experience | `(-60, -30)` | Four drive-in hangars: Tark's confidence gate, Epik's pipelines, the consulting deal corral, DevCom's 21 developers |
| Projects | `(60, -30)` | Four launch pads; the drone leaves its pad and follows you |
| Skills | `(0, -70)` | Five labelled tanks with data flowing down the pipes, and cargo to knock over |
| Education | `(0, -100)` | Control tower, coursework rack, hackathon trophy under confetti |
| Playground | `(52, 40)` | Bowling, a brick wall, a timed cone slalom, a ramp and hoop, a see-saw |
| Contact | `(0, 44)` | Ground Control: email, LinkedIn, GitHub and the PDF, each on its own pad |

Axes: `+x` east, `-z` north, `y` up. The camera never rotates, so every board faces `+z`.

Between the stations the regolith is dressed with boulders (two on every crater rim, the biggest
with bodies), ankle-high pebbles, wind drifts, cable barriers, parked Mars rovers and solar rows;
dust devils wander the open ground and hop the car if you drive through one (they nudge the plane's
bank too), and deep-space dishes slew slowly on the hill ring with a lamp blinking on each mast.
The rocket at the east end of the launch pads has a LAUNCH pad that really does fly it, with a
countdown, smoke, and a parachute back onto its clamps.

## Layout

```
src/core/     Experience (renderer, loop, lights) · Camera · Physics (cannon-es wrapper)
              Controls (keyboard, touch, gamepad) · Sounds (Web Audio) · EventEmitter
src/world/    World (assembly and frame loop) · Car + CarPhysics · Plane + PlanePhysics
              Area (pads) · Board · Reveal (pop-in) · Shadows (blob pool) · Particles · SkidMarks
              Clutter (ground dressing) · Storage · Materials · Text · Roads
              props/    shared primitives, red buttons, hangars, instanced crowds, counters
                        AirRace (sky rings) · DustDevils · Dishes · Beacon
              sections/ registry + one module per section
src/ui/       UI (start screen, top bar, panel, map, help, text resume) · DebugHud
src/content/  resume.js is the single source of every word on the site
scripts/      smoke-sections, check-*, unit/ (Node) · e2e, e2e-finish, e2e-context, e2e-ui, e2e-drive,
              e2e-fly (headless Chrome)
docs/         the design spec this was built from
```

`src/content/resume.js` feeds the 3D boards, the detail panels and the text resume, and a Vite
plugin renders it into `index.html` at build time so the shipped page carries the full CV as
crawlable text even before any JavaScript runs.

## Tests

Headless, in Node (no browser needed):

```bash
npm run test:unit                               # node:test suites: textures, materials, shadow flags, sun follow, road UVs,
                                                #   flight model, particles, air race, clutter scatter, rocket/tumbleweed/birds/turbines
node scripts/smoke-sections.mjs                 # builds the whole world, drives it, presses every pad and clickable
node scripts/smoke-sections.mjs --only skills   # one section in isolation
node scripts/smoke-sections.mjs --text "2.3M"   # assert a phrase is actually on a texture
node scripts/check-rest.mjs                     # settle everything, assert each prop rests on its support
node scripts/check-boards-clear.mjs             # raycast from every board to the camera, assert nothing blocks it
node scripts/check-boards.mjs                   # assert no board text overflows its canvas
```

In headless Chrome (needs `npx vite --port 5179` running):

```bash
node scripts/e2e.mjs                # fps, draw calls and a screenshot per section
node scripts/e2e.mjs --no-effects   # same, with the AO pass off (the auto-quality fallback path)
node scripts/e2e-finish.mjs         # reads pixels: lit sand colour, shadow ratio, board cream, no acne
node scripts/e2e-context.mjs        # loses and restores the GL context, asserts the scene comes back as bright
node scripts/e2e-ui.mjs [--mobile]  # panels, map, resume, click-to-open, touch controls
node scripts/e2e-drive.mjs          # really drives: knocks the name over, resets, uses a pad, jumps
node scripts/e2e-fly.mjs            # really flies: boards, takes off, climbs, banks, lands, hops out
node scripts/e2e-stability.mjs      # idle drift, tab switch, wall tunnelling, reduced motion, memory
node scripts/hero.mjs <dir>         # framed screenshots of each area
```

## Deploy

Static output, so anything that serves files will do. For Cloudflare Pages:

```bash
wrangler login
wrangler pages project create vedant-portfolio
./deploy.sh                # production
./deploy.sh --preview      # preview branch
```

`public/_headers` sets immutable caching for hashed assets and the font.

## Performance

60 fps at 1080p, measured in headless Chrome on a laptop RTX 3060 across every section with the
full effect chain on. Draw calls run 228 to 445 per frame on the high tier. That number counts
every pass in the frame — the shadow map, the main render, the ambient-occlusion pass's own
re-render of the scene for depth and normals, and the fullscreen post quads — so it is not
comparable to a figure that counts the main scene render alone. With the AO pass off (the
auto-quality fallback path) the same sweep runs 154 to 295. The shadow map is rasterised once per
frame rather than once per render: `autoUpdate` is off and the frame loop raises `needsUpdate`, so
the AO pass reuses the map the main render built instead of rebuilding it from identical inputs.

246 physics bodies. All sleep at rest except the tumbleweeds, which the wind keeps rolling; they
are put to sleep beyond 90 m from the camera. The plane is a kinematic body driven by its own
flight model, because cannon-es caps friction per contact point and a force-driven plane would not
roll at all — the same reason its crashes into scenery are found with a manual AABB sweep rather
than contact events, which kinematic bodies never raise against static ones.

Desktop renders a 2048 shadow map and a half-resolution ambient-occlusion pass; touch devices get
a 1024 map, pixel ratio 1.5 and nearer fog. After the reveal the frame time is sampled for three
seconds: above 18 ms the AO pass is dropped, and if the re-sample is still above 22 ms the pixel
ratio falls to 1 and the shadow map to 1024. Neither is ever raised again.

Frame-rate readings on a loaded laptop vary by several fps run to run for an identical scene, so
treat a single low sample as noise and re-measure before optimising against it.
