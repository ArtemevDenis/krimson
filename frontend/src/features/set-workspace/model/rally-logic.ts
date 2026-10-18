import type { PlayerType, RallyStateType, RallyType, SkillType, WorkspaceType } from '@/shared/api/schemas'

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
    const setter = state?.on_court.map((id) => players.find((p) => p.id === id)).find((p) => p?.position === 'S')
    if (setter) return { ok: true, playerId: setter.id }
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

export function rallyDuration(rally: RallyType): number | null {
  if (rally.start_time === null || rally.end_time === null) return null
  return rally.end_time - rally.start_time
}

export function rallyAtTime(ws: WorkspaceType, time: number): RallyType | null {
  return ws.rallies.find((r) => r.start_time !== null && r.end_time !== null && time >= r.start_time && time <= r.end_time) ?? null
}
