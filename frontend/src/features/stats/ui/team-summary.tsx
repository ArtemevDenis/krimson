import type { StatsType } from '@/shared/api/schemas'

export function TeamSummary({ team, matches }: { team: StatsType['team']; matches?: number | undefined }) {
  const items: [string, string | number][] = [
    ...(matches !== undefined ? ([['Матчей', matches]] as [string, number][]) : []),
    ['Розыгрышей', team.rallies],
    ['Выиграно', team.won],
    ['Проиграно', team.rallies - team.won],
    ['Ошибки соперника', team.opponent_errors],
    ['Очки соперника своей игрой', team.opponent_points],
    ['Наши нарушения', team.faults],
  ]
  return (
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} class="rounded-md bg-zinc-950 px-3 py-2">
          <div class="text-[11px] text-zinc-500">{label}</div>
          <div class="text-lg font-semibold tabular">{value}</div>
        </div>
      ))}
    </div>
  )
}
