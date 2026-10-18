import type { SuggestionType } from '@/shared/api/schemas'
import { formatPct, formatTime } from '@/shared/lib/format'
import { SKILL_LABELS } from '@/shared/lib/volleyball'
import { Button } from '@/shared/ui/button'

type Props = {
  pendingCount: number
  active: SuggestionType | null
  onNext: () => void
  onReplay: () => void
  onClose: () => void
}

export function SuggestionBar({ pendingCount, active, onNext, onReplay, onClose }: Props) {
  if (pendingCount === 0) return null
  if (!active) {
    return (
      <div class="flex items-center gap-3 rounded-md border border-sky-900 bg-sky-950/40 px-3 py-1.5 text-xs text-sky-100">
        <span>Подсказок к проверке: {pendingCount}</span>
        <Button size="sm" onClick={onNext}>
          Проверять подсказки (Enter в пустой строке)
        </Button>
      </div>
    )
  }
  return (
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-sky-700 bg-sky-950/60 px-3 py-1.5 text-xs text-sky-100">
      <span class="text-sm font-semibold">
        {SKILL_LABELS[active.skill]} <span class="font-mono">{active.skill}</span>
      </span>
      <span class="tabular text-sky-300">{formatTime(active.time)}</span>
      {active.player_confidence !== null && (
        <span class="text-sky-300">игрок угадан на {formatPct(active.player_confidence)} — номер уже в строке</span>
      )}
      <span class="text-sky-300">уверенность {formatPct(active.confidence)}</span>
      <span class="text-sky-200">
        Введите <code class="text-white">номер+оценку</code> (<code>31+</code>), другой элемент (<code>31d+</code>), <code>x</code> — не то,
        Enter — пропустить
      </span>
      <span class="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" onClick={onReplay}>
          ↻ ещё раз
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          ×
        </Button>
      </span>
      <span class="w-full text-sky-400">осталось {pendingCount}</span>
    </div>
  )
}
