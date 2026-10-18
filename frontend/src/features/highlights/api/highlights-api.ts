import { z } from 'zod'
import { request } from '@/shared/api/client'
import { highlightGroupSchema, jobSchema } from '@/shared/api/schemas'

export type ExportRequestType = {
  title: string
  items: { video_id: number; start: number; end: number }[]
  pre: number
  post: number
}

export const fetchHighlights = (matchId: number) => request(`/api/highlights/matches/${matchId}`, z.array(highlightGroupSchema))
export const postExport = (body: ExportRequestType) => request('/api/highlights/export', jobSchema, { method: 'POST', body })
