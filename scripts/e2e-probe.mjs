// Probe which headless Chrome config renders WebGL fastest on this machine.
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'
const url = process.env.URL || 'http://localhost:5179/'
const configs = [
  { name: 'google-chrome gpu', executablePath: '/usr/bin/google-chrome', args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] },
  { name: 'google-chrome swiftshader', executablePath: '/usr/bin/google-chrome', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  { name: 'pw-chromium gpu', executablePath: `${homedir()}/.cache/ms-playwright/chromium-1200/chrome-linux/chrome`, args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist'] },
  { name: 'pw-chromium swiftshader', executablePath: `${homedir()}/.cache/ms-playwright/chromium-1200/chrome-linux/chrome`, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
]
for (const c of configs) {
  let browser
  try {
    browser = await chromium.launch({ executablePath: c.executablePath, headless: true, args: c.args })
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForSelector('#start-btn:not([disabled])', { timeout: 15000 })
    await page.click('#start-btn')
    await page.waitForTimeout(500)
    const r = await page.evaluate(async () => {
      const w = window.__world
      const gl = w.experience.renderer.getContext()
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      let frames = 0
      const off = w.experience.on('update', () => frames++)
      const t0 = performance.now()
      await new Promise((r) => setTimeout(r, 2000))
      off()
      return { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?', fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1) }
    })
    console.log(c.name, '=>', JSON.stringify(r), errors.length ? 'errors: ' + errors.join('; ') : '')
  } catch (e) {
    console.log(c.name, '=> FAILED', String(e).split('\n')[0])
  } finally {
    await browser?.close()
  }
}
