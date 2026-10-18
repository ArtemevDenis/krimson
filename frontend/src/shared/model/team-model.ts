import { createEffect, createEvent, createStore, sample } from 'effector'
import { z } from 'zod'
import { request } from '@/shared/api/client'
import { teamSchema, type TeamType } from '@/shared/api/schemas'

const STORAGE_KEY = 'krimson.teamId'

function readStoredTeamId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? Number(raw) : null
  } catch {
    return null
  }
}

export const loadTeamsFx = createEffect(() => request('/api/teams', z.array(teamSchema)))
export const createTeamFx = createEffect((name: string) =>
  request('/api/teams', teamSchema, { method: 'POST', body: { name } }),
)
export const renameTeamFx = createEffect(({ id, name }: { id: number; name: string }) =>
  request(`/api/teams/${id}`, teamSchema, { method: 'PATCH', body: { name } }),
)

export const teamSelected = createEvent<number>()

export const teamsStore = createStore<TeamType[]>([])
  .on(loadTeamsFx.doneData, (_, teams) => teams)
  .on(createTeamFx.doneData, (teams, team) => [...teams, team])
  .on(renameTeamFx.doneData, (teams, team) => teams.map((t) => (t.id === team.id ? team : t)))

export const currentTeamIdStore = createStore<number | null>(readStoredTeamId())
  .on(teamSelected, (_, id) => id)
  .on(createTeamFx.doneData, (_, team) => team.id)

export const teamsLoadedStore = createStore(false).on(loadTeamsFx.finally, () => true)

// Fall back to the first team if the remembered one is gone
sample({
  clock: loadTeamsFx.doneData,
  source: currentTeamIdStore,
  filter: (id, teams) => teams.length > 0 && !teams.some((t) => t.id === id),
  fn: (_, teams) => teams[0]!.id,
  target: teamSelected,
})

currentTeamIdStore.watch((id) => {
  try {
    if (id !== null) localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // storage unavailable — selection just won't persist
  }
})
