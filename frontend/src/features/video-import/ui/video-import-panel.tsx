import { useEffect, useState } from 'preact/hooks'
import { errorMessage } from '@/shared/api/client'
import type { VideoType } from '@/shared/api/schemas'
import { formatTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ErrorBanner, ProgressBar } from '@/shared/ui/feedback'
import { Field, Input } from '@/shared/ui/form'
import { fetchVideos, importVideoByPath, uploadVideo } from '../api/videos-api'

type Props = {
  onAttach: (videoId: number) => void
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function VideoImportPanel({ onAttach }: Props) {
  const [videos, setVideos] = useState<VideoType[]>([])
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  useEffect(() => {
    fetchVideos().then(setVideos).catch((e: unknown) => setError(errorMessage(e)))
  }, [])

  const run = async (task: () => Promise<VideoType>) => {
    setPending(true)
    setError(null)
    try {
      const video = await task()
      onAttach(video.id)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
      setUploadProgress(null)
    }
  }

  return (
    <div class="flex flex-col gap-4">
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <form
        class="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (path.trim()) void run(() => importVideoByPath(path))
        }}
      >
        <Field label="Путь к файлу на диске (без копирования — быстрее для больших записей)" class="flex-1">
          <Input
            value={path}
            placeholder="/Users/.../video/VID_20260328_185649.mp4"
            onInput={(e) => setPath(e.currentTarget.value)}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={pending || !path.trim()}>
          Подключить
        </Button>
      </form>

      <div class="flex items-center gap-3">
        <label class={`cursor-pointer rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 ${pending ? 'pointer-events-none opacity-40' : ''}`}>
          Загрузить файл…
          <input
            type="file"
            accept="video/*"
            class="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              if (file) void run(() => uploadVideo(file, setUploadProgress))
            }}
          />
        </label>
        <span class="text-xs text-zinc-500">файл будет скопирован в папку data/uploads</span>
      </div>
      {uploadProgress !== null && <ProgressBar value={uploadProgress} label="Загрузка" />}

      {videos.length > 0 && (
        <div class="flex flex-col gap-1">
          <div class="text-xs text-zinc-400">Или выберите уже подключённое видео:</div>
          <ul class="flex flex-col divide-y divide-zinc-800 rounded-md border border-zinc-800">
            {videos.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-800"
                  onClick={() => onAttach(v.id)}
                >
                  <span class="flex-1 truncate" title={v.original_path}>
                    {fileName(v.original_path)}
                  </span>
                  <span class="text-xs text-zinc-500 tabular">{formatTime(v.duration)}</span>
                  <span class="text-xs text-zinc-500">{v.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
