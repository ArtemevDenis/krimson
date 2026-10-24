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
import {
  createSetFx,
  createVenueFx,
  deleteSetFx,
  loadMatchFx,
  loadVenuesFx,
  matchesErrorStore,
  matchStore,
  SetList,
  updateMatchFx,
  VenueSelect,
  venuesStore,
} from '@/features/matches'
import {
  loadMatchStatsFx,
  matchStatsStore,
  PlayerStatsTable,
  RotationTable,
  SetComparisonTable,
  statsErrorStore,
  TeamSummary,
  teamTotals,
} from '@/features/stats'
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
  const [teams, teamId, venues] = useUnit([teamsStore, currentTeamIdStore, venuesStore])
  const [tab, setTab] = useState<TabKey>('sets')
  const [statsSet, setStatsSet] = useState<number | null>(null)
  const [, navigate] = useLocation()

  useEffect(() => {
    void loadMatchFx(matchId)
    void loadVenuesFx()
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
        <div class="w-48" title="Зал определяет, какими моделями размечается видео">
          <VenueSelect
            venues={venues}
            value={match.venue_id}
            onChange={(id) => void updateMatchFx({ id: match.id, patch: { venue_id: id } })}
            onCreate={createVenueFx}
          />
        </div>
        {match.archived && <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">в архиве — не входит в сезон</span>}
        <Button
          size="sm"
          variant="ghost"
          class="ml-auto"
          title={match.archived ? 'Вернуть в статистику сезона' : 'В архив: разметка сохранится, но не войдёт в статистику сезона'}
          onClick={() => void updateMatchFx({ id: match.id, patch: { archived: !match.archived } })}
        >
          {match.archived ? 'Вернуть из архива' : 'В архив'}
        </Button>
        <span class="text-2xl font-bold tabular">
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
          {statsSet === null && stats.summary && stats.by_set.length > 0 && (
            <Card title="По партиям">
              <SetComparisonTable sets={stats.by_set} match={{ team: stats.team, summary: stats.summary }} />
            </Card>
          )}
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
