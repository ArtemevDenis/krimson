import { describe, expect, it } from 'vitest'
import { formatPct, formatTime } from './format'

describe('format', () => {
  it('formats video time with tenths', () => {
    expect(formatTime(75.36)).toBe('01:15.3')
    expect(formatTime(null)).toBe('--:--')
  })

  it('formats ratios as percent', () => {
    expect(formatPct(0.456)).toBe('46%')
    expect(formatPct(null)).toBe('—')
  })
})
