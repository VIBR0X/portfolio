/**
 * Apex height in metres. Kept low enough that the whole flight stays inside the fixed camera's
 * view from the ground: at 60 m the rocket climbed straight off the top of the screen and the
 * visitor saw only smoke and a chip.
 */
export const ROCKET_APEX = 26

/** Pure rocket-launch state step, Node-testable in isolation from the THREE scene. */
export function rocketStep(s, dt) {
  const next = { ...s }
  if (s.state === 'countdown') {
    next.t += dt
    if (next.t >= 3) { next.state = 'ascending'; next.t = 0 }
  } else if (s.state === 'ascending') {
    next.t += dt
    const k = Math.min(1, next.t / 3)
    next.y = ROCKET_APEX * (k * k) // ease-in-quad over 3 s to the apex
    if (next.t >= 3) { next.state = 'coasting'; next.t = 0; next.y = ROCKET_APEX }
  } else if (s.state === 'coasting') {
    next.t += dt
    if (next.t >= 0.6) { next.state = 'descending'; next.t = 0 }
  } else if (s.state === 'descending') {
    next.y = s.y - 3 * dt
    if (next.y <= 0) { next.y = 0; next.state = 'idle'; next.cooldown = 6 }
  } else if (s.state === 'idle') {
    next.cooldown = Math.max(0, (s.cooldown || 0) - dt)
  }
  return next
}
