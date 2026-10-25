import type { FramePersonsType, IgnoredPersonType, PeopleFrameType, PlayerMarkType } from '@/shared/api/schemas'

export type BoxType = [number, number, number, number]

/** Marks closer than this to the shown frame belong to it (detections run at 15 fps, marks are snapped to frames). */
export const SAME_FRAME_SECONDS = 0.3
const SAME_PERSON_IOU = 0.5

export type MarkedPersonType = { box: BoxType; mark: PlayerMarkType | null; ignored: IgnoredPersonType | null }

export function iou(a: BoxType, b: BoxType): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const inter = ix * iy
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
  return union > 0 ? inter / union : 0
}

/** Detected people on the frame, each with the user's mark if one was made on (about) this person here. */
function sameOn<T extends { time: number; box: BoxType }>(items: T[], time: number, box: BoxType): T | null {
  const best = items
    .filter((m) => Math.abs(m.time - time) <= SAME_FRAME_SECONDS)
    .map((m) => ({ m, overlap: iou(box, m.box) }))
    .filter((x) => x.overlap >= SAME_PERSON_IOU)
    .sort((a, b) => b.overlap - a.overlap)[0]
  return best?.m ?? null
}

export function markedPersons(frame: FramePersonsType | null, marks: PlayerMarkType[], ignored: IgnoredPersonType[] = []): MarkedPersonType[] {
  if (!frame) return []
  return frame.persons.map(({ box }) => ({ box, mark: sameOn(marks, frame.time, box), ignored: sameOn(ignored, frame.time, box) }))
}

/** Worth stopping for: someone on our half without a name, or with a name the solver is unsure of. */
export const DOUBTFUL_CONFIDENCE = 0.5

/** off — never stop; unnamed — only for people without a name; doubtful — also for names the solver is unsure of */
export type AutoStopModeType = 'off' | 'unnamed' | 'doubtful'

export function personToAsk(
  frame: PeopleFrameType | null,
  asked: ReadonlySet<number>,
  mode: AutoStopModeType = 'doubtful',
): PeopleFrameType['people'][number] | null {
  if (!frame || mode === 'off') return null
  const worth = (p: PeopleFrameType['people'][number]) =>
    p.player_id === null || (mode === 'doubtful' && !p.confirmed && p.confidence < DOUBTFUL_CONFIDENCE)
  return frame.people.find((p) => !asked.has(p.track) && !p.confirmed && worth(p)) ?? null
}

/** The people frame to draw at video time `t`: the nearest loaded one, if close enough to still be accurate. */
export function peopleAt(frames: PeopleFrameType[], t: number, maxGap = 0.2): PeopleFrameType | null {
  if (!frames.length) return null
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid]!.t < t) lo = mid + 1
    else hi = mid
  }
  const candidates = [frames[lo], frames[lo - 1]].filter((f): f is PeopleFrameType => !!f)
  const best = candidates.sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0]
  return best && Math.abs(best.t - t) <= maxGap ? best : null
}

/** Load ahead so playback doesn't wait: a window from a bit before `t` to well after it. */
export const PEOPLE_WINDOW = { before: 5, after: 40 }

export function needsPeopleWindow(loaded: { start: number; end: number } | null, t: number): boolean {
  return !loaded || t < loaded.start || t > loaded.end - 5
}

/** The moment of a rally the players pass stops at: just after the start, when everyone stands for the serve. */
export const PASS_SERVE_OFFSET_SECONDS = 1

/** Where to resume the pass: the first rally whose serve moment has no marks yet. */
export function firstUnmarked(times: number[], marks: PlayerMarkType[]): number {
  const i = times.findIndex((t) => !marks.some((m) => Math.abs(m.time - t) <= SAME_FRAME_SECONDS + 0.2))
  return i === -1 ? 0 : i
}

export type PredictedType = { player_id: number; confidence: number } | null

/** The solver's names for the people on the marking frame (same detections, matched by box). */
export function predictedNames(persons: MarkedPersonType[], frame: PeopleFrameType | null): PredictedType[] {
  return persons.map(({ box }) => {
    const best = (frame?.people ?? [])
      .filter((p) => p.player_id !== null)
      .map((p) => ({ p, overlap: iou(box, p.box) }))
      .filter((x) => x.overlap >= SAME_PERSON_IOU)
      .sort((a, b) => b.overlap - a.overlap)[0]
    return best ? { player_id: best.p.player_id as number, confidence: best.p.confidence } : null
  })
}

/** One step of the frame stepper in marking: about one frame of the people detection (7.5 fps) plus a bit */
export const FRAME_STEP_SECONDS = 0.2
