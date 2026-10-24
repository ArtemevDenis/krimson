import { describe, expect, it } from 'vitest'
import { statsSummarySchema, type TeamStatsType } from '@/shared/api/schemas'
import { COMPARISON_ROWS, type ComparisonColumnType } from './set-comparison'

const team: TeamStatsType = { rallies: 40, won: 25, our_points: 12, our_errors: 9, opponent_errors: 13, opponent_points: 6, faults: 1 }
const column: ComparisonColumnType = {
  key: 's1',
  title: 'Партия 1',
  team,
  summary: statsSummarySchema.parse({ attack_total: 10, kills: 5, attack_errors: 1, attack_blocked: 1, sideout_won: 0, sideout_total: 0 }),
}
const row = (label: string) => COMPARISON_ROWS.find((r) => r.label === label)!.value(column)

describe('set comparison rows', () => {
  it('shows the set score from rallies', () => {
    expect(row('Счёт')).toBe('25:15')
  })

  it('computes attack efficiency from counts', () => {
    expect(row('Атака: результативность')).toBe('50% (5/10)')
    expect(row('Атака: эффективность')).toBe('30%')
  })

  it('shows a dash instead of dividing by zero', () => {
    expect(row('Side-out')).toBe('— (0/0)')
  })
})
