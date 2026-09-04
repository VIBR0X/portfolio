/**
 * `?debug` overlay: frame rate and time, quality tier and AO state, draw calls, triangles and physics body counts.
 * Kept out of the normal path so it costs nothing when it is off.
 */
export function mountDebugHud(experience, world) {
  const el = document.createElement('div')
  el.className = 'debug-hud'
  document.body.appendChild(el)
  let frames = 0
  let acc = 0
  let fps = 0
  experience.on('update', (dt) => {
    frames++
    acc += dt
    if (acc >= 0.5) {
      fps = Math.round(frames / acc)
      const ms = ((acc / frames) * 1000).toFixed(1)
      frames = 0
      acc = 0
      const r = experience.renderer.info.render
      const bodies = world.physics.world.bodies
      let awake = 0
      for (const b of bodies) if (b.sleepState !== 2 && b.mass > 0) awake++
      const p = world.car.physics
      el.textContent = [
        `${fps} fps · ${ms} ms`,
        `${experience.quality}${experience.lowQuality ? '→low' : ''} · AO ${experience.effects ? 'on' : 'off'}`,
        `${r.calls} calls`,
        `${(r.triangles / 1000).toFixed(1)}k tris`,
        `${bodies.length} bodies (${awake} awake)`,
        `${p.speed.toFixed(1)} m/s`,
        `x ${p.position.x.toFixed(0)} z ${p.position.z.toFixed(0)}`,
        world.currentSection ? world.currentSection.id : '—',
      ].join('  ·  ')
    }
  })
  return el
}
