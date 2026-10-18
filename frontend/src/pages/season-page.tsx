import { useUnit } from 'effector-react'
import { useEffect, useState } from 'preact/hooks'
import { loadSeasonStatsFx, PlayerStatsTable, RotationTable, seasonStatsStore, statsErrorStore, TeamSummary, teamTotals } from '@/features/stats'
import { currentTeamIdStore } from '@/shared/model/team-model'
import { Card } from '@/shared/ui/card'
import { ErrorBanner } from '@/shared/ui/feedback'
import { Field, Input } from '@/shared/ui/form'

export function SeasonPage() {
  const [stats, error, teamId] = useUnit([seasonStatsStore, statsErrorStore, currentTeamIdStore])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    if (teamId !== null) void loadSeasonStatsFx({ teamId, from: from || null, to: to || null })
  }, [teamId, from, to])

  return (
    <div class="mx-auto flex max-w-7xl flex-col gap-4">
      <div class="flex items-end gap-3">
        <h1 class="mr-auto text-lg font-semibold">Статистика сезона</h1>
        <Field label="С">
          <Input type="date" value={from} onInput={(e) => setFrom(e.currentTarget.value)} />
        </Field>
        <Field label="По">
          <Input type="date" value={to} onInput={(e) => setTo(e.currentTarget.value)} />
        </Field>
      </div>
      <ErrorBanner message={error} />
      {stats && (
        <>
          <TeamSummary team={stats.team} matches={stats.matches} />
          <Card title="Игроки">
            <PlayerStatsTable rows={stats.players} totals={teamTotals(stats.players)} roster={stats.roster} />
          </Card>
          <Card title="По расстановкам">
            <RotationTable rotations={stats.rotations} />
          </Card>
        </>
      )}
    </div>
  )
}
