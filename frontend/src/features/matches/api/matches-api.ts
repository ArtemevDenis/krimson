import { z } from 'zod'
import { request, requestVoid } from '@/shared/api/client'
import { matchSummarySchema, workspaceSchema } from '@/shared/api/schemas'

export type MatchDraftType = {
  team_id: number
  opponent: string
  date: string
  venue?: string | null
}

export const fetchMatches = (teamId: number) => request(`/api/matches?team_id=${teamId}`, z.array(matchSummarySchema))
export const fetchMatch = (id: number) => request(`/api/matches/${id}`, matchSummarySchema)
export const postMatch = (draft: MatchDraftType) => request('/api/matches', matchSummarySchema, { method: 'POST', body: draft })
export const removeMatch = (id: number) => requestVoid(`/api/matches/${id}`, { method: 'DELETE' })
export const postSet = (matchId: number) => request(`/api/matches/${matchId}/sets`, workspaceSchema, { method: 'POST' })
export const removeSet = (setId: number) => requestVoid(`/api/sets/${setId}`, { method: 'DELETE' })
