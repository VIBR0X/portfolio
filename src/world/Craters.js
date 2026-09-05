import { scatterPoints } from './Clutter.js'

/**
 * The range's craters: twelve seeded discs, 3–8 m across, clear of every road and section by their
 * own radius plus 2 m (road margin 10 ≥ r + 2 and section margin 8 ≥ r for every r ≤ 8). Shared by
 * the floor (wear bowls + decals) and by Clutter (rim boulders). The low tier keeps the first six.
 */
export function craterPoints(extents, { low = false } = {}) {
  const pts = scatterPoints(extents, 12, 23, { margin: 10, sectionMargin: 8 })
  const craters = pts.map((p) => ({ cx: p.x, cz: p.z, r: 3 + p.r * 5 }))
  return low ? craters.slice(0, 6) : craters
}
