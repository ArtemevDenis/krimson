import { createEffect, createEvent, createStore, sample } from 'effector'
import { errorMessage } from '@/shared/api/client'
import { watchJob } from '@/shared/api/jobs-api'
import type { JobType, PipelineStepType } from '@/shared/api/schemas'
import { fetchPipeline, keepRally, startDetectPersons, startFindRallies, uploadDetections } from '../api/pipeline-api'

export const pipelineOpened = createEvent<number>()
export const pipelineClosed = createEvent()

export const loadPipelineFx = createEffect(fetchPipeline)

const watchUntilDone = (job: JobType) =>
  new Promise<JobType>((resolve) => {
    watchJob(job.id, (j) => {
      if (j.status === 'done' || j.status === 'failed') resolve(j)
    })
  })

export const findRalliesFx = createEffect(async (setId: number) => watchUntilDone(await startFindRallies(setId)))
export const detectPersonsFx = createEffect(async (setId: number) => watchUntilDone(await startDetectPersons(setId)))
export const keepRallyFx = createEffect(keepRally)
export const uploadBallFx = createEffect(({ videoId, file }: { videoId: number; file: File }) => uploadDetections(videoId, file))

export const pipelineSetStore = createStore<number | null>(null).on(pipelineOpened, (_, id) => id).reset(pipelineClosed)
export const pipelineStore = createStore<PipelineStepType[]>([])
  .on(loadPipelineFx.doneData, (_, steps) => steps)
  .reset(pipelineClosed)
export const pipelineErrorStore = createStore<string | null>(null)
  .on([loadPipelineFx.failData, findRalliesFx.failData, detectPersonsFx.failData, uploadBallFx.failData, keepRallyFx.failData], (_, e) =>
    errorMessage(e),
  )
  .on([findRalliesFx.doneData, detectPersonsFx.doneData], (current, job) => (job.status === 'failed' ? (job.error ?? 'Ошибка') : current))
  .reset([pipelineClosed, loadPipelineFx.done])

sample({ clock: pipelineOpened, target: loadPipelineFx })

// Anything that changes the set's state reloads the steps (right after the start too: shows "running")
sample({
  clock: [findRalliesFx.done, detectPersonsFx.done, uploadBallFx.done, keepRallyFx.done, findRalliesFx, detectPersonsFx],
  source: pipelineSetStore,
  filter: (id): id is number => id !== null,
  target: loadPipelineFx,
})

/** While a step runs in the background (started here or before a page reload), poll for its progress */
const POLL_MS = 3000
const pollFx = createEffect((setId: number) => new Promise<number>((resolve) => setTimeout(() => resolve(setId), POLL_MS)))
sample({
  clock: loadPipelineFx.done,
  source: pollFx.pending,
  filter: (polling, { result }) => !polling && result.some((s) => s.status === 'running'),
  fn: (_, { params }) => params,
  target: pollFx,
})
sample({
  clock: pollFx.doneData,
  source: pipelineSetStore,
  filter: (current, id) => current === id,
  fn: (_, id) => id,
  target: loadPipelineFx,
})
