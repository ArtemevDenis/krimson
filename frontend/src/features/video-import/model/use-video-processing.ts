import { useEffect, useState } from 'preact/hooks'
import type { VideoType } from '@/shared/api/schemas'
import { fetchActiveJobs, fetchVideo } from '../api/videos-api'

const POLL_MS = 1500

/** Polls a video until its proxy is built; reports proxy job progress meanwhile. */
export function useVideoProcessing(video: VideoType | null, onReady: () => void) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState(video?.status ?? null)

  useEffect(() => {
    setStatus(video?.status ?? null)
    if (!video || video.status === 'ready' || video.status === 'failed') return
    let stopped = false
    const tick = async () => {
      try {
        const [fresh, jobs] = await Promise.all([fetchVideo(video.id), fetchActiveJobs()])
        if (stopped) return
        setStatus(fresh.status)
        const job = jobs.find((j) => j.kind === 'proxy' && j.payload['video_id'] === video.id)
        if (job) setProgress(job.progress)
        if (fresh.status === 'ready' || fresh.status === 'failed') {
          onReady()
          return
        }
      } catch {
        // keep polling
      }
      if (!stopped) setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      stopped = true
    }
  }, [video?.id, video?.status])

  return { progress, status }
}
