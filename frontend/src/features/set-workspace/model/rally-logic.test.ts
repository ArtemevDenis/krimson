import { describe, expect, it } from 'vitest'
import type { PlayerType, RallyStateType, RallyType, SuggestionType, WorkspaceType } from '@/shared/api/schemas'
import { liveRally, reviewWindow, roleInZone } from './rally-logic'

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

describe('roleInZone', () => {
  it('shows the set libero as libero even if the roster says otherwise', () => {
    // zone 1: MB 4 replaced by player 14, an OH in the roster chosen as this set's libero
    const state = { lineup: [4, 7, 13, 5, 10, 2], on_court: [14, 7, 13, 5, 10, 2], lineup_roles: ['MB', 'S', 'OH', 'MB', 'OPP', 'OH'] } as RallyStateType
    const oh = { id: 14, position: 'OH' } as PlayerType
    expect(roleInZone(state, 1, oh)).toBe('L')
    expect(roleInZone(state, 2, { id: 7, position: 'S' } as PlayerType)).toBe('S')
  })
})

describe('reviewWindow', () => {
  const sg = (id: number, time: number) => ({ id, time }) as SuggestionType
  const withActions = (r: RallyType, times: number[]) => ({ ...r, actions: times.map((t) => ({ video_time: t })) }) as RallyType
  const wsOf = (rallies: RallyType[], suggestions: SuggestionType[]) => ({ rallies, suggestions }) as WorkspaceType

  it('plays from before the touch on to just after the next one', () => {
    const ws = wsOf([withActions(rally(1, 100, 130, null), [])], [sg(1, 110), sg(2, 112.5)])
    expect(reviewWindow(ws, sg(1, 110))).toEqual({ start: 108, touch: 110, end: 113.5 })
  })

  it('counts tagged actions as the next touch too', () => {
    const ws = wsOf([withActions(rally(1, 100, 130, null), [111.2])], [sg(1, 110)])
    expect(reviewWindow(ws, sg(1, 110)).end).toBeCloseTo(112.2)
  })

  it('shows a few seconds after the last touch, within the rally', () => {
    const ws = wsOf([withActions(rally(1, 100, 111.5, null), [])], [sg(1, 110)])
    expect(reviewWindow(ws, sg(1, 110)).end).toBe(111.5)
    const open = wsOf([withActions(rally(1, 100, 140, null), [])], [sg(1, 110)])
    expect(reviewWindow(open, sg(1, 110)).end).toBe(113)
  })
})
