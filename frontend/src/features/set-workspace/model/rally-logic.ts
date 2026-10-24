import type { PlayerType, PositionType, RallyStateType, RallyType, SkillType, SuggestionType, WorkspaceType } from '@/shared/api/schemas'

/** Lead-in so a clip starting at the mark still shows the serve toss. */
export const START_LEAD_SECONDS = 1
/** When the first mark is an action, the rally probably started a few seconds earlier. */
export const IMPLICIT_START_LEAD_SECONDS = 3
export const END_TAIL_SECONDS = 0.5

export function openRally(ws: WorkspaceType): RallyType | null {
  const last = ws.rallies[ws.rallies.length - 1]
  return last && last.winner === null ? last : null
}

export function rallyById(ws: WorkspaceType, id: number | null): RallyType | null {
  if (id === null) return null
  return ws.rallies.find((r) => r.id === id) ?? null
}

export function playersById(players: PlayerType[]): Map<number, PlayerType> {
  return new Map(players.map((p) => [p.id, p]))
}

export type ResolveResultType = { ok: true; playerId: number } | { ok: false; error: string }

/** A code without a number means the server (S) or the setter on court (E); anything else needs a number. */
export function resolvePlayer(
  number: number | null,
  skill: SkillType,
  state: RallyStateType | null,
  players: PlayerType[],
): ResolveResultType {
  if (number !== null) {
    const candidates = players.filter((p) => p.number === number)
    const onCourt = candidates.find((p) => state?.on_court.includes(p.id))
    const player = onCourt ?? candidates.find((p) => p.is_active) ?? candidates[0]
    return player ? { ok: true, playerId: player.id } : { ok: false, error: `В составе нет игрока #${number}` }
  }
  if (skill === 'S') {
    if (state?.server_id) return { ok: true, playerId: state.server_id }
    return { ok: false, error: 'Сейчас подаёт соперник — укажите номер или проверьте счёт' }
  }
  if (skill === 'E') {
    // setter_zone follows the role in this set, so a sub playing setter is found too
    const setterId = state?.setter_zone ? state.lineup[state.setter_zone - 1] : undefined
    if (setterId !== undefined) return { ok: true, playerId: setterId }
  }
  return { ok: false, error: 'Укажите номер игрока, например 15a#' }
}

/** Zones laid out as seen from behind our baseline: front row 4-3-2, back row 5-6-1. */
export const COURT_ZONES: number[][] = [
  [4, 3, 2],
  [5, 6, 1],
]

export function playerInZone(state: RallyStateType, zone: number): number | undefined {
  return state.on_court[zone - 1]
}

/** The libero is whoever the set uses as libero, not necessarily an L in the roster. */
export function isLiberoInZone(state: RallyStateType, zone: number): boolean {
  return state.on_court[zone - 1] !== state.lineup[zone - 1]
}

/** Role in this set: a sub may play the replaced player's role instead of his roster position. */
export function roleInZone(state: RallyStateType, zone: number, player: PlayerType | undefined): PositionType | null {
  if (!player) return null
  if (isLiberoInZone(state, zone)) return 'L'
  return state.lineup_roles[zone - 1] ?? player.position
}

export function rallyDuration(rally: RallyType): number | null {
  if (rally.start_time === null || rally.end_time === null) return null
  return rally.end_time - rally.start_time
}

export function rallyAtTime(ws: WorkspaceType, time: number): RallyType | null {
  return ws.rallies.find((r) => r.start_time !== null && r.end_time !== null && time >= r.start_time && time <= r.end_time) ?? null
}

/** How long after a rally's end codes still go to it (typing the line right after the whistle). */
const LIVE_TAIL_SECONDS = 3

/** Live-mode target: an unfinished rally around the current moment (auto-detected ones have bounds),
 * or the manual one still in progress (no end yet). Otherwise codes start a new rally. */
export function liveRally(ws: WorkspaceType, time: number): RallyType | null {
  const around = ws.rallies.find(
    (r) => r.winner === null && r.start_time !== null && r.end_time !== null && time >= r.start_time - 0.5 && time <= r.end_time + LIVE_TAIL_SECONDS,
  )
  if (around) return around
  // A manual rally in progress is not necessarily the last one: rallies are kept in video order,
  // so one started earlier in the video than already tagged ones sits before them
  const started = ws.rallies.filter((r) => r.winner === null && r.end_time === null && (r.start_time ?? 0) <= time + 0.5)
  const latest = started[started.length - 1]
  if (latest) return latest
  const open = openRally(ws)
  return open && open.end_time === null ? open : null
}

export function nextSuggestion(ws: WorkspaceType, after: number): SuggestionType | null {
  return ws.suggestions.find((s) => s.time > after + 0.05) ?? null
}
