import { describe, expect, it } from 'vitest'
import { FRAME_PADDING, halvesToCourt, toFrame, type PointType } from './court-points'

describe('toFrame', () => {
  it('maps the padded area outside the video to coordinates beyond 0..1', () => {
    const box = { left: 0, top: 0, width: 130, height: 130 } as DOMRect
    expect(toFrame(0, 0, box)).toEqual([-FRAME_PADDING, -FRAME_PADDING])
    const [x, y] = toFrame(65, 65, box)
    expect(x).toBeCloseTo(0.5)
    expect(y).toBeCloseTo(0.5)
  })
})

// Side view: our half on the left, net in the middle, near sideline at the bottom (partly off-frame)
const OUR_TOP: PointType = [0.1, 0.35]
const OUR_BOTTOM: PointType = [-0.2, 1.2]
const NET_TOP: PointType = [0.5, 0.33]
const NET_BOTTOM: PointType = [0.5, 1.25]
const FAR_TOP: PointType = [0.9, 0.35]
const FAR_BOTTOM: PointType = [1.2, 1.2]

const near = (a: PointType | undefined, b: PointType) => !!a && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.02

describe('halvesToCourt', () => {
  it('labels corners from clicks in any order and averages the doubly clicked center line', () => {
    const court = halvesToCourt([NET_BOTTOM, OUR_TOP, NET_TOP, OUR_BOTTOM], [[0.51, 0.34], FAR_BOTTOM, [0.49, 1.24], FAR_TOP])!
    expect(court).toHaveLength(6)
    const [ourL, ourR, farR, farL, centerL, centerR] = court
    // whichever sideline is "left", each baseline corner pairs with the far corner and center end on the same sideline
    const topIsLeft = near(ourL, OUR_TOP)
    expect(near(ourL, topIsLeft ? OUR_TOP : OUR_BOTTOM)).toBe(true)
    expect(near(ourR, topIsLeft ? OUR_BOTTOM : OUR_TOP)).toBe(true)
    expect(near(farL, topIsLeft ? FAR_TOP : FAR_BOTTOM)).toBe(true)
    expect(near(farR, topIsLeft ? FAR_BOTTOM : FAR_TOP)).toBe(true)
    expect(near(centerL, topIsLeft ? NET_TOP : NET_BOTTOM)).toBe(true)
    expect(near(centerR, topIsLeft ? NET_BOTTOM : NET_TOP)).toBe(true)
  })

  it('keeps our half on our side when the halves are swapped on screen', () => {
    const court = halvesToCourt([FAR_TOP, NET_TOP, FAR_BOTTOM, NET_BOTTOM], [OUR_BOTTOM, NET_BOTTOM, OUR_TOP, NET_TOP])!
    expect([court[0], court[1]].some((p) => near(p, FAR_TOP))).toBe(true)
    expect([court[2], court[3]].some((p) => near(p, OUR_TOP))).toBe(true)
  })

  it('rejects halves that share no side', () => {
    expect(halvesToCourt([OUR_TOP, OUR_BOTTOM, NET_TOP, NET_BOTTOM], [[2, 2], [2.5, 2], [2.5, 2.5], [2, 2.5]])).toBeNull()
  })
})
