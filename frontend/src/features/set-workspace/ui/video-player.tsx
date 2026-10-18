import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { playerController } from '../model/player-controller'

type Props = {
  src: string
  onTime: (seconds: number) => void
  onDuration: (seconds: number) => void
  overlay?: ComponentChildren
}

const RATES = [0.5, 1, 1.5, 2, 3]

export function VideoPlayer({ src, onTime, onDuration, overlay }: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const [rate, setRate] = useState(1)

  useEffect(() => {
    playerController.attach(ref.current)
    return () => playerController.attach(null)
  }, [])

  return (
    <div class="flex flex-col gap-1.5">
      <div class="relative">
      <video
        ref={ref}
        src={src}
        controls
        preload="auto"
        class="aspect-video w-full rounded-md bg-black"
        onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
        onSeeked={(e) => onTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          onDuration(e.currentTarget.duration)
          e.currentTarget.playbackRate = rate
        }}
      />
      {overlay}
      </div>
      <div class="flex items-center gap-1 text-xs text-zinc-400">
        Скорость:
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            class={`rounded px-1.5 py-0.5 tabular ${r === rate ? 'bg-rose-600 text-white' : 'hover:bg-zinc-800'}`}
            onClick={() => {
              setRate(r)
              playerController.setRate(r)
            }}
          >
            {r}×
          </button>
        ))}
        <span class="ml-auto text-zinc-500">Tab — пауза · Alt+←/→ — 2 с · Alt+Shift+←/→ — 10 с</span>
      </div>
    </div>
  )
}
