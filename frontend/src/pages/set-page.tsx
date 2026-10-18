import { useUnit } from 'effector-react'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { Link } from 'wouter-preact'
import {
  CodeCheatsheet,
  CodeInput,
  commandErrorStore,
  commandSubmitted,
  CourtDiagram,
  deleteActionFx,
  deleteRallyFx,
  draftChanged,
  draftStore,
  errorDismissed,
  isTextField,
  LineupEditor,
  loadWorkspaceFx,
  numberPicked,
  pendingSubsCleared,
  pendingSubsStore,
  playerController,
  playersById,
  RallyList,
  rallyAtTime,
  RallyTimeline,
  rallySelected,
  runCommandFx,
  Scoreboard,
  selectedRallyIdStore,
  startRallyDetection,
  SubstitutionForm,
  substitutionQueued,
  undoFx,
  undoRequested,
  updateRallyFx,
  updateSetFx,
  VideoPlayer,
  videoHotkey,
  workspaceClosed,
  workspaceOpened,
  workspaceStore,
} from '@/features/set-workspace'
import { VideoImportPanel, VideoProcessingStatus } from '@/features/video-import'
import { watchJob } from '@/shared/api/jobs-api'
import { currentTeamIdStore, teamsStore } from '@/shared/model/team-model'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'

export function SetPage({ setId }: { setId: number }) {
  const [ws, selectedId, draft, error, pendingSubs] = useUnit([workspaceStore, selectedRallyIdStore, draftStore, commandErrorStore, pendingSubsStore])
  const [running, undoing, savingSet] = useUnit([runCommandFx.pending, undoFx.pending, updateSetFx.pending])
  const [teams, teamId] = useUnit([teamsStore, currentTeamIdStore])
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [panel, setPanel] = useState<'lineup' | 'video' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    workspaceOpened(setId)
    return () => workspaceClosed()
  }, [setId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = videoHotkey(e, isTextField(e.target))
      if (!action) return
      e.preventDefault()
      if (action.kind === 'toggle') playerController.togglePlay()
      else playerController.seekBy(action.delta)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const players = useMemo(() => playersById(ws?.players ?? []), [ws?.players])

  if (!ws || ws.set.id !== setId) return null

  const teamName = teams.find((t) => t.id === teamId)?.name ?? 'Мы'
  const configured = ws.set.lineup.length === 6
  const selected = ws.rallies.find((r) => r.id === selectedId) ?? null
  const courtState = selected?.state ?? ws.current
  const playing = rallyAtTime(ws, time)
  const showLineup = !configured || panel === 'lineup'
  const showVideoImport = !ws.video || panel === 'video'

  const selectRally = (id: number | null) => {
    rallySelected(id)
    const rally = ws.rallies.find((r) => r.id === id)
    if (rally?.start_time !== null && rally?.start_time !== undefined) playerController.seek(rally.start_time)
  }

  const detect = async () => {
    setNotice('Ищу розыгрыши…')
    const job = await startRallyDetection(setId)
    watchJob(job.id, (j) => {
      if (j.status === 'done') {
        setNotice(`Автопоиск: найдено ${String(j.result?.['detected'] ?? 0)}, добавлено ${String(j.result?.['added'] ?? 0)}. Детектор появится на этапе 2.`)
        void loadWorkspaceFx(setId)
      } else if (j.status === 'failed') {
        setNotice(`Автопоиск не удался: ${j.error ?? ''}`)
      }
    })
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <Link href={`/matches/${ws.match.id}`} class="text-sm text-zinc-400 hover:text-white">
          ← {teamName} — {ws.match.opponent}
        </Link>
        <h1 class="text-lg font-semibold">Партия {ws.set.number}</h1>
        <div class="ml-auto flex gap-2">
          {configured && (
            <Button size="sm" variant={panel === 'lineup' ? 'primary' : 'secondary'} onClick={() => setPanel(panel === 'lineup' ? null : 'lineup')}>
              Расстановка
            </Button>
          )}
          {ws.video && (
            <Button size="sm" variant={panel === 'video' ? 'primary' : 'secondary'} onClick={() => setPanel(panel === 'video' ? null : 'video')}>
              Видео
            </Button>
          )}
          <Button size="sm" disabled={!ws.video} onClick={() => void detect()} title="Этап 2: автоматическая нарезка на розыгрыши">
            Автопоиск розыгрышей
          </Button>
        </div>
      </div>
      {notice && (
        <div class="flex justify-between rounded-md bg-violet-950/50 px-3 py-1.5 text-xs text-violet-200">
          {notice}
          <button type="button" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      {(showLineup || showVideoImport) && (
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {showVideoImport && (
            <Card title="Видео партии">
              <VideoImportPanel
                onAttach={(videoId) => {
                  void updateSetFx({ video_id: videoId })
                  setPanel(null)
                }}
              />
            </Card>
          )}
          {showLineup && (
            <Card title="Стартовая расстановка">
              <LineupEditor
                key={ws.set.lineup.join(',')}
                set={ws.set}
                players={ws.players}
                pending={savingSet}
                onSave={(patch) => {
                  void updateSetFx(patch)
                  setPanel(null)
                }}
              />
            </Card>
          )}
        </div>
      )}

      {ws.video && (
        <div class="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div class="flex flex-col gap-2">
            <VideoProcessingStatus video={ws.video} onChanged={() => void loadWorkspaceFx(setId)} />
            <VideoPlayer
              key={`${ws.video.id}-${ws.video.status}`}
              src={`/api/videos/${ws.video.id}/stream`}
              onTime={setTime}
              onDuration={setDuration}
            />
            <RallyTimeline
              rallies={ws.rallies}
              duration={duration || ws.video.duration}
              time={time}
              selectedId={selectedId}
              onSeek={(t) => playerController.seek(t)}
              onSelect={selectRally}
            />
            {configured && (
              <>
                <CodeInput
                  value={draft}
                  pending={running || undoing}
                  error={error}
                  editingLabel={selected ? `розыгрыш #${selected.index + 1}` : null}
                  onChange={draftChanged}
                  onSubmit={commandSubmitted}
                  onUndo={undoRequested}
                  onExitEdit={() => rallySelected(null)}
                  onDismissError={errorDismissed}
                />
                <CodeCheatsheet />
              </>
            )}
          </div>

          {configured && (
            <div class="flex flex-col gap-3">
              <Scoreboard
                teamName={teamName}
                opponent={ws.match.opponent}
                setNumber={ws.set.number}
                state={courtState}
                finished={ws.finished}
                players={players}
                pendingSubs={pendingSubs}
                onClearSubs={pendingSubsCleared}
              />
              {courtState && <CourtDiagram state={courtState} players={players} onPick={numberPicked} />}
              {courtState && !selected && (
                <details class="text-xs text-zinc-400">
                  <summary class="cursor-pointer select-none">Замена игрока</summary>
                  <div class="mt-2">
                    <SubstitutionForm state={courtState} players={ws.players} onSubmit={substitutionQueued} />
                  </div>
                </details>
              )}
              <RallyList
                rallies={ws.rallies}
                players={players}
                selectedId={selectedId}
                playingId={playing?.id ?? null}
                onSelect={(id) => selectRally(id === selectedId ? null : id)}
                onPlay={(r) => r.start_time !== null && playerController.playSegment(r.start_time, r.end_time ?? r.start_time + 10)}
                onSetBoundary={(id, which) => void updateRallyFx({ id, patch: { [which]: playerController.time() } })}
                onToggleStar={(r) =>
                  void updateRallyFx({
                    id: r.id,
                    patch: { tags: r.tags.includes('star') ? r.tags.filter((t) => t !== 'star') : [...r.tags, 'star'] },
                  })
                }
                onDelete={(id) => void deleteRallyFx(id)}
                onDeleteAction={(id) => void deleteActionFx(id)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
