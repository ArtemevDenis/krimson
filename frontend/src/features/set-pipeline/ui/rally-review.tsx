import type { RallyType } from '@/shared/api/schemas'
import { formatTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'

type Props = {
  rallies: RallyType[]
  onPlay: (rally: RallyType) => void
  onKeep: (rally: RallyType) => void
  onDelete: (rally: RallyType) => void
  onClose: () => void
}

/** Rallies the whistle finder wasn't sure of (no end whistle): watch, then keep or delete. */
export function RallyReview({ rallies, onPlay, onKeep, onDelete, onClose }: Props) {
  return (
    <div class="flex flex-col gap-1 rounded-md border border-amber-900 bg-amber-950/30 px-3 py-2 text-xs">
      <div class="flex items-center gap-2">
        <b class="text-sm text-amber-200">Розыгрыши под вопросом: {rallies.length}</b>
        <span class="text-amber-300/80">нет свистка конца — проверьте, что это розыгрыш и где он кончается</span>
        <Button size="sm" variant="ghost" class="ml-auto" onClick={onClose}>
          Готово
        </Button>
      </div>
      {rallies.length === 0 && <span class="text-zinc-400">Все проверены.</span>}
      <ul class="flex max-h-56 flex-col gap-1 overflow-y-auto">
        {rallies.map((r) => (
          <li key={r.id} class="flex items-center gap-2 rounded bg-zinc-950 px-2 py-1">
            <span class="w-8 text-zinc-500 tabular">#{r.index + 1}</span>
            <span class="tabular">
              {formatTime(r.start_time)}–{formatTime(r.end_time)}
            </span>
            <span class="text-zinc-500">уверенность {Math.round((r.confidence ?? 0) * 100)}%</span>
            <span class="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => onPlay(r)}>
                ▶ смотреть
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onKeep(r)} title="Это розыгрыш: больше не спрашивать (границы можно поправить [ и ])">
                оставить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(r)} title="Это не розыгрыш">
                удалить
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
