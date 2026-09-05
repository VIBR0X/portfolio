/**
 * Apex height in metres. With the camera's focus lift and zoom floor (`World.requestFocusAltitude`,
 * `World.requestMinZoom`) the whole flight — pedestal, rocket and parachute — stays inside the
 * fixed camera's frame from the LAUNCH pad; a taller apex climbed straight off the top of the screen.
 */
export const ROCKET_APEX = 9

/** Ascent duration in seconds; ease-out so the rocket is fast off the pad and stalls at the apex. */
const ASCENT = 3
/** Coast at the apex before the parachute opens, seconds. */
const COAST = 0.6
/** Descent rate under the parachute, m/s. */
const DESCENT = 2.6
/** Pad reset time after touchdown, seconds. */
const COOLDOWN = 6

/** Pure rocket-launch state step, Node-testable in isolation from the THREE scene. */
export function rocketStep(s, dt) {
  const next = { ...s }
  if (s.state === 'countdown') {
    next.t += dt
    if (next.t >= 3) { next.state = 'ascending'; next.t = 0 }
  } else if (s.state === 'ascending') {
    next.t += dt
    const k = Math.min(1, next.t / ASCENT)
    next.y = ROCKET_APEX * (1 - (1 - k) * (1 - k)) // ease-out quad: zero vertical speed at the apex
    if (next.t >= ASCENT) { next.state = 'coasting'; next.t = 0; next.y = ROCKET_APEX }
  } else if (s.state === 'coasting') {
    next.t += dt
    if (next.t >= COAST) { next.state = 'descending'; next.t = 0 }
  } else if (s.state === 'descending') {
    next.t += dt
    next.y = s.y - DESCENT * dt
    if (next.y <= 0) { next.y = 0; next.state = 'idle'; next.cooldown = COOLDOWN }
  } else if (s.state === 'idle') {
    next.cooldown = Math.max(0, (s.cooldown || 0) - dt)
  }
  return next
}
