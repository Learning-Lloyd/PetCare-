/** Normalize DB or HTML time values to "HH:MM" for comparison and APIs. */
export function normalizeTime(t) {
  const s = String(t || "").trim()
  if (!s) return ""
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (!m) return s.slice(0, 5)
  const h = String(Number(m[1])).padStart(2, "0")
  const min = m[2].padStart(2, "0")
  return `${h}:${min}`
}

/** Build slot strings between day_start and day_end (exclusive of partial tail). */
export function generateSlotsFromSettings(dayStart, dayEnd, slotMinutes) {
  const start = normalizeTime(dayStart)
  const end = normalizeTime(dayEnd)
  const step = Math.max(5, Math.min(240, Number(slotMinutes) || 30))
  const toMin = (hhmm) => {
    const [h, m] = hhmm.split(":").map((x) => Number(x))
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  }
  const fromMin = (mins) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }
  const a = toMin(start)
  const b = toMin(end)
  if (a == null || b == null || b <= a) return []
  const out = []
  for (let t = a; t + step <= b; t += step) {
    out.push(fromMin(t))
  }
  return out
}
