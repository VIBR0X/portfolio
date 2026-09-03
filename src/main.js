import { Experience } from './core/Experience.js'
import { Controls } from './core/Controls.js'
import { Sounds } from './core/Sounds.js'
import { UI } from './ui/UI.js'
import { loadFont } from './world/Text.js'
import { World } from './world/World.js'

async function boot() {
  const canvas = document.getElementById('scene')
  const experience = new Experience({ canvas })
  const ui = new UI({ isTouch: experience.isTouch })
  const controls = new Controls({ isTouch: experience.isTouch })
  const sounds = new Sounds()

  ui.setProgress(0.12)
  try {
    await loadFont()
  } catch (err) {
    console.error('Font failed to load', err)
    ui.toast('Could not load the 3D font; some text may be missing.')
  }
  ui.setProgress(0.55)

  const world = new World({ experience, controls, sounds, ui })
  experience.on('update', (dt, elapsed) => world.update(dt, elapsed))
  ui.setProgress(1)
  ui.setReady()
  experience.start()

  const start = () => {
    sounds.unlock()
    ui.hideStart()
    world.start()
    controls.setTouchVisible(true)
    canvas.focus()
  }
  ui.on('start', start)

  // Keyboard users can hit Enter/Space on the start screen too.
  window.addEventListener('keydown', (e) => {
    if (!world.started && (e.code === 'Enter' || e.code === 'Space') && !ui.el.startBtn.disabled) {
      e.preventDefault()
      start()
    }
  }, { once: false })

  window.__world = world
}

boot().catch((err) => {
  console.error(err)
  const btn = document.getElementById('start-btn')
  if (btn) { btn.textContent = 'Something broke — read the résumé instead'; btn.disabled = false; btn.onclick = () => (location.hash = '#resume', location.reload()) }
})
