import { describe, expect, it } from 'vitest'
import { FRAME_PADDING, toFrame } from './court-points'

describe('toFrame', () => {
  it('maps the padded area outside the video to coordinates beyond 0..1', () => {
    const box = { left: 0, top: 0, width: 130, height: 130 } as DOMRect
    expect(toFrame(0, 0, box)).toEqual([-FRAME_PADDING, -FRAME_PADDING])
    const [x, y] = toFrame(65, 65, box)
    expect(x).toBeCloseTo(0.5)
    expect(y).toBeCloseTo(0.5)
  })
})
