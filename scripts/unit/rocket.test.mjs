import test from 'node:test'
import assert from 'node:assert/strict'
import '../dom-stub.mjs'
import { rocketStep, ROCKET_APEX } from '../../src/world/sections/rocketLaunch.js'
import { descentDrift, STANDS, BOARD } from '../../src/world/sections/Projects.js'
import { Counter } from '../../src/world/props/Counter.js'

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

test('the cooldown ticks down while idle and stops at zero', () => {
  let s = { state: 'idle', t: 0, y: 0, cooldown: 1 }
  s = rocketStep(s, 0.5)
  assert.equal(s.cooldown, 0.5)
  s = rocketStep(s, 2)
  assert.equal(s.cooldown, 0)
})

/*
 * The descent path. Measured on 2026-09-06 in headless Chrome: with the old eastward wobble
 * (`96 + 1.2·sin(0.8t)`) the +x fin, which reaches 1.75 m out from the axis, was inside the gantry's
 * 7 m and 3.5 m walkways for 74 of the flight's frames, and the rocket was 0.43 m off centre when
 * y hit 0, so `recoverRocket()` snapped it onto the pedestal. Both are zero with `descentDrift`.
 */
const PAD_X = 96
const FIN_REACH = 1.75 // fin box local x 0.75..1.75, so the +x fin tip is group.x + 1.75
const WALKWAY_WEST_END = 98.4 // BoxGeometry(2.1, 0.12, 0.6) at x 99.45
const FIN_HALF_SPAN = 1.75 // the -x fin reaches the same distance the other way

/** Samples the whole descent at 1/120 s from the apex, as the frame loop does. */
function descent() {
  const path = []
  let y = ROCKET_APEX
  let t = 0
  const dt = 1 / 120
  while (y > 0) {
    path.push({ t, y, x: PAD_X + descentDrift(t, y) })
    t += dt
    y -= 2.6 * dt
  }
  path.push({ t, y: 0, x: PAD_X + descentDrift(t, 0) })
  return path
}

test('the descent never swings the +x fin into the gantry walkways', () => {
  let worst = -Infinity
  for (const p of descent()) worst = Math.max(worst, p.x + FIN_REACH)
  assert.ok(worst < WALKWAY_WEST_END, `+x fin reaches ${worst.toFixed(3)}, walkways start at ${WALKWAY_WEST_END}`)
})

test('the descent stays over the pad: no fin swings further than 1.2 m off the axis', () => {
  for (const p of descent()) {
    assert.ok(Math.abs(p.x - PAD_X) <= 1.2 + 1e-9, `drifted to ${p.x.toFixed(3)}`)
    assert.ok(p.x - FIN_HALF_SPAN > 93, `-x fin reaches ${(p.x - FIN_HALF_SPAN).toFixed(3)}`)
  }
})

test('the rocket lands centred, so recovery confirms the position instead of teleporting it', () => {
  const path = descent()
  const last = path[path.length - 2] // the last frame that is still airborne
  assert.ok(Math.abs(last.x - PAD_X) < 0.02, `${Math.abs(last.x - PAD_X).toFixed(3)} m off centre at y ${last.y.toFixed(3)}`)
  assert.equal(Math.abs(descentDrift(3.5, 0)), 0)
})

test('the drift is full-amplitude high up, so the fall still reads as a drifting parachute', () => {
  assert.ok(Math.abs(descentDrift(Math.PI / 1.6, 9)) > 1.19) // sin(0.8t) = 1 at t = pi/1.6
})

/*
 * Projects board and counter layout. Neither defect below was visible to `check-boards.mjs`, which
 * only asks whether a text run overflows its canvas horizontally.
 */

/** The number of subtitle lines `makeBoardTexture` would lay out on a stand board. */
function subtitleLines(text) {
  const ppu = 96
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = `600 ${BOARD.bodySize * 1.05 * ppu}px sans-serif`
  const maxW = (BOARD.width - 0.35 * 2) * ppu // `padding` defaults to 0.35 m on each side
  let lines = 1
  let line = ''
  for (const word of String(text).split(/\s+/)) {
    const t = line ? `${line} ${word}` : word
    if (ctx.measureText(t).width > maxW && line) { lines++; line = word } else line = t
  }
  return lines
}

test('every stand board subtitle fits one line, so all four boards lay out alike', () => {
  for (const stand of STANDS) {
    const subtitle = stand.sub || stand.stencil
    assert.equal(subtitleLines(subtitle), 1, `"${subtitle}" wraps; a second line pushes the tag line onto the corner marks`)
  }
  // The long ground stencils stay long — only the board subtitle is shortened.
  assert.equal(STANDS[1].stencil, 'CAMPUS GATE · 5,000 STUDENTS A DAY')
  assert.ok(subtitleLines(STANDS[1].stencil) > 1, 'the stencil is the string that used to wrap on the board')
})

test('the gate counter draws at its full type size instead of shrinking to a smudge', () => {
  const big = new Counter({ width: 4.4, height: 1.1, fontSize: 0.5 })
  big.set('5,000+ TODAY')
  assert.equal(big.drawnSize, 0.5, `shrunk to ${big.drawnSize} m`)
  // The old counter: 21 characters on a 3.2 m plane at 0.3 m shrank to fit and rendered ~6 px tall.
  const old = new Counter({ width: 3.2, height: 0.8, fontSize: 0.3 })
  old.set('5,000+ STUDENTS TODAY')
  assert.ok(old.drawnSize < 0.3 * 0.9, `the old counter drew at ${old.drawnSize.toFixed(3)} m`)
  // Every string the counter shows during the run-up has to fit as well.
  for (const n of [0, 900, 4300, 5000]) {
    const c = new Counter({ width: 4.4, height: 1.1, fontSize: 0.5 })
    c.set(`${n.toLocaleString('en-US')} TODAY`)
    assert.equal(c.drawnSize, 0.5, `"${n} TODAY" shrank to ${c.drawnSize}`)
  }
})
