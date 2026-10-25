import { useUnit } from 'effector-react'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Link } from 'wouter-preact'
import { CourtCalibrator } from '@/features/court-calibration'
import {
  addIgnoreFx,
  addMarkFx,
  firstUnmarked,
  loadMarksFx,
  PASS_SERVE_OFFSET_SECONDS,
  passConfirmFx,
  passStarted,
  passStepped,
  passStore,
  predictedNames,
  askedTracksStore,
  autoStopStore,
  autoStopChanged,
  deleteIgnoreFx,
  deleteMarkFx,
  ignoredStore,
  personAsked,
  personToAsk,
  resumeAfterStore,
  framePersonsStore,
  frameRequested,
  markedPersons,
  markingClosed,
  markingOpened,
  markingSetStore,
  marksErrorStore,
  marksStore,
  peopleAt,
  peopleErrorStore,
  PeopleOverlay,
  peopleSetStore,
  peopleShownToggled,
  peopleTimeChanged,
  peopleWindowStore,
  personSelected,
  PlayerMarksOverlay,
  PlayerPicker,
  selectedPersonStore,
} from '@/features/player-marks'
import {
  activeSuggestionIdStore,
  boxRejectedStore,
  boxRejectToggled,
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
  useVideoTime,
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
import { ErrorBanner } from '@/shared/ui/feedback'
import { Select } from '@/shared/ui/form'

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
  const boxRejected = useUnit(boxRejectedStore)
  const [markingSet, framePersons, marks, selectedPerson, marksError] = useUnit([
    markingSetStore,
    framePersonsStore,
    marksStore,
    selectedPersonStore,
    marksErrorStore,
  ])
  const marking = markingSet === setId
  const [peopleSet, peopleWindow, peopleError] = useUnit([peopleSetStore, peopleWindowStore, peopleErrorStore])
  const [ignored, autoStop, askedTracks, resumeAfter] = useUnit([ignoredStore, autoStopStore, askedTracksStore, resumeAfterStore])
  const pass = useUnit(passStore)
  const passActive = pass !== null && pass.setId === setId
  const [typed, setTyped] = useState('')
  // Pass actions are computed further down (after the workspace is loaded); the key handler reads the latest ones
  const passConfirmRef = useRef<() => void>(() => {})
  const peopleShown = peopleSet === setId && !marking
  const liveTime = useVideoTime(peopleShown)
  const peopleFrame = peopleShown ? peopleAt(peopleWindow?.frames ?? [], liveTime) : null
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [panel, setPanel] = useState<'lineup' | 'video' | 'court' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<number | null>(null)
  const [calibrated, setCalibrated] = useState(false)

  useEffect(() => {
    workspaceOpened(setId)
    return () => {
      workspaceClosed()
      markingClosed()
    }
  }, [setId])

  // Names over the video: keep the loaded window ahead of playback (checked twice a second)
  const halfSecond = Math.floor(liveTime * 2)
  useEffect(() => {
    if (peopleShown) peopleTimeChanged(halfSecond / 2)
  }, [peopleShown, halfSecond])

  // Stop on someone on our half nobody has named, and ask who it is
  useEffect(() => {
    if (!peopleShown || !peopleFrame || !playerController.isPlaying()) return
    const person = personToAsk(peopleFrame, askedTracks, autoStop)
    if (!person) return
    playerController.pause()
    personAsked(person.track)
    markingOpened({ setId, time: peopleFrame.t, box: person.box, resume: true })
  }, [peopleShown, autoStop, peopleFrame?.t])

  // Keys while marking: Enter confirms the pass step (or the typed number for the selected person),
  // arrows step through the pass, digits type a player's number, Esc leaves. Captured before the code line sees them.
  useEffect(() => {
    if (!marking) return
    const onKey = (e: KeyboardEvent) => {
      let handled = true
      if (/^[0-9]$/.test(e.key)) setTyped((t) => (t + e.key).slice(-2))
      else if (e.key === 'Backspace') setTyped((t) => t.slice(0, -1))
      else if (e.key === 'Enter') {
        const player = typed ? ws?.players.find((p) => p.number === Number(typed)) : undefined
        if (typed && selectedPerson && framePersons && player) {
          void addMarkFx({ setId, time: framePersons.time, box: selectedPerson, playerId: player.id })
        } else if (!typed && passActive) {
          passConfirmRef.current()
        }
        setTyped('')
      } else if (e.key === 'ArrowRight' && passActive && pass) passStepped(pass.index + 1)
      else if (e.key === 'ArrowLeft' && passActive && pass) passStepped(pass.index - 1)
      else if (e.key === 'Escape') markingClosed()
      else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Players pass: each step stands on the serve frame of the rally
  useEffect(() => {
    if (passActive && pass) playerController.showFrame(pass.times[pass.index]!)
    setTyped('')
  }, [passActive, pass?.index])

  // After answering such a stop, play on
  useEffect(() => {
    if (!resumeAfter) return
    const resume = () => {
      markingClosed()
      playerController.play()
    }
    const subscriptions = [addMarkFx.done.watch(resume), addIgnoreFx.done.watch(resume)]
    return () => subscriptions.forEach((unsubscribe) => unsubscribe())
  }, [resumeAfter])

  // While marking players, a seek shows the people of the new frame
  useEffect(() => {
    if (!marking) return
    const timer = setTimeout(() => frameRequested(time), 150)
    return () => clearTimeout(timer)
  }, [marking, time])

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
  const personsOnFrame = markedPersons(framePersons, marks, ignored)
  const selectedOnFrame = personsOnFrame.find((p) => selectedPerson && p.box.every((v, i) => v === selectedPerson[i]))
  const selectedMark = selectedOnFrame?.mark ?? null
  const selectedIgnored = selectedOnFrame?.ignored ?? null
  const predicted = predictedNames(personsOnFrame, framePersons ? peopleAt(peopleWindow?.frames ?? [], framePersons.time, 0.3) : null)
  // Predicted names worth confirming: no mark and not "not ours" yet
  const toConfirm = personsOnFrame
    .map((p, i) => ({ p, guess: predicted[i] }))
    .filter(({ p, guess }) => guess && !p.mark && !p.ignored)
    .map(({ p, guess }) => ({ time: framePersons?.time ?? 0, box: p.box, player_id: guess!.player_id }))
  const rallyServeTimes = ws.rallies
    .filter((r) => r.start_time !== null && r.end_time !== null)
    .map((r) => (r.start_time as number) + PASS_SERVE_OFFSET_SECONDS)
  const passConfirm = () => {
    if (!pass) return
    const last = pass.index >= pass.times.length - 1
    void passConfirmFx({ setId, marks: toConfirm, next: last ? pass.index : pass.index + 1 }).then(() => last && markingClosed())
  }
  passConfirmRef.current = passConfirm
  // Who could be on the frame: the lineup of the rally there (libero included), the rest of the roster after
  const stateAtFrame = (framePersons && rallyAtTime(ws, framePersons.time)?.state) || ws.current
  const onCourtIds = new Set([...(stateAtFrame?.on_court ?? []), ...(stateAtFrame?.lineup ?? []), ...ws.set.libero_ids])
  const onCourtAtFrame = ws.players.filter((p) => onCourtIds.has(p.id))
  const benchAtFrame = ws.players.filter((p) => p.is_active && !onCourtIds.has(p.id))
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
            <Button
              size="sm"
              variant={passActive ? 'primary' : 'secondary'}
              disabled={rallyServeTimes.length === 0}
              title="Розыгрыш за розыгрышем на кадре подачи: подтвердить номера (Enter) или исправить. Лучше до разметки действий"
              onClick={() => {
                if (passActive) {
                  markingClosed()
                  return
                }
                playerController.pause()
                void loadMarksFx(setId).then((state) =>
                  passStarted({ setId, times: rallyServeTimes, index: firstUnmarked(rallyServeTimes, state.marks) }),
                )
              }}
            >
              Проход по игрокам
            </Button>
          )}
          {ws.video && (
            <Button
              size="sm"
              variant={peopleSet === setId ? 'primary' : 'secondary'}
              title="Номера над нашими игроками по ходу видео. Клик по рамке — исправить"
              onClick={() => peopleShownToggled(setId)}
            >
              Номера
            </Button>
          )}
          {ws.video && (
            <Button
              size="sm"
              variant={marking ? 'primary' : 'secondary'}
              title="Отметить игроков на кадре: кто есть кто. Нужно для узнавания игроков"
              onClick={() => {
                if (marking) {
                  markingClosed()
                } else {
                  playerController.pause()
                  markingOpened({ setId, time: playerController.time() })
                }
              }}
            >
              Игроки
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
              overlay={
                marking ? (
                  <PlayerMarksOverlay
                    persons={personsOnFrame}
                    predicted={predicted}
                    selected={selectedPerson}
                    players={players}
                    onSelect={personSelected}
                  />
                ) : (
                  <>
                    {peopleShown && (
                      <PeopleOverlay
                        frame={peopleFrame}
                        players={players}
                        onCorrect={(box, t) => {
                          playerController.showFrame(t)
                          markingOpened({ setId, time: t, box })
                        }}
                      />
                    )}
                    <SuggestionOverlay suggestion={activeSuggestion} time={time} hideBox={boxRejected} />
                  </>
                )
              }
            />
            <RallyTimeline
              rallies={ws.rallies}
              duration={duration || ws.video.duration}
              time={time}
              selectedId={selectedId}
              onSeek={(t) => playerController.seek(t)}
              onSelect={selectRally}
            />
            {peopleShown && peopleError && <ErrorBanner message={peopleError} />}
            {peopleShown && (
              <label class="flex items-center gap-2 self-start text-xs text-zinc-400">
                Останавливаться:
                <Select
                  class="w-auto py-0.5 text-xs"
                  value={autoStop}
                  onChange={(e) => autoStopChanged(e.currentTarget.value as typeof autoStop)}
                >
                  <option value="unnamed">только без номера</option>
                  <option value="doubtful">без номера и сомнительные</option>
                  <option value="off">не останавливаться</option>
                </Select>
                <span class="text-zinc-600">красная «?» — без номера, жёлтая пунктирная — номер под вопросом</span>
              </label>
            )}
            {peopleShown && peopleWindow && !peopleWindow.available && (
              <p class="text-xs text-amber-300">Номера появятся, когда у видео будут детекции и размеченная площадка.</p>
            )}
            {marking && (
              <>
                <ErrorBanner message={marksError} />
                <PlayerPicker
                  frameTime={framePersons?.time ?? null}
                  personCount={personsOnFrame.length}
                  hasSelection={selectedPerson !== null}
                  selectedMark={selectedMark}
                  selectedIgnored={selectedIgnored}
                  asking={resumeAfter}
                  onIgnore={() => framePersons && selectedPerson && void addIgnoreFx({ setId, time: framePersons.time, box: selectedPerson })}
                  onUnignore={(id) => void deleteIgnoreFx(id)}
                  typed={typed}
                  pass={
                    passActive && pass
                      ? {
                          index: pass.index,
                          count: pass.times.length,
                          predictedCount: toConfirm.length,
                          onConfirm: passConfirm,
                          onSkip: () => passStepped(pass.index + 1),
                          onBack: () => passStepped(pass.index - 1),
                        }
                      : null
                  }
                  onCourt={onCourtAtFrame}
                  bench={benchAtFrame}
                  marksTotal={marks.length}
                  onPick={(playerId) =>
                    framePersons &&
                    selectedPerson &&
                    void addMarkFx({ setId, time: framePersons.time, box: selectedPerson, playerId })
                  }
                  onUnmark={(id) => void deleteMarkFx(id)}
                  onClose={markingClosed}
                />
              </>
            )}
            {configured && !marking && (
              <>
                <SuggestionBar
                  pendingCount={ws.suggestions.length}
                  active={activeSuggestion}
                  onNext={nextSuggestionRequested}
                  onReplay={() => suggestionActivated(activeSuggestion)}
                  onFreeze={() => activeSuggestion && playerController.showFrame(activeSuggestion.time)}
                  boxRejected={boxRejected}
                  onToggleBox={boxRejectToggled}
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
