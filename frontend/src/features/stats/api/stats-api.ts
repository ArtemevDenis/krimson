import { request } from '@/shared/api/client'
import { statsSchema } from '@/shared/api/schemas'

export const fetchMatchStats = (matchId: number, setId: number | null) =>
  request(`/api/stats/matches/${matchId}${setId !== null ? `?set_id=${setId}` : ''}`, statsSchema)

export const fetchSeasonStats = (teamId: number, from: string | null, to: string | null) => {
  const params = new URLSearchParams()
  if (from) params.set('date_from', from)
  if (to) params.set('date_to', to)
  const qs = params.toString()
  return request(`/api/stats/teams/${teamId}${qs ? `?${qs}` : ''}`, statsSchema)
}
