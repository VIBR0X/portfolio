import { Experience } from './core/Experience.js'
import { Controls } from './core/Controls.js'
import { Sounds } from './core/Sounds.js'
import { UI } from './ui/UI.js'
import { loadFont } from './world/Text.js'
import { World } from './world/World.js'
import { mountDebugHud } from './ui/DebugHud.js'
import { buildSections } from './world/sections/index.js'

/** Cheap capability probe: some devices expose the API but fail to give a context. */
function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

async function boot() {
  const canvas = document.getElementById('scene')
  const ui = new UI({ isTouch: window.matchMedia('(pointer: coarse)').matches })

  if (!hasWebGL()) {
    ui.failToText('This browser can’t run WebGL, so the 3D version is unavailable.')
    return
  }

  const experience = new Experience({ canvas })
  const controls = new Controls({ isTouch: experience.isTouch })
  const sounds = new Sounds()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Nothing the car does should happen while the start screen is still up.
  controls.enabled = false

  ui.setProgress(0.12)
  try {
    await loadFont()
  } catch (err) {
    console.error('Font failed to load', err)
    ui.failToText('The 3D font could not be loaded. Here is the resume as text.')
    return
  }
  ui.setProgress(0.55)

  const world = new World({ experience, controls, sounds, ui })
  world.build(buildSections)
  experience.on('update', (dt, elapsed) => world.update(dt, elapsed))
  ui.setProgress(1)
  ui.setReady()
  experience.start()

  const start = () => {
    if (world.started) return
    sounds.unlock()
    ui.hideStart()
    controls.enabled = true
    world.start({ reducedMotion })
    controls.setTouchVisible(true)
    if (!reducedMotion) experience.sampleQuality()
    canvas.focus()
  }
  ui.on('start', start)

  // Keyboard users can hit Enter or Space on the start screen too.
  window.addEventListener('keydown', (e) => {
    if (world.started || ui.el.startBtn.disabled) return
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
      e.preventDefault()
      start()
    }
  })

  if (new URLSearchParams(location.search).has('debug')) mountDebugHud(experience, world)

  window.__world = world
}

boot().catch((err) => {
  console.error('Boot failed', err)
  const btn = document.getElementById('start-btn')
  const hint = document.getElementById('start-hint')
  if (hint) hint.textContent = 'The 3D world failed to start on this device.'
  if (btn) {
    btn.textContent = 'Read the resume'
    btn.disabled = false
    btn.onclick = () => {
      document.getElementById('start')?.classList.add('hidden')
      document.getElementById('resume')?.classList.remove('hidden')
    }
  }
})
