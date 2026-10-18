import { z } from 'zod'
import { request } from '@/shared/api/client'
import { jobSchema, learningScopeSchema, learningSummarySchema, modelVersionSchema } from '@/shared/api/schemas'

export type LearningJobKindType = 'evaluate' | 'tune' | 'ball_dataset' | 'train_ball' | 'players_dataset' | 'train_players'
export type ModelKindType = 'params' | 'ball' | 'players'

const versionsSchema = z.record(z.string(), z.array(modelVersionSchema))
const q = (scope: string) => `scope=${encodeURIComponent(scope)}`

export const fetchLearningScopes = () => request('/api/learning/scopes', z.array(learningScopeSchema))

export const fetchLearningSummary = (scope: string) => request(`/api/learning/summary?${q(scope)}`, learningSummarySchema)

export const runLearningJob = (kind: LearningJobKindType, scope: string) =>
  request(`/api/learning/run/${kind}?${q(scope)}`, jobSchema, { method: 'POST' })

/** Also the rollback: activate any earlier version, or null to fall back to the general/stock model. */
export const activateVersion = (scope: string, kind: ModelKindType, version: string | null) =>
  request('/api/learning/versions/activate', versionsSchema, { method: 'POST', body: { scope, kind, version } })

export const deleteVersion = (scope: string, kind: ModelKindType, version: string) =>
  request('/api/learning/versions/delete', versionsSchema, { method: 'POST', body: { scope, kind, version } })
