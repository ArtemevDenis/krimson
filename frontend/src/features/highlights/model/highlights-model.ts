import { createEffect, createEvent, createStore, sample } from 'effector'
import { errorMessage } from '@/shared/api/client'
import { watchJob } from '@/shared/api/jobs-api'
import type { HighlightGroupType, HighlightRallyType, JobType } from '@/shared/api/schemas'
import { fetchHighlights, postExport, type ExportRequestType } from '../api/highlights-api'

export type ExportStateType = { groupKey: string; job: JobType }

export const loadHighlightsFx = createEffect(fetchHighlights)
export const exportFx = createEffect(({ body }: { groupKey: string; body: ExportRequestType }) => postExport(body))

export const groupToggled = createEvent<{ groupKey: string; rallyId: number }>()
export const jobUpdated = createEvent<JobType>()

export const highlightsStore = createStore<HighlightGroupType[]>([]).on(loadHighlightsFx.doneData, (_, g) => g)

/** Unchecked rallies per group; everything is included by default. */
export const excludedStore = createStore<Record<string, number[]>>({})
  .on(groupToggled, (state, { groupKey, rallyId }) => {
    const current = state[groupKey] ?? []
    const next = current.includes(rallyId) ? current.filter((id) => id !== rallyId) : [...current, rallyId]
    return { ...state, [groupKey]: next }
  })
  .reset(loadHighlightsFx.done)

export const exportsStore = createStore<ExportStateType[]>([])
  .on(exportFx.done, (list, { params, result }) => [{ groupKey: params.groupKey, job: result }, ...list])
  .on(jobUpdated, (list, job) => list.map((e) => (e.job.id === job.id ? { ...e, job } : e)))

export const highlightsErrorStore = createStore<string | null>(null)
  .on([loadHighlightsFx.failData, exportFx.failData], (_, e) => errorMessage(e))
  .reset(loadHighlightsFx.done, exportFx.done)

const watchExportFx = createEffect((job: JobType) => {
  watchJob(job.id, jobUpdated)
})

sample({ clock: exportFx.doneData, target: watchExportFx })

export function includedRallies(group: HighlightGroupType, excluded: Record<string, number[]>): HighlightRallyType[] {
  const skip = excluded[group.key] ?? []
  return group.rallies.filter((r) => !skip.includes(r.rally_id))
}
