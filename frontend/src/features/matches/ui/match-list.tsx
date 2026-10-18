import type { MatchSummaryType } from '@/shared/api/schemas'
import { formatDate } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/ui/feedback'

type Props = {
  matches: MatchSummaryType[]
  teamName: string
  onOpen: (id: number) => void
  onDelete: (id: number) => void
}

export function MatchList({ matches, teamName, onOpen, onDelete }: Props) {
  if (matches.length === 0) return <EmptyState>Матчей пока нет — создайте первый выше.</EmptyState>

  return (
    <ul class="flex flex-col divide-y divide-zinc-800">
      {matches.map((m) => {
        const won = m.sets_won > m.sets_lost
        const played = m.sets_won + m.sets_lost > 0
        return (
          <li key={m.id} class="flex items-center gap-4 py-2.5">
            <button type="button" class="flex flex-1 items-center gap-4 text-left" onClick={() => onOpen(m.id)}>
              <span class="w-24 text-xs text-zinc-500 tabular">{formatDate(m.date)}</span>
              <span class="flex-1 text-sm">
                {teamName} <span class="text-zinc-500">—</span> {m.opponent}
                {m.venue && <span class="ml-2 text-xs text-zinc-500">{m.venue}</span>}
              </span>
              <span class="flex gap-1.5 text-xs text-zinc-400 tabular">
                {m.sets.map((s) => (
                  <span key={s.id} class={s.our_score > s.their_score ? 'text-rose-300' : ''}>
                    {s.our_score}:{s.their_score}
                  </span>
                ))}
              </span>
              <span class={`w-12 text-right text-sm font-semibold tabular ${played ? (won ? 'text-rose-400' : 'text-zinc-400') : 'text-zinc-600'}`}>
                {m.sets_won}:{m.sets_lost}
              </span>
            </button>
            <Button
              size="sm"
              variant="ghost"
              title="Удалить матч"
              onClick={() => {
                if (confirm(`Удалить матч с «${m.opponent}» со всей разметкой?`)) onDelete(m.id)
              }}
            >
              ✕
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
