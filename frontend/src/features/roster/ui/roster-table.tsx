import type { PlayerType, PositionType } from '@/shared/api/schemas'
import { Button } from '@/shared/ui/button'
import { POSITION_LABELS } from '@/shared/lib/volleyball'

type Props = {
  players: PlayerType[]
  onUpdate: (id: number, patch: Partial<Pick<PlayerType, 'number' | 'name' | 'position' | 'is_active'>>) => void
  onDelete: (id: number) => void
}

const CELL_INPUT = 'w-full bg-transparent px-1 py-0.5 outline-none rounded focus:bg-zinc-950 focus:ring-1 focus:ring-rose-500'

export function RosterTable({ players, onUpdate, onDelete }: Props) {
  return (
    <table class="w-full text-sm">
      <thead class="text-left text-xs text-zinc-500">
        <tr>
          <th class="w-16 py-1 font-normal">Номер</th>
          <th class="py-1 font-normal">Имя</th>
          <th class="w-40 py-1 font-normal" title="В каждой партии его можно поменять в расстановке">
            Основное амплуа
          </th>
          <th class="w-24 py-1 font-normal">В составе</th>
          <th class="w-10" />
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id} class={`border-t border-zinc-800 ${p.is_active ? '' : 'opacity-50'}`}>
            <td class="py-1">
              <input
                class={`${CELL_INPUT} tabular`}
                value={p.number ?? ''}
                inputMode="numeric"
                onChange={(e) => {
                  const raw = e.currentTarget.value.trim()
                  onUpdate(p.id, { number: raw === '' ? null : Number(raw) })
                }}
              />
            </td>
            <td class="py-1">
              <input class={CELL_INPUT} value={p.name} onChange={(e) => onUpdate(p.id, { name: e.currentTarget.value })} />
            </td>
            <td class="py-1">
              <select
                class={CELL_INPUT}
                value={p.position}
                onChange={(e) => onUpdate(p.id, { position: e.currentTarget.value as PositionType })}
              >
                {Object.entries(POSITION_LABELS).map(([key, label]) => (
                  <option key={key} value={key} class="bg-zinc-900">
                    {label}
                  </option>
                ))}
              </select>
            </td>
            <td class="py-1">
              <input type="checkbox" checked={p.is_active} onChange={(e) => onUpdate(p.id, { is_active: e.currentTarget.checked })} />
            </td>
            <td class="py-1 text-right">
              <Button size="sm" variant="ghost" onClick={() => onDelete(p.id)} title="Удалить">
                ✕
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
