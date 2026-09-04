/** localStorage-backed "is this a new best" helper; false (and unchanged) if storage is unavailable. */
export function bestOf(key, value) {
  try {
    const prev = Number(localStorage.getItem(key))
    if (!prev || value < prev) { localStorage.setItem(key, String(value)); return true }
  } catch { /* storage unavailable */ }
  return false
}
