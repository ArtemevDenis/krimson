export type PointType = [number, number]

export const POINT_LABELS = [
  'Наша задняя линия — левый угол',
  'Наша задняя линия — правый угол',
  'Дальняя задняя линия — правый угол',
  'Дальняя задняя линия — левый угол',
  'Центральная линия — левый край',
  'Центральная линия — правый край',
] as const

export const POINT_COUNT = POINT_LABELS.length

/** Extra room around the frame so corners hidden outside the camera view can still be estimated. */
export const FRAME_PADDING = 0.15

/** Outline order for drawing: the court polygon, then the center line. */
export const COURT_OUTLINE = [0, 1, 2, 3] as const
export const CENTER_LINE = [4, 5] as const

export function toFrame(clientX: number, clientY: number, box: DOMRect): PointType {
  // The SVG viewBox spans [-PAD, 1+PAD] on both axes
  const span = 1 + 2 * FRAME_PADDING
  return [((clientX - box.left) / box.width) * span - FRAME_PADDING, ((clientY - box.top) / box.height) * span - FRAME_PADDING]
}
