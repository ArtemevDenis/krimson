import { describe, expect, it } from 'vitest'
import type { RallyType, WorkspaceType } from '@/shared/api/schemas'
import { liveRally } from './rally-logic'

const rally = (id: number, start: number | null, end: number | null, winner: 'us' | 'them' | null): RallyType =>
  ({ id, start_time: start, end_time: end, winner }) as RallyType
const ws = (rallies: RallyType[]) => ({ rallies }) as WorkspaceType

describe('liveRally', () => {
  it('finds a manual rally started earlier in the video than already tagged ones', () => {
    // tagged a rally at 2:09, then went back to 0:00 and started a new one there
    const rallies = [rally(2, 0, null, null), rally(1, 128.9, 130.4, 'them')]
    expect(liveRally(ws(rallies), 5)?.id).toBe(2)
  })

  it('keeps the last open rally as the target while it is in progress', () => {
    expect(liveRally(ws([rally(1, 10, 20, 'us'), rally(2, 30, null, null)]), 35)?.id).toBe(2)
  })

  it('starts a new rally when nothing is in progress', () => {
    expect(liveRally(ws([rally(1, 10, 20, 'us')]), 40)).toBeNull()
  })
})
