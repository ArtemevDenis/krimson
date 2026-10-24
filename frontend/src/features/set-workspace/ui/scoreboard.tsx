import type { PlayerType, RallyStateType, SubstitutionType } from '@/shared/api/schemas'
import { playerLabel } from '@/shared/lib/volleyball'

type Props = {
  teamName: string
  opponent: string
  setNumber: number
  state: RallyStateType | null
  finished: boolean
  players: Map<number, PlayerType>
  pendingSubs: SubstitutionType[]
  hasLibero: boolean
  onClearSubs: () => void
  onQueueSub: (sub: SubstitutionType) => void
}

const DUE_LABELS = { serve_lost: 'подача потеряна', front_row: 'дошёл до передней линии' } as const

function pendingLabel(sub: SubstitutionType, players: Map<number, PlayerType>): string {
  if (sub.kind === 'libero_out') return 'либеро не выходит'
  if (sub.kind === 'libero_in') return 'либеро выходит'
  const label = `${playerLabel(players.get(sub.out_id ?? -1))} → ${playerLabel(players.get(sub.in_id ?? -1))}`
  return sub.kind === 'serve' ? `${label} (на подачу)` : label
}

export function Scoreboard({ teamName, opponent, setNumber, state, finished, players, pendingSubs, hasLibero, onClearSubs, onQueueSub }: Props) {
  const queued = (kind: SubstitutionType['kind']) => pendingSubs.some((s) => s.kind === kind)
  const returnQueued = (inId: number) => pendingSubs.some((s) => s.out_id === inId)
  const serveDot = (side: 'us' | 'them') =>
    state?.serving === side ? <span class="inline-block h-2.5 w-2.5 rounded-full bg-amber-300" title="Подача" /> : <span class="inline-block h-2.5 w-2.5" />

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-3 rounded-md bg-zinc-950 px-4 py-2">
        <div class="flex items-center gap-2 text-sm font-medium">
          {serveDot('us')}
          {teamName}
        </div>
        <div class="text-3xl font-bold tabular">
          <span class="text-rose-400">{state?.our_score ?? 0}</span>
          <span class="mx-1 text-zinc-600">:</span>
          <span>{state?.their_score ?? 0}</span>
        </div>
        <div class="flex items-center gap-2 text-sm font-medium">
          {opponent}
          {serveDot('them')}
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span>Партия {setNumber}</span>
        {state?.setter_zone && <span>Расстановка P{state.setter_zone}</span>}
        {state?.server_id && <span>Подаёт {playerLabel(players.get(state.server_id))}</span>}
        {finished && <span class="rounded bg-emerald-900 px-1.5 py-0.5 text-emerald-200">партия завершена</span>}
      </div>
      {state?.serve_subs.map((s) => (
        <div key={s.in_id} class={`flex items-center gap-2 rounded px-2 py-1 text-xs ${s.due ? 'bg-amber-950/60 text-amber-200' : 'bg-zinc-900 text-zinc-400'}`}>
          {playerLabel(players.get(s.in_id))} на подаче вместо {playerLabel(players.get(s.out_id))}
          {s.due && <span>— {DUE_LABELS[s.due]}</span>}
          {!returnQueued(s.in_id) && (
            <button
              type="button"
              class="ml-auto underline hover:text-white"
              onClick={() => onQueueSub({ out_id: s.in_id, in_id: s.out_id, kind: 'regular', role: null })}
            >
              вернуть {playerLabel(players.get(s.out_id))}
            </button>
          )}
        </div>
      ))}
      {hasLibero && state && (state.libero_out || state.libero_replaces !== null) && !queued('libero_out') && !queued('libero_in') && (
        <div class="flex items-center gap-2 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-400">
          {state.libero_out ? 'Либеро не выходит, центральный остаётся в задней линии' : `Либеро за ${playerLabel(players.get(state.libero_replaces ?? -1))}`}
          <button
            type="button"
            class="ml-auto underline hover:text-white"
            onClick={() => onQueueSub({ out_id: null, in_id: null, kind: state.libero_out ? 'libero_in' : 'libero_out', role: null })}
          >
            {state.libero_out ? 'либеро выходит' : 'либеро не выходит'}
          </button>
        </div>
      )}
      {pendingSubs.length > 0 && (
        <div class="flex items-center gap-2 rounded bg-sky-950/60 px-2 py-1 text-xs text-sky-200">
          Замены к следующему розыгрышу:
          {pendingSubs.map((s, i) => (
            <span key={i}>{pendingLabel(s, players)}</span>
          ))}
          <button type="button" class="ml-auto hover:text-white" onClick={onClearSubs}>
            отменить
          </button>
        </div>
      )}
    </div>
  )
}
