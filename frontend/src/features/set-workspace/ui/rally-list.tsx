import { useEffect, useRef } from 'preact/hooks'
import type { PlayerType, RallyType, SuggestionType } from '@/shared/api/schemas'
import { formatTime } from '@/shared/lib/format'
import { EVALUATION_LABELS, EVALUATION_TONE, SKILL_LABELS, playerLabel } from '@/shared/lib/volleyball'
import { EmptyState } from '@/shared/ui/feedback'
import { formatActionCode } from '../model/code-parser'

type Props = {
  rallies: RallyType[]
  suggestions: SuggestionType[]
  activeSuggestionId: number | null
  onSuggestion: (s: SuggestionType) => void
  players: Map<number, PlayerType>
  selectedId: number | null
  playingId: number | null
  onSelect: (id: number) => void
  onPlay: (rally: RallyType) => void
  onSetBoundary: (id: number, which: 'start_time' | 'end_time') => void
  onToggleStar: (rally: RallyType) => void
  onDelete: (id: number) => void
  onDeleteAction: (id: number) => void
}

export function RallyList(props: Props) {
  const { rallies, players, selectedId, playingId } = props
  const listRef = useRef<HTMLOListElement>(null)

  // Keep the newest rally in view during live tagging
  useEffect(() => {
    if (selectedId === null) listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [rallies.length, selectedId])

  if (rallies.length === 0) {
    return <EmptyState>Розыгрышей пока нет. Нажмите «[» на подаче или сразу введите код, например s#.</EmptyState>
  }

  return (
    <ol ref={listRef} class="flex max-h-[60vh] flex-col gap-1 overflow-y-auto pr-1">
      {rallies.map((r) => {
        const selected = r.id === selectedId
        const playing = r.id === playingId
        const hints = props.suggestions.filter(
          (s) => r.start_time !== null && r.end_time !== null && s.time >= r.start_time && s.time <= r.end_time,
        )
        const border = r.winner === 'us' ? 'border-l-rose-500' : r.winner === 'them' ? 'border-l-slate-500' : 'border-l-amber-400'
        return (
          <li
            key={r.id}
            class={`rounded-md border border-l-4 ${border} px-2.5 py-1.5 text-sm ${
              selected ? 'border-sky-600 bg-sky-950/40' : playing ? 'border-zinc-700 bg-zinc-800/60' : 'border-zinc-800 bg-zinc-950'
            }`}
          >
            <div class="flex items-center gap-2">
              <button type="button" class="flex flex-1 items-center gap-2 text-left" onClick={() => props.onSelect(r.id)}>
                <span class="w-7 text-xs text-zinc-500 tabular">#{r.index + 1}</span>
                <span class="w-12 font-semibold tabular">
                  {r.state ? `${r.state.our_score}:${r.state.their_score}` : '—'}
                </span>
                <span class="text-xs text-zinc-500 tabular">
                  {formatTime(r.start_time)}–{formatTime(r.end_time)}
                </span>
                {r.state?.setter_zone && <span class="text-xs text-zinc-600">P{r.state.setter_zone}</span>}
                {r.source === 'auto' && <span class="rounded bg-violet-900/60 px-1 text-[10px] text-violet-200">авто</span>}
                {r.substitutions.length > 0 && <span class="text-[10px] text-sky-300">замена</span>}
              </button>
              <button
                type="button"
                class={`text-base ${r.tags.includes('star') ? 'text-amber-300' : 'text-zinc-700 hover:text-zinc-400'}`}
                onClick={() => props.onToggleStar(r)}
                title="В избранное"
              >
                ★
              </button>
              <button type="button" class="text-xs text-zinc-400 hover:text-white" onClick={() => props.onPlay(r)} title="Проиграть">
                ▶
              </button>
            </div>

            {hints.length > 0 && (
              <div class="mt-1 flex flex-wrap gap-1 pl-9">
                {hints.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={`Подсказка ${formatTime(s.time)}, уверенность ${Math.round(s.confidence * 100)}%`}
                    class={`rounded border border-dashed px-1.5 py-0.5 font-mono text-xs ${
                      s.id === props.activeSuggestionId ? 'border-sky-400 bg-sky-900 text-white' : 'border-sky-800 text-sky-300 hover:border-sky-500'
                    }`}
                    onClick={() => props.onSuggestion(s)}
                  >
                    {s.player_id !== null ? (players.get(s.player_id)?.number ?? '') : ''}
                    {s.skill}?
                  </button>
                ))}
              </div>
            )}

            {r.actions.length > 0 && (
              <div class="mt-1 flex flex-wrap gap-1 pl-9">
                {r.actions.map((a) => {
                  const player = a.player_id !== null ? players.get(a.player_id) : undefined
                  return (
                    <span
                      key={a.id}
                      class="group inline-flex items-center gap-1 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs"
                      title={`${playerLabel(player)} — ${SKILL_LABELS[a.skill]}: ${EVALUATION_LABELS[a.skill][a.evaluation]}`}
                    >
                      <span class={EVALUATION_TONE[a.evaluation]}>{formatActionCode(player?.number, a.skill, a.evaluation)}</span>
                      {selected && (
                        <button type="button" class="text-zinc-500 hover:text-red-400" onClick={() => props.onDeleteAction(a.id)}>
                          ×
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            )}

            {selected && (
              <div class="mt-2 flex flex-wrap gap-1.5 pl-9 text-xs">
                <button type="button" class="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" onClick={() => props.onSetBoundary(r.id, 'start_time')}>
                  начало = сейчас
                </button>
                <button type="button" class="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" onClick={() => props.onSetBoundary(r.id, 'end_time')}>
                  конец = сейчас
                </button>
                <button
                  type="button"
                  class="ml-auto rounded bg-red-950 px-2 py-0.5 text-red-200 hover:bg-red-900"
                  onClick={() => {
                    if (confirm(`Удалить розыгрыш #${r.index + 1}?`)) props.onDelete(r.id)
                  }}
                >
                  удалить розыгрыш
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
