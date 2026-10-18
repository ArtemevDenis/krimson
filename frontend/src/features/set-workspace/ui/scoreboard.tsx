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
  onClearSubs: () => void
}

export function Scoreboard({ teamName, opponent, setNumber, state, finished, players, pendingSubs, onClearSubs }: Props) {
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
      {pendingSubs.length > 0 && (
        <div class="flex items-center gap-2 rounded bg-sky-950/60 px-2 py-1 text-xs text-sky-200">
          Замены к следующему розыгрышу:
          {pendingSubs.map((s, i) => (
            <span key={i}>
              {playerLabel(players.get(s.out_id))} → {playerLabel(players.get(s.in_id))}
            </span>
          ))}
          <button type="button" class="ml-auto hover:text-white" onClick={onClearSubs}>
            отменить
          </button>
        </div>
      )}
    </div>
  )
}
