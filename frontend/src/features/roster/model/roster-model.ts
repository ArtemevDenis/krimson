import { createEffect, createStore, sample } from 'effector'
import { errorMessage } from '@/shared/api/client'
import type { PlayerType } from '@/shared/api/schemas'
import { currentTeamIdStore } from '@/shared/model/team-model'
import { createPlayer, fetchPlayers, importPlayers, patchPlayer, removePlayer, type PlayerDraftType } from '../api/roster-api'

export const loadRosterFx = createEffect(fetchPlayers)
export const addPlayerFx = createEffect(({ teamId, draft }: { teamId: number; draft: PlayerDraftType }) => createPlayer(teamId, draft))
export const importRosterFx = createEffect(({ teamId, text, replace }: { teamId: number; text: string; replace: boolean }) =>
  importPlayers(teamId, text, replace),
)
export const updatePlayerFx = createEffect(({ id, patch }: { id: number; patch: Partial<PlayerDraftType> }) => patchPlayer(id, patch))
export const deletePlayerFx = createEffect(async (id: number) => {
  await removePlayer(id)
  return id
})

export const rosterStore = createStore<PlayerType[]>([])
  .on(loadRosterFx.doneData, (_, players) => players)
  .on(importRosterFx.doneData, (_, players) => players)
  .on(addPlayerFx.doneData, (players, p) => sortRoster([...players, p]))
  .on(updatePlayerFx.doneData, (players, p) => sortRoster(players.map((x) => (x.id === p.id ? p : x))))
  .on(deletePlayerFx.doneData, (players, id) => players.filter((p) => p.id !== id))

export const rosterErrorStore = createStore<string | null>(null)
  .on([loadRosterFx.failData, addPlayerFx.failData, importRosterFx.failData, updatePlayerFx.failData, deletePlayerFx.failData], (_, e) =>
    errorMessage(e),
  )
  .reset([loadRosterFx.done, addPlayerFx.done, importRosterFx.done, updatePlayerFx.done])

sample({
  clock: currentTeamIdStore,
  filter: (id): id is number => id !== null,
  target: loadRosterFx,
})

export function sortRoster(players: PlayerType[]): PlayerType[] {
  return [...players].sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name))
}
