import { z } from 'zod'
import { request, requestVoid } from '@/shared/api/client'
import { playerSchema, type PositionType } from '@/shared/api/schemas'

export type PlayerDraftType = {
  number: number | null
  name: string
  position: PositionType
  is_active?: boolean
}

export const fetchPlayers = (teamId: number) => request(`/api/teams/${teamId}/players`, z.array(playerSchema))

export const createPlayer = (teamId: number, draft: PlayerDraftType) =>
  request(`/api/teams/${teamId}/players`, playerSchema, { method: 'POST', body: draft })

export const importPlayers = (teamId: number, text: string, replace: boolean) =>
  request(`/api/teams/${teamId}/players/import`, z.array(playerSchema), { method: 'POST', body: { text, replace } })

export const patchPlayer = (id: number, patch: Partial<PlayerDraftType>) =>
  request(`/api/players/${id}`, playerSchema, { method: 'PATCH', body: patch })

export const removePlayer = (id: number) => requestVoid(`/api/players/${id}`, { method: 'DELETE' })
