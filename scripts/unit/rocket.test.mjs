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

test('the cooldown ticks down while idle and stops at zero', () => {
  let s = { state: 'idle', t: 0, y: 0, cooldown: 1 }
  s = rocketStep(s, 0.5)
  assert.equal(s.cooldown, 0.5)
  s = rocketStep(s, 2)
  assert.equal(s.cooldown, 0)
})
