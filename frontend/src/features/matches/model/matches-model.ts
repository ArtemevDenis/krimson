import { createEffect, createStore, sample } from 'effector'
import { errorMessage } from '@/shared/api/client'
import type { MatchSummaryType } from '@/shared/api/schemas'
import { currentTeamIdStore } from '@/shared/model/team-model'
import { fetchMatch, fetchMatches, postMatch, postSet, removeMatch, removeSet, type MatchDraftType } from '../api/matches-api'

export const loadMatchesFx = createEffect(fetchMatches)
export const createMatchFx = createEffect((draft: MatchDraftType) => postMatch(draft))
export const deleteMatchFx = createEffect(async (id: number) => {
  await removeMatch(id)
  return id
})

export const loadMatchFx = createEffect(fetchMatch)
export const createSetFx = createEffect(postSet)
export const deleteSetFx = createEffect(async ({ setId, matchId }: { setId: number; matchId: number }) => {
  await removeSet(setId)
  return fetchMatch(matchId)
})

export const matchesStore = createStore<MatchSummaryType[]>([])
  .on(loadMatchesFx.doneData, (_, list) => list)
  .on(createMatchFx.doneData, (list, m) => [m, ...list])
  .on(deleteMatchFx.doneData, (list, id) => list.filter((m) => m.id !== id))

export const matchStore = createStore<MatchSummaryType | null>(null)
  .on(loadMatchFx.doneData, (_, m) => m)
  .on(deleteSetFx.doneData, (_, m) => m)

export const matchesErrorStore = createStore<string | null>(null)
  .on([loadMatchesFx.failData, createMatchFx.failData, loadMatchFx.failData, createSetFx.failData, deleteSetFx.failData], (_, e) =>
    errorMessage(e),
  )
  .reset([loadMatchesFx.done, createMatchFx.done, loadMatchFx.done])

sample({
  clock: currentTeamIdStore,
  filter: (id): id is number => id !== null,
  target: loadMatchesFx,
})
