import type { RotationStatsType } from '@/shared/api/schemas'
import { formatPct } from '@/shared/lib/format'

export function RotationTable({ rotations }: { rotations: RotationStatsType[] }) {
  if (rotations.length === 0) return null
  const pct = (won: number, total: number) => (total ? formatPct(won / total) : '—')
  return (
    <table class="w-full text-xs tabular">
      <thead class="text-zinc-400">
        <tr>
          <th class="px-1.5 py-1 text-left font-normal">Расстановка</th>
          <th class="px-1.5 py-1 text-right font-normal">Приём: выиграно</th>
          <th class="px-1.5 py-1 text-right font-normal">Side-out %</th>
          <th class="px-1.5 py-1 text-right font-normal">Подача: выиграно</th>
          <th class="px-1.5 py-1 text-right font-normal">Break %</th>
        </tr>
      </thead>
      <tbody>
        {rotations.map((r) => (
          <tr key={r.setter_zone} class="border-t border-zinc-800">
            <td class="px-1.5 py-1">P{r.setter_zone} (связующий в зоне {r.setter_zone})</td>
            <td class="px-1.5 py-1 text-right">
              {r.sideout_won}/{r.sideout_total}
            </td>
            <td class="px-1.5 py-1 text-right font-semibold">{pct(r.sideout_won, r.sideout_total)}</td>
            <td class="px-1.5 py-1 text-right">
              {r.break_won}/{r.break_total}
            </td>
            <td class="px-1.5 py-1 text-right font-semibold">{pct(r.break_won, r.break_total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
