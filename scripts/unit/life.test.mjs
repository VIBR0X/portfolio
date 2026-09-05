import test from 'node:test'
import assert from 'node:assert/strict'
import { rocketStep, ROCKET_APEX } from '../../src/world/sections/rocketLaunch.js'

test('countdown holds for 3s then switches to ascending', () => {
  // Accumulating 1/60 sixty times lands a hair under the boundary (2.9999999999999942), so the
  // transition fires on the following frame. Assert the behaviour, not bit-exact float equality.
  let s = { state: 'countdown', t: 0, y: 0 }
  for (let i = 0; i < 176; i++) s = rocketStep(s, 1 / 60) // 2.93s
  assert.equal(s.state, 'countdown', 'still counting down just before 3s')
  for (let i = 0; i < 6; i++) s = rocketStep(s, 1 / 60) // 3.03s
  assert.equal(s.state, 'ascending', 'ascending just after 3s')
})

test('ascending reaches the apex after 3s then coasts', () => {
  let s = { state: 'ascending', t: 0, y: 0 }
  for (let i = 0; i < 185; i++) s = rocketStep(s, 1 / 60) // 3.08s, just past the boundary
  assert.ok(Math.abs(s.y - ROCKET_APEX) < 0.5, `y=${s.y}`)
  assert.equal(s.state, 'coasting')
})

test('the apex stays inside the camera view from the ground', () => {
  assert.ok(ROCKET_APEX <= 30, `apex ${ROCKET_APEX} m would climb out of frame`)
})

test('descending falls at a steady 3 m/s under the parachute', () => {
  let s = { state: 'descending', t: 0, y: 26 }
  s = rocketStep(s, 1)
  assert.ok(Math.abs(s.y - 23) < 1e-9, `y=${s.y}`)
})

test('touching down re-arms after a cooldown', () => {
  let s = { state: 'descending', t: 0, y: 0.5 }
  s = rocketStep(s, 1)
  assert.equal(s.state, 'idle')
  assert.equal(s.cooldown, 6)
})

test('the cooldown ticks down while idle and stops at zero', () => {
  let s = { state: 'idle', t: 0, y: 0, cooldown: 1 }
  s = rocketStep(s, 0.5)
  assert.equal(s.cooldown, 0.5)
  s = rocketStep(s, 2)
  assert.equal(s.cooldown, 0)
})
