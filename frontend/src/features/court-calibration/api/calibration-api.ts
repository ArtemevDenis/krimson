import { z } from 'zod'
import { request } from '@/shared/api/client'
import { calibrationSchema } from '@/shared/api/schemas'

const listSchema = z.array(calibrationSchema)

export const fetchCalibrations = (videoId: number) => request(`/api/videos/${videoId}/calibrations`, listSchema)

export const postCalibration = (videoId: number, fromTime: number, points: [number, number][]) =>
  request(`/api/videos/${videoId}/calibrations`, listSchema, { method: 'POST', body: { from_time: fromTime, points } })

export const removeCalibration = (id: number) => request(`/api/videos/calibrations/${id}`, listSchema, { method: 'DELETE' })
