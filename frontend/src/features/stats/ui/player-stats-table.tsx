import type { PlayerStatsType, PlayerType } from '@/shared/api/schemas'
import { formatPct } from '@/shared/lib/format'
import { POSITION_SHORT } from '@/shared/lib/volleyball'
import { EmptyState } from '@/shared/ui/feedback'

type Props = {
  rows: PlayerStatsType[]
  totals: PlayerStatsType
  roster: PlayerType[]
}

const GROUPS: { title: string; span: number }[] = [
  { title: '', span: 5 },
  { title: 'Подача', span: 4 },
  { title: 'Приём', span: 5 },
  { title: 'Атака', span: 6 },
  { title: 'Блок', span: 1 },
  { title: 'Защита', span: 2 },
  { title: 'Перевод', span: 2 },
  { title: '', span: 1 },
]

const HEADERS = ['№', 'Игрок', 'Амп.', 'Очки', 'Ош.', 'Всего', 'Эйс', 'Ош.', 'Эфф.', 'Всего', '#', 'Ош.', 'Поз.%', 'Идеал%', 'Всего', 'Очко', 'Ош.', 'Блок', '%', 'Эфф.', 'Очки', 'Всего', 'Ош.', 'Всего', 'Ош.', 'Наруш.']

function cells(s: PlayerStatsType): (string | number)[] {
  return [
    s.points,
    s.errors,
    s.serve.total,
    s.serve.ace,
    s.serve.error,
    formatPct(s.serve.eff),
    s.reception.total,
    s.reception.perfect,
    s.reception.error,
    formatPct(s.reception.pos_pct),
    formatPct(s.reception.perf_pct),
    s.attack.total,
    s.attack.kill,
    s.attack.error,
    s.attack.blocked,
    formatPct(s.attack.kill_pct),
    formatPct(s.attack.eff),
    s.block.point,
    s.dig.total,
    s.dig.error,
    s.over.total,
    s.over.error,
    s.faults.total ?? 0,
  ]
}

export function PlayerStatsTable({ rows, totals, roster }: Props) {
  const byId = new Map(roster.map((p) => [p.id, p]))
  const sorted = [...rows]
    .filter((r) => byId.has(r.player_id))
    .sort((a, b) => (byId.get(a.player_id)?.number ?? 999) - (byId.get(b.player_id)?.number ?? 999))

  if (sorted.length === 0) return <EmptyState>Нет данных: разметьте хотя бы один розыгрыш.</EmptyState>

  return (
    <div class="overflow-x-auto">
      <table class="w-full text-xs tabular">
        <thead class="text-zinc-400">
          <tr>
            {GROUPS.map((g, i) => (
              <th key={i} colSpan={g.span} class="border-b border-zinc-800 px-1 pb-1 text-center font-medium text-zinc-300">
                {g.title}
              </th>
            ))}
          </tr>
          <tr>
            {HEADERS.map((h, i) => (
              <th key={i} class={`px-1.5 py-1 font-normal ${i === 1 ? 'text-left' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const p = byId.get(row.player_id)
            return (
              <tr key={row.player_id} class="border-t border-zinc-800 hover:bg-zinc-900">
                <td class="px-1.5 py-1 text-right text-zinc-400">{p?.number ?? ''}</td>
                <td class="px-1.5 py-1 text-left whitespace-nowrap">{p?.name}</td>
                <td class="px-1.5 py-1 text-right text-zinc-500">{p ? POSITION_SHORT[p.position] : ''}</td>
                {cells(row).map((c, i) => (
                  <td key={i} class={`px-1.5 py-1 text-right ${i === 0 ? 'font-semibold text-rose-300' : ''}`}>
                    {c}
                  </td>
                ))}
              </tr>
            )
          })}
          <tr class="border-t-2 border-zinc-700 font-semibold">
            <td />
            <td class="px-1.5 py-1 text-left">Команда</td>
            <td />
            {cells(totals).map((c, i) => (
              <td key={i} class="px-1.5 py-1 text-right">
                {c}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
