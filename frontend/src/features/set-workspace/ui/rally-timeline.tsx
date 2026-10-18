import type { RallyType } from '@/shared/api/schemas'

type Props = {
  rallies: RallyType[]
  duration: number
  time: number
  selectedId: number | null
  onSeek: (seconds: number) => void
  onSelect: (id: number) => void
}

export function RallyTimeline({ rallies, duration, time, selectedId, onSeek, onSelect }: Props) {
  if (duration <= 0) return null
  const pct = (t: number) => `${(t / duration) * 100}%`

  return (
    <div
      class="relative h-6 cursor-pointer rounded bg-zinc-900"
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect()
        onSeek(((e.clientX - box.left) / box.width) * duration)
      }}
    >
      {rallies.map((r) => {
        if (r.start_time === null) return null
        const end = r.end_time ?? r.start_time + 2
        const tone = r.winner === 'us' ? 'bg-rose-500/80' : r.winner === 'them' ? 'bg-slate-500/80' : 'bg-amber-400/70'
        return (
          <div
            key={r.id}
            title={`#${r.index + 1}`}
            class={`absolute top-1 bottom-1 rounded-sm ${tone} ${r.id === selectedId ? 'ring-2 ring-white' : ''}`}
            style={{ left: pct(r.start_time), width: `max(3px, ${pct(end - r.start_time)})` }}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(r.id)
            }}
          />
        )
      })}
      <div class="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: pct(time) }} />
    </div>
  )
}
