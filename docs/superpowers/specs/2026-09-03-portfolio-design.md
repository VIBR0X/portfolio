# Vedant Thakre portfolio — adopted design (2026-09-03)

Companion to `2026-09-03-portfolio-panel-spec.md` (the judged three-proposal synthesis, "Proving Ground").
This file records what is actually being built and where it deviates from the panel spec.

## Assumptions (autonomous session; no user answers were available)
- Stack: Vite 8 + three 0.185 + cannon-es 0.20, vanilla ES modules, no framework.
- No external 3D/image assets. Geometry is primitives + TextGeometry (helvetiker_bold JSON, bundled under `public/fonts`), text via CanvasTexture, audio synthesised with Web Audio.
- Deploy target: Cloudflare Pages (same as the sibling `tark-site`); `npm run deploy` wraps `wrangler pages deploy dist`. Deploying is a manual step for the owner.
- Content is the résumé verbatim, held in `src/content/resume.js`.

## What is adopted from the panel spec
- Concept, tone, palette, toon-shaded no-shadow-map look with blob shadows (§1–2).
- World layout, section centres, spawns, headings, AABBs, roads, boundary walls + hill ring (§3).
- Section content and verbatim text mapping (§4), the car look and feel (§5), Enter pads (§6),
  loading → START → swoop + pop-in reveal with physics letters (§7), DOM UI incl. top bar, section
  label, detail panel with prev/next, map/teleport, number keys, text résumé, touch controls (§8),
  synthesised sounds with per-material impact pitch (§9), performance rules and mobile degradation (§11),
  build order and cut list (§13).

## Deviations (deliberate)
- **Rendering (superseded 2026-09-04)**: the toon/blob-only look was replaced by lit standard
  materials, a following shadow map, generated ground textures, a sky gradient and GTAO. See
  `2026-09-04-scene-finish-design.md`. "No image files" now means "generated in code". The
  ≤ 150 draw-call targets below (Materials, and Acceptance) no longer apply either:
  `renderer.info` is now read once per frame across every pass, which reads 258-514 on the high
  tier and 412 right after the reveal.
- **Materials**: `MeshToonMaterial` + 3-step gradient as specified, but colours are per-material (cached by colour), not one vertex-coloured merged mesh per colour group. Static merging is applied opportunistically (hills, roads, pipes) rather than as a global ledger. Target stays ≤ ~150 draw calls.
- **Text atlas**: not built. Small labels are individual CanvasTexture planes. Simpler, and within budget for this scene size.
- **Pads**: the existing `Area` class (ring + floating key cap, per-pad meshes) instead of one InstancedMesh of pads.
- **Car tuning**: engine/brake values come from the Node physics test (`scripts/`), not the spec's numbers; the feel targets are the same (≈9.5 m/s² launch, 19 m/s top, 30 m/s boost, ~2 m jump).
- **Résumé HTML**: rendered at runtime from `resume.js` into `<section id="resume">` *and* injected at build time by a small Vite plugin so the built `index.html` carries the full text for crawlers.
- **Gamepad**: included (small). **Auto-quality**: simple frame-time sampler that drops pixel ratio; no effect toggles.
- **Cut from the bottom of §13 as needed**: robot/candles → windsock → dish/radar animation → trophy physics → drone follow → crates → OTAM ring → Epik flow → corral → see-saw → hoop/airtime.

## Module map (actual)
```
src/core/    Experience (renderer, loop, lights) · Camera (follow/swoop/nudge) · Physics (cannon wrapper, AABB fix) ·
             Controls (keyboard/touch/gamepad) · Sounds (Web Audio) · EventEmitter
src/world/   World (assembly + loop) · Car + CarPhysics · Area (pads) · Reveal · Shadows (blob pool) · Materials ·
             Text (TextGeometry + canvas boards/labels) · Board (posted, tilted board + body) ·
             props/ (shared primitives, RedButton, …) · sections/ (Section base, registry, 8 sections)
src/ui/      UI (start, top bar, panel, map, help, résumé, chips, toasts, section label)
src/content/ resume.js
scripts/     car-physics test, section smoke harness (Node), e2e (headless Chrome)
```

## Acceptance (subset used for sign-off)
- Build passes; no console errors on load, start, and a drive through every section.
- Every section's boards/panels show the résumé text verbatim; contact pads open links.
- Draw calls ≤ ~150 after reveal; 60 fps in headless Chrome with GPU.
- Keyboard + touch controls work; text résumé reachable without WebGL.
