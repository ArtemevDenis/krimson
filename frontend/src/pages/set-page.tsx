import { useUnit } from 'effector-react'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { Link } from 'wouter-preact'
import { CourtCalibrator } from '@/features/court-calibration'
import {
  activeSuggestionIdStore,
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
  nextSuggestionRequested,
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
  startAnalysis,
  SubstitutionForm,
  substitutionQueued,
  SuggestionBar,
  SuggestionOverlay,
  suggestionActivated,
  undoFx,
  undoRequested,
  updateRallyFx,
  updateSetFx,
  clearSetFx,
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
  const [ws, selectedId, draft, error, pendingSubs, activeSuggestionId] = useUnit([
    workspaceStore,
    selectedRallyIdStore,
    draftStore,
    commandErrorStore,
    pendingSubsStore,
    activeSuggestionIdStore,
  ])
  const [running, undoing, savingSet] = useUnit([runCommandFx.pending, undoFx.pending, updateSetFx.pending])
  const [teams, teamId] = useUnit([teamsStore, currentTeamIdStore])
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [panel, setPanel] = useState<'lineup' | 'video' | 'court' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<number | null>(null)
  const [calibrated, setCalibrated] = useState(false)

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
  const activeSuggestion = ws.suggestions.find((sg) => sg.id === activeSuggestionId) ?? null

  const selectRally = (id: number | null) => {
    rallySelected(id)
    const rally = ws.rallies.find((r) => r.id === id)
    if (rally?.start_time !== null && rally?.start_time !== undefined) playerController.seek(rally.start_time)
  }

  const analyze = async () => {
    if (!calibrated) {
      setPanel('court')
      setNotice('Сначала разметьте площадку: анализ определяет, на чьей стороне касание.')
      return
    }
    setNotice(null)
    setAnalysis(0)
    try {
      const job = await startAnalysis(setId)
      watchJob(job.id, (j) => {
        if (j.status === 'running' || j.status === 'queued') {
          setAnalysis(j.progress)
          return
        }
        setAnalysis(null)
        if (j.status === 'done') {
          const r = j.result ?? {}
          setNotice(
            `Анализ готов: розыгрышей найдено ${String(r['detected'] ?? 0)}, добавлено ${String(r['added'] ?? 0)}, подсказок действий ${String(r['suggestions'] ?? 0)}.`,
          )
          void loadWorkspaceFx(setId)
        } else {
          setNotice(`Анализ не удался: ${j.error ?? ''}`)
        }
      })
    } catch (e) {
      setAnalysis(null)
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <Link href={`/matches/${ws.match.id}`} class="text-sm text-zinc-400 hover:text-white">
          ← {teamName} — {ws.match.opponent}
        </Link>
        <h1 class="text-lg font-semibold">Партия {ws.set.number}</h1>
        <Button
          size="sm"
          variant={ws.set.verified ? 'primary' : 'ghost'}
          title="Отмечайте, когда размечены ВСЕ розыгрыши и ВСЕ касания нашей команды — тогда партия идёт в обучение анализатора"
          onClick={() => {
            const next = !ws.set.verified
            if (!next || confirm('Все розыгрыши и все касания нашей команды размечены? Партия пойдёт в обучение анализатора.')) {
              void updateSetFx({ verified: next })
            }
          }}
        >
          {ws.set.verified ? '✓ Проверена' : 'Отметить проверенной'}
        </Button>
        {ws.rallies.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            title="Удалить все розыгрыши и действия. Видео, разметка площадки и расстановка останутся"
            onClick={() => {
              if (confirm(`Удалить всю разметку партии (${ws.rallies.length} розыгр.)? Видео, площадка и расстановка останутся.`)) {
                void clearSetFx()
              }
            }}
          >
            Очистить разметку
          </Button>
        )}
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
          {ws.video && (
            <Button size="sm" variant={panel === 'court' ? 'primary' : 'secondary'} onClick={() => setPanel(panel === 'court' ? null : 'court')}>
              Площадка{calibrated ? ' ✓' : ''}
            </Button>
          )}
          <Button
            size="sm"
            disabled={!ws.video || analysis !== null}
            onClick={() => void analyze()}
            title="Поиск розыгрышей и подсказки действий по видео. Долго: на Mac около часа на партию"
          >
            {analysis !== null ? `Анализ… ${Math.round(analysis * 100)}%` : 'Авторазметка'}
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

      {ws.video && (
        <div class={panel === 'court' ? '' : 'hidden'}>
          <Card title="Разметка площадки">
            <CourtCalibrator
              videoId={ws.video.id}
              captureFrame={() => playerController.captureFrame()}
              onSeek={(t) => playerController.seek(t)}
              onChanged={(list) => setCalibrated(list.length > 0)}
            />
          </Card>
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
                previous={ws.previous_set}
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
              overlay={<SuggestionOverlay suggestion={activeSuggestion} />}
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
                <SuggestionBar
                  pendingCount={ws.suggestions.length}
                  active={activeSuggestion}
                  onNext={nextSuggestionRequested}
                  onReplay={() => suggestionActivated(activeSuggestion)}
                  onClose={() => suggestionActivated(null)}
                />
                <CodeInput
                  value={draft}
                  pending={running || undoing}
                  error={error}
                  editingLabel={selected ? `розыгрыш #${selected.index + 1}` : null}
                  onChange={draftChanged}
                  onSubmit={commandSubmitted}
                  onUndo={undoRequested}
                  onNext={nextSuggestionRequested}
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
                hasLibero={ws.set.libero_ids.length > 0}
                onClearSubs={pendingSubsCleared}
                onQueueSub={substitutionQueued}
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
                suggestions={ws.suggestions}
                activeSuggestionId={activeSuggestionId}
                onSuggestion={suggestionActivated}
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
