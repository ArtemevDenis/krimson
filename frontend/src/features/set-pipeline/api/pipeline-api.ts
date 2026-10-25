import { z } from 'zod'
import { request } from '@/shared/api/client'
import { jobSchema, pipelineStepSchema } from '@/shared/api/schemas'

export const fetchPipeline = (setId: number) => request(`/api/sets/${setId}/pipeline`, z.array(pipelineStepSchema))
export const startFindRallies = (setId: number) => request(`/api/sets/${setId}/find-rallies`, jobSchema, { method: 'POST' })
export const startDetectPersons = (setId: number) => request(`/api/sets/${setId}/detect-persons`, jobSchema, { method: 'POST' })
export const keepRally = (rallyId: number) => request(`/api/rallies/${rallyId}/keep`, z.unknown(), { method: 'POST' })

const uploadSchema = z.object({ file: z.string(), frames: z.number(), balls: z.number() })
export function uploadDetections(videoId: number, file: File) {
  const body = new FormData()
  body.append('file', file)
  return request(`/api/videos/${videoId}/detections`, uploadSchema, { method: 'POST', body })
}
