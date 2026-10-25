import type { SuggestionType } from '@/shared/api/schemas'
import { formatPct, formatTime } from '@/shared/lib/format'
import { SKILL_LABELS } from '@/shared/lib/volleyball'
import { Button } from '@/shared/ui/button'

type Props = {
  pendingCount: number
  active: SuggestionType | null
  onNext: () => void
  onReplay: () => void
  onFreeze: () => void
  onClose: () => void
  boxRejected: boolean
  onToggleBox: () => void
}

export function SuggestionBar({ pendingCount, active, onNext, onReplay, onFreeze, onClose, boxRejected, onToggleBox }: Props) {
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
        {active.player_box && (
          <Button
            size="sm"
            variant={boxRejected ? 'primary' : 'ghost'}
            onClick={onToggleBox}
            title="Голубая рамка не на том, кто касался: действие сохранится без рамки и не пойдёт в обучение узнавания игроков (клавиша ё)"
          >
            {boxRejected ? '✓ без рамки' : 'рамка не та (ё)'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onFreeze} title="Встать на кадр касания — рассмотреть игрока">
          ⏸ касание
        </Button>
        <Button size="sm" variant="ghost" onClick={onReplay} title="Ещё раз: 2 с до касания, пауза на нём и до следующего касания">
          ↻ ещё раз
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          ×
        </Button>
      </span>
      <span class="w-full text-sky-400">
        осталось {pendingCount} · видео: 2 с до касания, пауза на нём, затем до следующего касания — оценивайте по тому, что было дальше
      </span>
    </div>
  )
}
