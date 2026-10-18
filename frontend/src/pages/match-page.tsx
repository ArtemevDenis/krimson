import { useUnit } from 'effector-react'
import { useEffect, useState } from 'preact/hooks'
import { Link, useLocation } from 'wouter-preact'
import {
  excludedStore,
  exportFx,
  exportsStore,
  groupToggled,
  HighlightGroups,
  highlightsErrorStore,
  highlightsStore,
  includedRallies,
  loadHighlightsFx,
} from '@/features/highlights'
import { createSetFx, deleteSetFx, loadMatchFx, matchesErrorStore, matchStore, SetList } from '@/features/matches'
import { loadMatchStatsFx, matchStatsStore, PlayerStatsTable, RotationTable, statsErrorStore, TeamSummary, teamTotals } from '@/features/stats'
import { formatDate } from '@/shared/lib/format'
import { currentTeamIdStore, teamsStore } from '@/shared/model/team-model'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorBanner } from '@/shared/ui/feedback'
import { Select } from '@/shared/ui/form'
import { Tabs } from '@/shared/ui/tabs'

type TabKey = 'sets' | 'stats' | 'highlights'

export function MatchPage({ matchId }: { matchId: number }) {
  const [match, matchError, creatingSet] = useUnit([matchStore, matchesErrorStore, createSetFx.pending])
  const [stats, statsError] = useUnit([matchStatsStore, statsErrorStore])
  const [groups, excluded, exports, highlightsError] = useUnit([highlightsStore, excludedStore, exportsStore, highlightsErrorStore])
  const [teams, teamId] = useUnit([teamsStore, currentTeamIdStore])
  const [tab, setTab] = useState<TabKey>('sets')
  const [statsSet, setStatsSet] = useState<number | null>(null)
  const [, navigate] = useLocation()

  useEffect(() => {
    void loadMatchFx(matchId)
  }, [matchId])

  useEffect(() => {
    if (tab === 'stats') void loadMatchStatsFx({ matchId, setId: statsSet })
    if (tab === 'highlights') {
      void loadHighlightsFx(matchId)
      void loadMatchStatsFx({ matchId, setId: null })
    }
  }, [tab, matchId, statsSet])

  if (!match || match.id !== matchId) return <ErrorBanner message={matchError} />
  const teamName = teams.find((t) => t.id === teamId)?.name ?? ''

  return (
    <div class="mx-auto flex max-w-7xl flex-col gap-4">
      <div class="flex items-center gap-3">
        <Link href="/" class="text-sm text-zinc-400 hover:text-white">
          ← Матчи
        </Link>
        <h1 class="text-lg font-semibold">
          {teamName} — {match.opponent}
        </h1>
        <span class="text-sm text-zinc-500">{formatDate(match.date)}</span>
        <span class="ml-auto text-2xl font-bold tabular">
          <span class="text-rose-400">{match.sets_won}</span>:{match.sets_lost}
        </span>
      </div>
      <ErrorBanner message={matchError ?? statsError ?? highlightsError} />
      <Tabs<TabKey>
        tabs={[
          { key: 'sets', label: 'Партии' },
          { key: 'stats', label: 'Статистика' },
          { key: 'highlights', label: 'Хайлайты' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'sets' && (
        <Card
          title="Партии"
          actions={
            <Button size="sm" variant="primary" disabled={creatingSet} onClick={() => void createSetFx(matchId).then((ws) => navigate(`/sets/${ws.set.id}`))}>
              + Партия
            </Button>
          }
        >
          <SetList sets={match.sets} onOpen={(id) => navigate(`/sets/${id}`)} onDelete={(setId) => void deleteSetFx({ setId, matchId })} />
        </Card>
      )}

      {tab === 'stats' && stats && (
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <span class="text-sm text-zinc-400">Показать:</span>
            <Select class="w-48" value={statsSet ?? ''} onChange={(e) => setStatsSet(e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
              <option value="">весь матч</option>
              {match.sets.map((s) => (
                <option key={s.id} value={s.id}>
                  партия {s.number} ({s.our_score}:{s.their_score})
                </option>
              ))}
            </Select>
          </div>
          <TeamSummary team={stats.team} />
          <Card title="Игроки">
            <PlayerStatsTable rows={stats.players} totals={teamTotals(stats.players)} roster={stats.roster} />
          </Card>
          <Card title="По расстановкам">
            <RotationTable rotations={stats.rotations} />
          </Card>
        </div>
      )}

      {tab === 'highlights' && (
        <HighlightGroups
          groups={groups}
          excluded={excluded}
          exports={exports}
          roster={stats?.roster ?? []}
          onToggle={(groupKey, rallyId) => groupToggled({ groupKey, rallyId })}
          onExport={(group, pre, post) =>
            void exportFx({
              groupKey: group.key,
              body: {
                title: `${match.opponent}_${group.title}`,
                pre,
                post,
                items: includedRallies(group, excluded).map((r) => ({ video_id: r.video_id, start: r.start, end: r.end })),
              },
            })
          }
        />
      )}
    </div>
  )
}
