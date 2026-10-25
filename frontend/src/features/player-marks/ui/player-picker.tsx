import type { IgnoredPersonType, PlayerMarkType, PlayerType } from '@/shared/api/schemas'
import { formatTime } from '@/shared/lib/format'
import { playerLabel } from '@/shared/lib/volleyball'
import { Button } from '@/shared/ui/button'

type Props = {
  frameTime: number | null
  personCount: number
  hasSelection: boolean
  selectedMark: PlayerMarkType | null
  selectedIgnored: IgnoredPersonType | null
  /** The video stopped on this person by itself (auto-stop) */
  asking: boolean
  /** On the court now first, then the rest of the roster */
  onCourt: PlayerType[]
  bench: PlayerType[]
  marksTotal: number
  onPick: (playerId: number) => void
  onUnmark: (markId: number) => void
  onIgnore: () => void
  onUnignore: (ignoreId: number) => void
  /** Players pass: rally index / count, and the step buttons */
  pass?: { index: number; count: number; predictedCount: number; onConfirm: () => void; onSkip: () => void; onBack: () => void } | null
  typed?: string
  onClose: () => void
}

export function PlayerPicker(props: Props) {
  const { frameTime, personCount, hasSelection, selectedMark, selectedIgnored, onCourt, bench } = props
  const button = (p: PlayerType) => (
    <Button
      key={p.id}
      size="sm"
      variant={selectedMark?.player_id === p.id ? 'primary' : 'secondary'}
      disabled={!hasSelection}
      onClick={() => props.onPick(p.id)}
    >
      {playerLabel(p)}
    </Button>
  )
  return (
    <div class="flex flex-col gap-2 rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-100">
      {props.pass && (
        <div class="flex flex-wrap items-center gap-2 border-b border-emerald-900 pb-2">
          <b class="text-sm">
            Проход по игрокам · розыгрыш {props.pass.index + 1} из {props.pass.count}
          </b>
          <Button size="sm" variant="ghost" onClick={props.pass.onBack} disabled={props.pass.index === 0}>
            ← назад
          </Button>
          <Button size="sm" variant="primary" onClick={props.pass.onConfirm}>
            {props.pass.predictedCount ? `Всё верно (${props.pass.predictedCount}) →` : 'Дальше →'} <span class="opacity-70">Enter</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={props.pass.onSkip}>
            пропустить →
          </Button>
          <span class="text-emerald-300">
            номера с «?» — предложение анализатора. Неверный: клик по человеку → игрок (или номер с клавиатуры + Enter)
            {props.typed ? ` · набрано: ${props.typed}` : ''}
          </span>
        </div>
      )}
      <div class="flex flex-wrap items-center gap-2">
        <b class="text-sm">Разметка игроков</b>
        <span class="text-emerald-300">
          кадр {frameTime !== null ? formatTime(frameTime) : '—'} · людей на кадре {personCount} · отметок в партии {props.marksTotal}
        </span>
        <Button size="sm" variant="ghost" class="ml-auto" onClick={props.onClose}>
          Готово
        </Button>
      </div>
      <p class="text-emerald-300">
        {props.asking && hasSelection
          ? 'Видео остановилось: анализатор не узнал этого человека на нашей половине. Кто это? После ответа видео продолжится.'
          : hasSelection
            ? 'Кто это? Выберите игрока.'
            : 'Кликните по человеку в рамке на кадре. Перемотайте видео, чтобы отметить на другом кадре — рамки обновятся.'}
      </p>
      <div class="flex flex-wrap gap-1">{onCourt.map(button)}</div>
      {bench.length > 0 && <div class="flex flex-wrap gap-1 opacity-70">{bench.map(button)}</div>}
      <div class="flex flex-wrap gap-2">
        {hasSelection && !selectedIgnored && (
          <Button size="sm" variant="secondary" onClick={props.onIgnore} title="Судья, тренер, запасной, соперник: больше не спрашивать про него и не давать ему номер">
            Не наш игрок
          </Button>
        )}
        {selectedIgnored && (
          <Button size="sm" variant="ghost" onClick={() => props.onUnignore(selectedIgnored.id)}>
            снять «не наш»
          </Button>
        )}
        {selectedMark && (
          <Button size="sm" variant="ghost" onClick={() => props.onUnmark(selectedMark.id)}>
            снять отметку
          </Button>
        )}
      </div>
    </div>
  )
}
