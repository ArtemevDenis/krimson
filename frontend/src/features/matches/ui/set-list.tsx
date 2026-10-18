import type { SetSummaryType } from '@/shared/api/schemas'
import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/ui/feedback'

type Props = {
  sets: SetSummaryType[]
  onOpen: (setId: number) => void
  onDelete: (setId: number) => void
}

export function SetList({ sets, onOpen, onDelete }: Props) {
  if (sets.length === 0) return <EmptyState>Добавьте партию — одна запись видео соответствует одной партии.</EmptyState>

  return (
    <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {sets.map((s) => (
        <li key={s.id} class="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5">
          <button type="button" class="flex flex-1 items-center gap-3 text-left" onClick={() => onOpen(s.id)}>
            <span class="text-sm font-semibold">Партия {s.number}</span>
            {s.verified && <span class="text-xs text-emerald-400" title="Проверена — участвует в обучении">✓</span>}
            <span class={`text-lg font-bold tabular ${s.our_score > s.their_score ? 'text-rose-400' : 'text-zinc-300'}`}>
              {s.our_score}:{s.their_score}
            </span>
            <span class="ml-auto text-right text-xs text-zinc-500">
              {s.rally_count} розыгр.
              <br />
              {!s.configured ? 'нет расстановки' : s.video_id === null ? 'нет видео' : ''}
            </span>
          </button>
          <Button
            size="sm"
            variant="ghost"
            title="Удалить партию"
            onClick={() => {
              if (confirm(`Удалить партию ${s.number} со всей разметкой?`)) onDelete(s.id)
            }}
          >
            ✕
          </Button>
        </li>
      ))}
    </ul>
  )
}
