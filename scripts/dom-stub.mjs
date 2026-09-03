// Minimal DOM/canvas stubs so world modules can run under Node for smoke tests.
class FakeCtx {
  constructor() { this.font = '16px sans-serif'; this.fillStyle = ''; this.strokeStyle = ''; this.lineWidth = 1; this.textAlign = 'left'; this.textBaseline = 'top'; this.globalAlpha = 1; this.letterSpacing = '0px' }
  measureText(t) { const size = parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 16); return { width: String(t).length * size * 0.55 } }
  createRadialGradient() { return { addColorStop() {} } }
  createLinearGradient() { return { addColorStop() {} } }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } }
}
for (const n of ['clearRect', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'arc', 'closePath', 'fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'save', 'restore', 'translate', 'rotate', 'scale', 'quadraticCurveTo', 'bezierCurveTo', 'setLineDash', 'setTransform', 'roundRect', 'clip', 'ellipse', 'rect', 'drawImage', 'putImageData']) {
  FakeCtx.prototype[n] = function () {}
}
function fakeElement(tag) {
  const el = {
    tagName: String(tag).toUpperCase(), style: {}, dataset: {}, children: [], innerHTML: '', textContent: '', hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
    appendChild(c) { this.children.push(c); return c }, removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector() { return null }, querySelectorAll() { return [] }, setAttribute() {}, getAttribute() { return null }, focus() {}, blur() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 } }, setPointerCapture() {}, releasePointerCapture() {},
  }
  if (tag === 'canvas') { el.width = 0; el.height = 0; el.getContext = () => new FakeCtx(); el.toDataURL = () => '' }
  return el
}
globalThis.window = globalThis
globalThis.document = {
  createElement: fakeElement, createElementNS: (ns, tag) => fakeElement(tag), getElementById: () => fakeElement('div'), querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, body: fakeElement('body'), documentElement: fakeElement('html'), activeElement: null, hidden: false,
}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} })
globalThis.localStorage = { getItem() { return null }, setItem() {}, removeItem() {} }
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [], clipboard: { writeText: async () => {} }, userAgent: 'node', maxTouchPoints: 0, hardwareConcurrency: 8 }, configurable: true })
globalThis.innerWidth = 1280
globalThis.innerHeight = 720
globalThis.devicePixelRatio = 1
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.location = { hash: '', pathname: '/', href: 'http://localhost/', search: '' }
globalThis.history = { replaceState() {} }
globalThis.open = () => null
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}
globalThis.Image = class { constructor() { this.onload = null } }
globalThis.KeyboardEvent = class {}
globalThis.self = globalThis
