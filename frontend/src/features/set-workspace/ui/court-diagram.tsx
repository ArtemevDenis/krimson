import type { PlayerType, RallyStateType } from '@/shared/api/schemas'
import { POSITION_SHORT, shortName } from '@/shared/lib/volleyball'
import { COURT_ZONES, playerInZone } from '../model/rally-logic'

type Props = {
  state: RallyStateType
  players: Map<number, PlayerType>
  onPick: (number: number) => void
}

export function CourtDiagram({ state, players, onPick }: Props) {
  return (
    <div class="flex flex-col gap-1">
      <div class="h-1 rounded bg-zinc-500" title="Сетка" />
      <div class="grid grid-cols-3 gap-1">
        {COURT_ZONES.flat().map((zone) => {
          const id = playerInZone(state, zone)
          const p = id !== undefined ? players.get(id) : undefined
          const isLibero = p?.position === 'L'
          const isServer = state.server_id === id
          return (
            <button
              key={zone}
              type="button"
              disabled={p?.number === null || !p}
              onClick={() => p?.number !== null && p?.number !== undefined && onPick(p.number)}
              class={`relative flex flex-col items-center rounded-md border px-1 py-1.5 text-center hover:border-rose-500 ${
                isLibero ? 'border-orange-500/60 bg-orange-950/40' : 'border-zinc-800 bg-zinc-950'
              }`}
            >
              <span class="absolute top-0.5 left-1 text-[10px] text-zinc-600">{zone}</span>
              {isServer && <span class="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-300" />}
              <span class="text-lg leading-tight font-bold tabular">{p?.number ?? '?'}</span>
              <span class="w-full truncate text-[11px] text-zinc-400">{shortName(p)}</span>
              {p && <span class="text-[10px] text-zinc-500">{POSITION_SHORT[p.position]}</span>}
            </button>
          )
        })}
      </div>
      <div class="text-center text-[10px] text-zinc-600">наша площадка, вид от задней линии</div>
    </div>
  )
}
