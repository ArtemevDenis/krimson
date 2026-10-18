import { request } from '@/shared/api/client'
import {
  jobSchema,
  workspaceSchema,
  type EvaluationType,
  type SideType,
  type SkillType,
  type SubstitutionType,
} from '@/shared/api/schemas'

export type SetPatchType = {
  verified?: boolean
  video_id?: number | null
  lineup?: number[]
  libero_ids?: number[]
  we_serve_first?: boolean
}

export type RallyDraftType = {
  start_time?: number | null
  end_time?: number | null
  winner?: SideType | null
  substitutions?: SubstitutionType[]
  tags?: string[]
}

export type ActionDraftType = {
  player_id: number | null
  skill: SkillType
  evaluation: EvaluationType
  video_time: number | null
  suggestion_id?: number | null
}

export const fetchWorkspace = (setId: number) => request(`/api/sets/${setId}`, workspaceSchema)

export const patchSet = (setId: number, patch: SetPatchType) =>
  request(`/api/sets/${setId}`, workspaceSchema, { method: 'PATCH', body: patch })

export const postRally = (setId: number, draft: RallyDraftType) =>
  request(`/api/sets/${setId}/rallies`, workspaceSchema, { method: 'POST', body: draft })

export const patchRally = (rallyId: number, patch: RallyDraftType) =>
  request(`/api/rallies/${rallyId}`, workspaceSchema, { method: 'PATCH', body: patch })

export const deleteRally = (rallyId: number) => request(`/api/rallies/${rallyId}`, workspaceSchema, { method: 'DELETE' })

export const postAction = (rallyId: number, draft: ActionDraftType) =>
  request(`/api/rallies/${rallyId}/actions`, workspaceSchema, { method: 'POST', body: draft })

export const patchAction = (actionId: number, patch: Partial<ActionDraftType>) =>
  request(`/api/actions/${actionId}`, workspaceSchema, { method: 'PATCH', body: patch })

export const deleteAction = (actionId: number) => request(`/api/actions/${actionId}`, workspaceSchema, { method: 'DELETE' })

export const startAnalysis = (setId: number) => request(`/api/sets/${setId}/analyze`, jobSchema, { method: 'POST', body: {} })

export const patchSuggestion = (id: number, status: 'pending' | 'accepted' | 'rejected') =>
  request(`/api/suggestions/${id}`, workspaceSchema, { method: 'PATCH', body: { status } })
