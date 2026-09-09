// Really plays the four Bay Row machines with the keyboard and asserts each one responds.
// The audits prove the models can be SEEN; this proves they still do something when you drive at
// them. Every trial starts from the bay's own OPEN pad, because that is the run-up a player gets
// (from 2.4 m out the car cannot shove Tark's puck far enough to be claimed — measured).
// Usage: node scripts/e2e-bay-row.mjs   (needs a dev server on :5179)
import { chromium } from 'playwright-core'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const out = `${tmpdir()}/portfolio-bay-row`
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--headless=new', '--use-gl=angle', '--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await page.goto('http://localhost:5179/', { waitUntil: 'load' })
await page.waitForSelector('#start-btn:not([disabled])', { timeout: 20000 })
await page.click('#start-btn')
await page.waitForTimeout(2800)

const st = () => page.evaluate(() => {
  const s = window.__world.sectionById.get('experience')
  return {
    tark: { acts: s.tark.acts, llm: s.tark.llm, cycles: s.tark.cycles, counter: s.counters[0].value },
    epik: { live: s.epik.live, counter: s.counters[1].value },
    cons: { n: s.cons.n, open: s.cons.flap.filter((f) => f.state !== 'closed').length, counter: s.counters[2].value },
    dev: { n: s.dev.n, releases: s.dev.releases, counter: s.counters[3].value },
    car: [+window.__world.car.physics.position.x.toFixed(1), +window.__world.car.physics.position.z.toFixed(1)],
  }
})
const go = async (x, z) => { await page.evaluate(([x, z]) => { const w = window.__world; w.car.teleport(x, z, 0); w.camera.snap(w.car.physics.position) }, [x, z]); await page.waitForTimeout(700) }
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key) }
const results = []
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`) }

// 02 EPIK — plough the drum rank
await go(-54, -37.5)
const e0 = await st()
await hold('ArrowUp', 1500)
await page.waitForTimeout(1200)
const e1 = await st()
check('Epik: ramming the rank knocks pipelines down', e1.epik.live < 7, `live ${e0.epik.live} -> ${e1.epik.live}, counter "${e1.epik.counter}"`)
await page.screenshot({ path: `${out}/01-epik.png` })

// 04 DEVCOM — cover the release floor
await go(-89.45, -38.5)
const d0 = await st()
await hold('ArrowUp', 1400)
await page.waitForTimeout(600)
const d1 = await st()
check('DevCom: driving the floor lights tiles', d1.dev.n > d0.dev.n, `lit ${d0.dev.n} -> ${d1.dev.n}, counter "${d1.dev.counter}"`)
await page.screenshot({ path: `${out}/02-devcom.png` })

// 03 CONSULTING — thread a lane
await go(-70, -38.0)
await hold('ArrowUp', 1800)
await page.waitForTimeout(1600)
const c1 = await st()
check('Consulting: driving a lane crawls its sources', c1.cons.n > 0, `crawled ${c1.cons.n}/9, counter "${c1.cons.counter}", car ${c1.car}`)
await page.screenshot({ path: `${out}/03-consulting.png` })

// 01 TARK — shove the puck into the gate
await go(-38, -32.8)   // the OPEN pad, which is where a player actually starts
const t0 = await st()
await hold('ArrowUp', 2400)
await page.waitForTimeout(2600)
const t1 = await st()
check('Tark: the heartbeat turns on its own', t1.tark.cycles > 0, `${t1.tark.cycles} cycles`)
check('Tark: shoving the puck is claimed once', t1.tark.acts > t0.tark.acts, `acts ${t0.tark.acts} -> ${t1.tark.acts}, counter "${t1.tark.counter}"`)
await page.screenshot({ path: `${out}/04-tark.png` })

// R restores the section
await page.keyboard.press('r')
await page.waitForTimeout(1800)
const r1 = await st()
check('R restores the row', r1.epik.live === 7 && r1.dev.n === 0 && r1.cons.n === 0, `epik ${r1.epik.live}/7, devcom ${r1.dev.n}, consulting ${r1.cons.n}`)
await page.screenshot({ path: `${out}/05-reset.png` })

console.log('errors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
process.exit(results.every(Boolean) && !errors.length ? 0 : 1)
