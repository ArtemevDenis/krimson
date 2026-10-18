import type { VideoType } from '@/shared/api/schemas'
import { Button } from '@/shared/ui/button'
import { ProgressBar } from '@/shared/ui/feedback'
import { reprocessVideo } from '../api/videos-api'
import { useVideoProcessing } from '../model/use-video-processing'

type Props = {
  video: VideoType
  onChanged: () => void
}

export function VideoProcessingStatus({ video, onChanged }: Props) {
  const { progress, status } = useVideoProcessing(video, onChanged)

  if (status === 'ready') return null
  if (status === 'failed') {
    return (
      <div class="flex items-center gap-3 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-200">
        <span class="flex-1">Не удалось подготовить видео: {video.error ?? 'неизвестная ошибка'}. Можно размечать по оригиналу.</span>
        <Button size="sm" onClick={() => void reprocessVideo(video.id).then(onChanged)}>
          Повторить
        </Button>
      </div>
    )
  }
  return (
    <div class="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2">
      <ProgressBar value={progress} label="Готовлю видео для просмотра (720p, 30 fps). Разметку можно начинать по оригиналу." />
    </div>
  )
}
