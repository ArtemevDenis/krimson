import { request } from '@/shared/api/client'
import { jobSchema, type JobType } from '@/shared/api/schemas'

const POLL_MS = 1000

export function fetchJob(id: number): Promise<JobType> {
  return request(`/api/jobs/${id}`, jobSchema)
}

/** Polls until the job finishes; returns a function that stops polling. */
export function watchJob(id: number, onUpdate: (job: JobType) => void): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const tick = async () => {
    try {
      const job = await fetchJob(id)
      if (stopped) return
      onUpdate(job)
      if (job.status === 'done' || job.status === 'failed') return
    } catch {
      // transient errors (server restart) — keep polling
    }
    if (!stopped) timer = setTimeout(tick, POLL_MS)
  }
  void tick()

  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
