import { createEffect, createStore, sample } from 'effector'
import { errorMessage } from '@/shared/api/client'
import type { MatchSummaryType, VenueType } from '@/shared/api/schemas'
import { currentTeamIdStore } from '@/shared/model/team-model'
import {
  fetchMatch,
  fetchMatches,
  fetchVenues,
  patchMatch,
  postMatch,
  postSet,
  postVenue,
  removeMatch,
  removeSet,
  type MatchDraftType,
} from '../api/matches-api'

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

export const loadVenuesFx = createEffect(fetchVenues)
export const createVenueFx = createEffect(postVenue)
export const updateMatchFx = createEffect(({ id, patch }: { id: number; patch: Partial<Omit<MatchDraftType, 'team_id'>> }) =>
  patchMatch(id, patch),
)

export const venuesStore = createStore<VenueType[]>([])
  .on(loadVenuesFx.doneData, (_, list) => list)
  .on(createVenueFx.doneData, (list, v) => (list.some((x) => x.id === v.id) ? list : [...list, v].sort((a, b) => a.name.localeCompare(b.name))))

export const matchesStore = createStore<MatchSummaryType[]>([])
  .on(loadMatchesFx.doneData, (_, list) => list)
  .on(createMatchFx.doneData, (list, m) => [m, ...list])
  .on(deleteMatchFx.doneData, (list, id) => list.filter((m) => m.id !== id))
  .on(updateMatchFx.doneData, (list, m) => list.map((x) => (x.id === m.id ? m : x)))

export const matchStore = createStore<MatchSummaryType | null>(null)
  .on(loadMatchFx.doneData, (_, m) => m)
  .on(deleteSetFx.doneData, (_, m) => m)
  .on(updateMatchFx.doneData, (current, m) => (current?.id === m.id ? m : current))

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
