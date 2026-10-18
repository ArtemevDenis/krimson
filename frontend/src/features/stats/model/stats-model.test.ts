import { describe, expect, it } from 'vitest'
import type { PlayerStatsType } from '@/shared/api/schemas'
import { teamTotals } from './stats-model'

const row = (attack: { total: number; kill: number; error: number; blocked: number }): PlayerStatsType => ({
  player_id: 1,
  rallies_on_court: 0,
  points: attack.kill,
  errors: attack.error,
  serve: { total: 0, ace: 0, error: 0, eff: null },
  reception: { total: 0, perfect: 0, positive: 0, error: 0, pos_pct: null, perf_pct: null },
  attack: { ...attack, kill_pct: null, eff: null },
  block: { total: 0, point: 0, error: 0 },
  dig: { total: 0, positive: 0, error: 0 },
  set: { total: 0, error: 0 },
  raw: {},
})

describe('teamTotals', () => {
  it('recomputes efficiency from summed counts', () => {
    const total = teamTotals([row({ total: 10, kill: 5, error: 1, blocked: 1 }), row({ total: 10, kill: 3, error: 2, blocked: 0 })])
    expect(total.attack.kill).toBe(8)
    expect(total.attack.eff).toBeCloseTo(0.2)
    expect(total.serve.eff).toBeNull()
  })
})
