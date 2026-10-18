import { describe, expect, it } from 'vitest'
import { parseCommandLine } from './code-parser'

describe('parseCommandLine', () => {
  it('parses a chain of actions', () => {
    expect(parseCommandLine('s- 7r+ 10e# 15A#')).toEqual({
      ok: true,
      commands: [
        { kind: 'action', number: null, skill: 'S', evaluation: '-' },
        { kind: 'action', number: 7, skill: 'R', evaluation: '+' },
        { kind: 'action', number: 10, skill: 'E', evaluation: '#' },
        { kind: 'action', number: 15, skill: 'A', evaluation: '#' },
      ],
    })
  })

  it('accepts codes typed on the Russian layout', () => {
    expect(parseCommandLine('15ф№ 3и.')).toEqual({
      ok: true,
      commands: [
        { kind: 'action', number: 15, skill: 'A', evaluation: '#' },
        { kind: 'action', number: 3, skill: 'B', evaluation: '/' },
      ],
    })
  })

  it('parses rally commands', () => {
    expect(parseCommandLine('х ъ + - *')).toEqual({
      ok: true,
      commands: [{ kind: 'start' }, { kind: 'end' }, { kind: 'winner', side: 'us' }, { kind: 'winner', side: 'them' }, { kind: 'star' }],
    })
  })

  it('parses suggestion shortcuts', () => {
    expect(parseCommandLine('31+ ч')).toEqual({
      ok: true,
      commands: [{ kind: 'quick', number: 31, evaluation: '+' }, { kind: 'reject' }],
    })
  })

  it('rejects unknown codes', () => {
    const result = parseCommandLine('15x#')
    expect(result.ok).toBe(false)
  })
})
