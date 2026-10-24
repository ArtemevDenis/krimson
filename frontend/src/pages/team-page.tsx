import { useUnit } from 'effector-react'
import { useEffect, useState } from 'preact/hooks'
import { deletePlayerFx, importRosterFx, loadRosterFx, RosterImport, RosterTable, rosterErrorStore, rosterStore, updatePlayerFx } from '@/features/roster'
import { createTeamFx, currentTeamIdStore, renameTeamFx, teamsStore } from '@/shared/model/team-model'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { EmptyState, ErrorBanner } from '@/shared/ui/feedback'
import { Input } from '@/shared/ui/form'

export function TeamPage() {
  const [players, error, teamId, teams, importing] = useUnit([rosterStore, rosterErrorStore, currentTeamIdStore, teamsStore, importRosterFx.pending])
  const team = teams.find((t) => t.id === teamId)
  const [name, setName] = useState(team?.name ?? '')

  useEffect(() => setName(team?.name ?? ''), [team?.id, team?.name])
  // On every visit, not only on team change: the remembered team never "changes" on startup
  useEffect(() => {
    if (teamId !== null) void loadRosterFx(teamId)
  }, [teamId])

  if (teamId === null || !team) return null

  return (
    <div class="mx-auto flex max-w-5xl flex-col gap-4">
      <ErrorBanner message={error} />
      <Card
        title="Команда"
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const newName = prompt('Название новой команды')
              if (newName?.trim()) void createTeamFx(newName.trim())
            }}
          >
            + ещё команда
          </Button>
        }
      >
        <form
          class="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && name !== team.name) void renameTeamFx({ id: team.id, name: name.trim() })
          }}
        >
          <Input value={name} onInput={(e) => setName(e.currentTarget.value)} />
          <Button type="submit" disabled={!name.trim() || name === team.name}>
            Переименовать
          </Button>
        </form>
      </Card>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title={`Состав · ${players.filter((p) => p.is_active).length}`}>
          {players.length === 0 ? (
            <EmptyState>Загрузите состав списком справа.</EmptyState>
          ) : (
            <RosterTable
              players={players}
              onUpdate={(id, patch) => void updatePlayerFx({ id, patch })}
              onDelete={(id) => {
                if (confirm('Удалить игрока? Его действия в разметке останутся без игрока. Лучше снять галочку «в составе».')) {
                  void deletePlayerFx(id)
                }
              }}
            />
          )}
        </Card>
        <Card title="Импорт списком">
          <RosterImport pending={importing} onImport={(text, replace) => void importRosterFx({ teamId, text, replace })} />
        </Card>
      </div>
    </div>
  )
}
