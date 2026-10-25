import { describe, expect, it } from 'vitest'
import type { PlayerMarkType } from '@/shared/api/schemas'
import { firstUnmarked, markedPersons, personToAsk, predictedNames } from './marks-logic'

const mark = (id: number, time: number, box: [number, number, number, number]) => ({ id, set_id: 1, player_id: id * 10, time, box }) as PlayerMarkType

describe('markedPersons', () => {
  const frame = { time: 10, persons: [{ box: [0.1, 0.4, 0.2, 0.8] as [number, number, number, number], conf: 0.9 }, { box: [0.5, 0.4, 0.6, 0.8] as [number, number, number, number], conf: 0.8 }] }

  it('attaches a mark made on about the same person at about the same moment', () => {
    const marks = [mark(1, 10.07, [0.11, 0.41, 0.21, 0.8]), mark(2, 12, [0.5, 0.4, 0.6, 0.8])]
    const result = markedPersons(frame, marks)
    expect(result.map((p) => p.mark?.id ?? null)).toEqual([1, null])
  })

  it('returns nothing without a frame', () => {
    expect(markedPersons(null, [])).toEqual([])
  })
})

describe('personToAsk', () => {
  const person = (track: number, player_id: number | null, confidence: number, confirmed = false) => ({
    track, box: [0.1, 0.1, 0.2, 0.4] as [number, number, number, number], player_id, confidence, confirmed,
  })

  it('asks about someone without a name, or with a doubtful one, once', () => {
    const frame = { t: 5, people: [person(1, 7, 0.95), person(2, 9, 0.3), person(3, null, 0)] }
    expect(personToAsk(frame, new Set())?.track).toBe(2)
    expect(personToAsk(frame, new Set([2]))?.track).toBe(3)
    expect(personToAsk(frame, new Set([2, 3]))).toBeNull()
  })

  it('asks only about people without a name in the "unnamed" mode', () => {
    const frame = { t: 5, people: [person(2, 9, 0.3), person(3, null, 0)] }
    expect(personToAsk(frame, new Set(), 'unnamed')?.track).toBe(3)
    expect(personToAsk(frame, new Set(), 'off')).toBeNull()
  })

  it('never asks about a confirmed player', () => {
    expect(personToAsk({ t: 5, people: [person(1, 7, 0.2, true)] }, new Set())).toBeNull()
  })
})

describe('players pass helpers', () => {
  it('resumes at the first rally whose serve moment has no marks', () => {
    const marks = [mark(1, 11.05, [0.1, 0.4, 0.2, 0.8])]
    expect(firstUnmarked([11, 25, 40], marks)).toBe(1)
    expect(firstUnmarked([11], marks)).toBe(0) // all done: start over
  })

  it("matches the solver's names to the people on the frame", () => {
    const persons = [
      { box: [0.1, 0.4, 0.2, 0.8] as [number, number, number, number], mark: null, ignored: null },
      { box: [0.6, 0.4, 0.7, 0.8] as [number, number, number, number], mark: null, ignored: null },
    ]
    const frame = { t: 10, people: [{ track: 4, box: [0.1, 0.41, 0.2, 0.8] as [number, number, number, number], player_id: 7, confidence: 0.6, confirmed: false }] }
    expect(predictedNames(persons, frame)).toEqual([{ player_id: 7, confidence: 0.6 }, null])
  })
})
