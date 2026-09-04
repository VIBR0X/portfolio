import '../dom-stub.mjs'
import * as THREE from 'three'
import { World } from '../../src/world/World.js'
import { Controls } from '../../src/core/Controls.js'
import { Sounds } from '../../src/core/Sounds.js'

/**
 * A World with no sections, a recording fake experience and a no-op UI.
 * Same shape as the fake in scripts/smoke-sections.mjs, plus a fake shadowFollow that records aim() calls.
 */
export function fakeWorld({ quality = 'high' } = {}) {
  const scene = new THREE.Scene()
  const aims = []
  const experience = {
    scene,
    camera: new THREE.PerspectiveCamera(40, 16 / 9, 1, 260),
    canvas: { addEventListener() {}, focus() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) },
    isTouch: false, isSmall: false, quality, sizes: { width: 1280, height: 720, pixelRatio: 1 },
    on() { return () => {} }, emit() {},
    renderer: { info: { render: { calls: 0 } } },
    shadowFollow: { aim(focus, zoom) { aims.push({ focus: focus.clone(), zoom }) } },
  }
  const ui = new Proxy({ anyOpen: false, panelOpen: false, isTouch: false, el: {} }, { get(t, k) { return k in t ? t[k] : () => {} } })
  const world = new World({ experience, controls: new Controls({ isTouch: false }), sounds: new Sounds(), ui, strict: true })
  return { world, scene, experience, aims }
}
