import { z } from 'zod'
import { request } from '@/shared/api/client'
import { jobSchema, videoSchema, type VideoType } from '@/shared/api/schemas'

export const fetchVideos = () => request('/api/videos', z.array(videoSchema))
export const fetchVideo = (id: number) => request(`/api/videos/${id}`, videoSchema)
export const importVideoByPath = (path: string) => request('/api/videos/import', videoSchema, { method: 'POST', body: { path } })
export const reprocessVideo = (id: number) => request(`/api/videos/${id}/reprocess`, videoSchema, { method: 'POST' })
export const fetchActiveJobs = () => request('/api/jobs?active=true', z.array(jobSchema))

/** XHR instead of fetch: multi-GB uploads need progress reporting. */
export function uploadVideo(file: File, onProgress: (value: number) => void): Promise<VideoType> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    xhr.open('POST', '/api/videos/upload')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(videoSchema.parse(JSON.parse(xhr.responseText)))
      } else {
        reject(new Error(`Загрузка не удалась: ${xhr.status} ${xhr.responseText}`))
      }
    }
    xhr.onerror = () => reject(new Error('Загрузка не удалась: сетевая ошибка'))
    xhr.send(form)
  })
}
