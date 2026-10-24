import type { SetStatsType, StatsSummaryType, TeamStatsType } from '@/shared/api/schemas'
import { COMPARISON_ROWS, type ComparisonColumnType } from '../model/set-comparison'

type Props = {
  sets: SetStatsType[]
  match: { team: TeamStatsType; summary: StatsSummaryType }
}

export function SetComparisonTable({ sets, match }: Props) {
  if (sets.length === 0) return null
  const columns: ComparisonColumnType[] = [
    ...sets.map((s) => ({ key: `set-${s.set_id}`, title: `Партия ${s.number}`, team: s.team, summary: s.summary })),
    { key: 'match', title: 'Матч', ...match },
  ]
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-xs tabular">
        <thead class="text-zinc-400">
          <tr>
            <th class="px-1.5 py-1 text-left font-normal" />
            {columns.map((c) => (
              <th key={c.key} class={`px-1.5 py-1 text-right font-medium ${c.key === 'match' ? 'text-zinc-200' : ''}`}>
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARISON_ROWS.map((row) => (
            <tr key={row.label} class="border-t border-zinc-800">
              <td class="px-1.5 py-1" title={row.hint}>
                {row.label}
                {row.hint && <span class="ml-1 text-zinc-600">ⓘ</span>}
              </td>
              {columns.map((c) => (
                <td key={c.key} class={`px-1.5 py-1 text-right ${c.key === 'match' ? 'font-semibold' : ''}`}>
                  {row.value(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
