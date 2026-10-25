import { request } from '@/shared/api/client'
import { framePersonsSchema, marksStateSchema, peopleWindowSchema } from '@/shared/api/schemas'


export type BoxType = [number, number, number, number]

export const fetchFramePersons = (setId: number, time: number) =>
  request(`/api/sets/${setId}/persons?time=${time.toFixed(3)}`, framePersonsSchema)
export const fetchMarks = (setId: number) => request(`/api/sets/${setId}/player-marks`, marksStateSchema)
export const postMark = (setId: number, mark: { time: number; box: BoxType; player_id: number }) =>
  request(`/api/sets/${setId}/player-marks`, marksStateSchema, { method: 'POST', body: mark })
export const removeMark = (id: number) => request(`/api/player-marks/${id}`, marksStateSchema, { method: 'DELETE' })
export const fetchPeople = (setId: number, start: number, end: number) =>
  request(`/api/sets/${setId}/people?start=${start.toFixed(2)}&end=${end.toFixed(2)}`, peopleWindowSchema)
export const postIgnore = (setId: number, person: { time: number; box: BoxType }) =>
  request(`/api/sets/${setId}/ignored`, marksStateSchema, { method: 'POST', body: person })
export const removeIgnore = (id: number) => request(`/api/ignored/${id}`, marksStateSchema, { method: 'DELETE' })
export const postMarks = (setId: number, marks: { time: number; box: BoxType; player_id: number }[]) =>
  request(`/api/sets/${setId}/player-marks/batch`, marksStateSchema, { method: 'POST', body: marks })
