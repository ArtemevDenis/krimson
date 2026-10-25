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

  it('parses violations, also typed on the Russian layout', () => {
    expect(parseCommandLine('10e+ 10vn 7VC v4 vr 11vh 9vd')).toEqual({
      ok: true,
      commands: [
        { kind: 'action', number: 10, skill: 'E', evaluation: '+' },
        { kind: 'fault', number: 10, fault: 'net' },
        { kind: 'fault', number: 7, fault: 'line' },
        { kind: 'fault', number: null, fault: 'four' },
        { kind: 'fault', number: null, fault: 'rotation' },
        { kind: 'fault', number: 11, fault: 'catch' },
        { kind: 'fault', number: 9, fault: 'double' },
      ],
    })
    expect(parseCommandLine('10мт ма мк')).toEqual({
      ok: true,
      commands: [
        { kind: 'fault', number: 10, fault: 'net' },
        { kind: 'fault', number: null, fault: 'foot' },
        { kind: 'fault', number: null, fault: 'rotation' },
      ],
    })
    expect(parseCommandLine('10vx').ok).toBe(false)
  })

  it('parses Russian violation mnemonics too', () => {
    expect(parseCommandLine('10у+ 10нс 7нц нл н4 нп 11нз 9нд')).toEqual({
      ok: true,
      commands: [
        { kind: 'action', number: 10, skill: 'E', evaluation: '+' },
        { kind: 'fault', number: 10, fault: 'net' },
        { kind: 'fault', number: 7, fault: 'line' },
        { kind: 'fault', number: null, fault: 'foot' },
        { kind: 'fault', number: null, fault: 'four' },
        { kind: 'fault', number: null, fault: 'rotation' },
        { kind: 'fault', number: 11, fault: 'catch' },
        { kind: 'fault', number: 9, fault: 'double' },
      ],
    })
  })

  it('parses a ball given over, also on the Russian layout', () => {
    expect(parseCommandLine('7r- 10e- 15g- 15п#')).toEqual({
      ok: true,
      commands: [
        { kind: 'action', number: 7, skill: 'R', evaluation: '-' },
        { kind: 'action', number: 10, skill: 'E', evaluation: '-' },
        { kind: 'action', number: 15, skill: 'G', evaluation: '-' },
        { kind: 'action', number: 15, skill: 'G', evaluation: '#' },
      ],
    })
    // «нп» is still the rotation fault, not a ball given over
    expect(parseCommandLine('нп')).toMatchObject({ commands: [{ kind: 'fault', fault: 'rotation' }] })
  })

  it('parses the wrong-box mark on both layouts', () => {
    expect(parseCommandLine('31+ ё')).toEqual({ ok: true, commands: [{ kind: 'quick', number: 31, evaluation: '+' }, { kind: 'dropBox' }] })
    expect(parseCommandLine('` 31+')).toMatchObject({ commands: [{ kind: 'dropBox' }, { kind: 'quick' }] })
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
