import { useUnit } from 'effector-react'
import { useLocation } from 'wouter-preact'
import { useEffect } from 'preact/hooks'
import {
  createMatchFx,
  createVenueFx,
  deleteMatchFx,
  loadMatchesFx,
  loadVenuesFx,
  MatchForm,
  MatchList,
  matchesErrorStore,
  matchesStore,
  updateMatchFx,
  venuesStore,
} from '@/features/matches'
import { currentTeamIdStore, teamsStore } from '@/shared/model/team-model'
import { Card } from '@/shared/ui/card'
import { ErrorBanner } from '@/shared/ui/feedback'

export function MatchesPage() {
  const [matches, error, teamId, teams, pending] = useUnit([matchesStore, matchesErrorStore, currentTeamIdStore, teamsStore, createMatchFx.pending])
  const venues = useUnit(venuesStore)
  const [, navigate] = useLocation()

  useEffect(() => {
    void loadVenuesFx()
  }, [])
  // On every visit, not only on team change: the remembered team never "changes" on startup
  useEffect(() => {
    if (teamId !== null) void loadMatchesFx(teamId)
  }, [teamId])
  const teamName = teams.find((t) => t.id === teamId)?.name ?? ''

  return (
    <div class="mx-auto flex max-w-5xl flex-col gap-4">
      <ErrorBanner message={error} />
      <Card title="Новый матч">
        <MatchForm
          pending={pending}
          venues={venues}
          onCreateVenue={createVenueFx}
          onSubmit={(draft) => {
            if (teamId === null) return
            void createMatchFx({ team_id: teamId, ...draft }).then((m) => navigate(`/matches/${m.id}`))
          }}
        />
      </Card>
      <Card title="Матчи">
        <MatchList
          matches={matches}
          teamName={teamName}
          onOpen={(id) => navigate(`/matches/${id}`)}
          onDelete={(id) => void deleteMatchFx(id)}
          onArchive={(id, archived) => void updateMatchFx({ id, patch: { archived } })}
        />
      </Card>
    </div>
  )
}
