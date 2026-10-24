export type PointType = [number, number]

/** Saved calibration: our baseline L/R, far baseline R/L, center line L/R (the order the backend expects). */
export const POINT_COUNT = 6

/** The user clicks the 4 corners of our half, then the 4 corners of the opponent's half, in any order. */
export const HALF_CORNERS = 4
export const CLICK_COUNT = 2 * HALF_CORNERS

/** Extra room around the frame so corners hidden outside the camera view can still be estimated. */
export const FRAME_PADDING = 0.5

/** Outline order for drawing: the court polygon, then the center line. */
export const COURT_OUTLINE = [0, 1, 2, 3] as const
export const CENTER_LINE = [4, 5] as const

export function toFrame(clientX: number, clientY: number, box: DOMRect): PointType {
  // The SVG viewBox spans [-PAD, 1+PAD] on both axes
  const span = 1 + 2 * FRAME_PADDING
  return [((clientX - box.left) / box.width) * span - FRAME_PADDING, ((clientY - box.top) / box.height) * span - FRAME_PADDING]
}

const dist = (a: PointType, b: PointType) => Math.hypot(a[0] - b[0], a[1] - b[1])
const mid = (a: PointType, b: PointType): PointType => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

/** Corners in walking order around the quadrilateral (clicks may come in any order). */
export function cyclicOrder(points: PointType[]): PointType[] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length
  return [...points].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx))
}

/**
 * Turns the two halves into the 6 calibration points. The halves share one side — the center line, clicked twice —
 * which tells which corners are on the net and which on the baselines; its two ends define the two sidelines.
 * Which sideline is called "left" doesn't matter: the court mapping works mirrored too.
 * Returns null when no side of the halves lines up (a corner clicked far off or into the wrong half).
 */
export function halvesToCourt(ourClicks: PointType[], theirClicks: PointType[]): PointType[] | null {
  if (ourClicks.length !== HALF_CORNERS || theirClicks.length !== HALF_CORNERS) return null
  const ours = cyclicOrder(ourClicks)
  const theirs = cyclicOrder(theirClicks)
  const at = <T,>(list: T[], i: number): T => list[((i % HALF_CORNERS) + HALF_CORNERS) % HALF_CORNERS]!

  let best: { cost: number; k: number; tA: number; tB: number } | null = null
  for (let k = 0; k < HALF_CORNERS; k++) {
    for (let j = 0; j < HALF_CORNERS; j++) {
      const [a, b] = [at(ours, k), at(ours, k + 1)]
      for (const [tA, tB] of [
        [j, j + 1],
        [j + 1, j],
      ] as const) {
        const cost = dist(a, at(theirs, tA)) + dist(b, at(theirs, tB))
        if (!best || cost < best.cost) best = { cost, k, tA: tA % HALF_CORNERS, tB: tB % HALF_CORNERS }
      }
    }
  }
  if (!best) return null
  const size = ours.reduce((s, p, i) => s + dist(p, at(ours, i + 1)), 0) / HALF_CORNERS
  // the shared center line must be clicked at about the same spots for both halves
  if (best.cost / 2 > 0.25 * size) return null

  const centerA = at(ours, best.k)
  const centerB = at(ours, best.k + 1)
  const ourA = at(ours, best.k + 3) // our baseline corner on sideline A (next to centerA)
  const ourB = at(ours, best.k + 2)
  const theirA = at(theirs, best.tA)
  const theirB = at(theirs, best.tB)
  // the far corners are the neighbours of the shared corners on the opponent's half
  const farA = at(theirs, best.tA - 1) === theirB ? at(theirs, best.tA + 1) : at(theirs, best.tA - 1)
  const farB = at(theirs, best.tB - 1) === theirA ? at(theirs, best.tB + 1) : at(theirs, best.tB - 1)
  return [ourA, ourB, farB, farA, mid(centerA, theirA), mid(centerB, theirB)]
}
