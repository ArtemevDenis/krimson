import { createEffect, createStore } from 'effector'
import { errorMessage } from '@/shared/api/client'
import type { PlayerStatsType, StatsType } from '@/shared/api/schemas'
import { fetchMatchStats, fetchSeasonStats } from '../api/stats-api'

export const loadMatchStatsFx = createEffect(({ matchId, setId }: { matchId: number; setId: number | null }) =>
  fetchMatchStats(matchId, setId),
)
export const loadSeasonStatsFx = createEffect(({ teamId, from, to }: { teamId: number; from: string | null; to: string | null }) =>
  fetchSeasonStats(teamId, from, to),
)

export const matchStatsStore = createStore<StatsType | null>(null).on(loadMatchStatsFx.doneData, (_, s) => s)
export const seasonStatsStore = createStore<StatsType | null>(null).on(loadSeasonStatsFx.doneData, (_, s) => s)
export const statsErrorStore = createStore<string | null>(null)
  .on([loadMatchStatsFx.failData, loadSeasonStatsFx.failData], (_, e) => errorMessage(e))
  .reset([loadMatchStatsFx.done, loadSeasonStatsFx.done])

type NumericPath = (s: PlayerStatsType) => number

/** Sums player rows into a team total; ratios are recomputed from the summed counts. */
export function teamTotals(players: PlayerStatsType[]): PlayerStatsType {
  const sum = (f: NumericPath) => players.reduce((acc, p) => acc + f(p), 0)
  const ratio = (a: number, b: number) => (b ? a / b : null)
  const serve = { total: sum((p) => p.serve.total), ace: sum((p) => p.serve.ace), error: sum((p) => p.serve.error) }
  const reception = {
    total: sum((p) => p.reception.total),
    perfect: sum((p) => p.reception.perfect),
    positive: sum((p) => p.reception.positive),
    error: sum((p) => p.reception.error),
  }
  const attack = {
    total: sum((p) => p.attack.total),
    kill: sum((p) => p.attack.kill),
    error: sum((p) => p.attack.error),
    blocked: sum((p) => p.attack.blocked),
  }
  return {
    player_id: -1,
    rallies_on_court: 0,
    points: sum((p) => p.points),
    errors: sum((p) => p.errors),
    serve: { ...serve, eff: ratio(serve.ace - serve.error, serve.total) },
    reception: { ...reception, pos_pct: ratio(reception.positive, reception.total), perf_pct: ratio(reception.perfect, reception.total) },
    attack: { ...attack, kill_pct: ratio(attack.kill, attack.total), eff: ratio(attack.kill - attack.error - attack.blocked, attack.total) },
    block: { total: sum((p) => p.block.total), point: sum((p) => p.block.point), error: sum((p) => p.block.error) },
    dig: { total: sum((p) => p.dig.total), positive: sum((p) => p.dig.positive), error: sum((p) => p.dig.error) },
    set: { total: sum((p) => p.set.total), error: sum((p) => p.set.error) },
    faults: { total: sum((p) => p.faults.total ?? 0) },
    raw: {},
  }
}
