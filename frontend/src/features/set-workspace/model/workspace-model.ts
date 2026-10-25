import { attach, createEffect, createEvent, createStore, sample } from 'effector'
import { errorMessage } from '@/shared/api/client'
import type { EvaluationType, FaultType, SkillType, SubstitutionType, SuggestionType, WorkspaceType } from '@/shared/api/schemas'
import { faultSkill, TEAM_FAULTS } from '@/shared/lib/volleyball'
import {
  deleteAction,
  deleteRally,
  fetchWorkspace,
  patchRally,
  clearSet,
  patchSet,
  patchSuggestion,
  postAction,
  postRally,
  type RallyDraftType,
  type SetPatchType,
} from '../api/workspace-api'
import { parseCommandLine } from './code-parser'
import { playerController } from './player-controller'
import {
  END_TAIL_SECONDS,
  IMPLICIT_START_LEAD_SECONDS,
  liveRally,
  nextSuggestion,
  openRally,
  rallyAtTime,
  rallyById,
  resolvePlayer,
  reviewWindow,
  START_LEAD_SECONDS,
} from './rally-logic'

// --- stores ------------------------------------------------------------------

export const workspaceStore = createStore<WorkspaceType | null>(null)
/** null = live mode: codes go to the open (last unfinished) rally or start a new one */
export const selectedRallyIdStore = createStore<number | null>(null)
export const draftStore = createStore('')
export const commandErrorStore = createStore<string | null>(null)
/** Substitutions entered between rallies; attached to the next rally that gets created */
export const pendingSubsStore = createStore<SubstitutionType[]>([])
/** CV suggestion being reviewed: `31+` accepts it as player 31 with that evaluation, `x` rejects it */
export const activeSuggestionIdStore = createStore<number | null>(null)
/** The active suggestion's player box is on the wrong person: accept the action without it */
export const boxRejectedStore = createStore(false)

// --- events ------------------------------------------------------------------

export const workspaceOpened = createEvent<number>()
export const workspaceClosed = createEvent()
export const draftChanged = createEvent<string>()
export const numberPicked = createEvent<number>()
export const rallySelected = createEvent<number | null>()
export const commandSubmitted = createEvent()
export const undoRequested = createEvent()
export const substitutionQueued = createEvent<SubstitutionType>()
export const pendingSubsCleared = createEvent()
export const errorDismissed = createEvent()
export const nextSuggestionRequested = createEvent()
export const suggestionActivated = createEvent<SuggestionType | null>()
export const boxRejectToggled = createEvent()

// --- effects -----------------------------------------------------------------

export const loadWorkspaceFx = createEffect(fetchWorkspace)

export const updateSetFx = attach({
  source: workspaceStore,
  effect: createEffect(({ ws, patch }: { ws: WorkspaceType | null; patch: SetPatchType }) => {
    if (!ws) throw new Error('Партия не загружена')
    return patchSet(ws.set.id, patch)
  }),
  mapParams: (patch: SetPatchType, ws) => ({ ws, patch }),
})

/** Removes all rallies of the set (a trial tagging); video, court and lineup stay */
export const clearSetFx = attach({
  source: workspaceStore,
  effect: createEffect((ws: WorkspaceType | null) => {
    if (!ws) throw new Error('Партия не загружена')
    return clearSet(ws.set.id)
  }),
  mapParams: (_: void, ws) => ws,
})

export const updateRallyFx = createEffect(({ id, patch }: { id: number; patch: RallyDraftType }) => patchRally(id, patch))
export const deleteRallyFx = createEffect(deleteRally)
export const deleteActionFx = createEffect(deleteAction)

type CommandContextType = {
  ws: WorkspaceType | null
  selectedId: number | null
  line: string
  pendingSubs: SubstitutionType[]
  suggestionId: number | null
  boxRejected: boolean
}

/** Runs a whole command line sequentially; every API call returns the fresh workspace,
 * so rally targeting and score/rotation state are always re-read from the server's replay. */
export const runCommandFx = attach({
  source: {
    ws: workspaceStore,
    selectedId: selectedRallyIdStore,
    line: draftStore,
    pendingSubs: pendingSubsStore,
    suggestionId: activeSuggestionIdStore,
    boxRejected: boxRejectedStore,
  },
  effect: createEffect(async ({ ws: initial, selectedId, line, pendingSubs, suggestionId, boxRejected }: CommandContextType) => {
    if (!initial) throw new Error('Партия не загружена')
    const parsed = parseCommandLine(line)
    if (!parsed.ok) throw new Error(parsed.error)
    const dropBox = boxRejected || parsed.commands.some((c) => c.kind === 'dropBox')

    let ws = initial
    let subs = pendingSubs
    const time = playerController.time()
    const target = () => (selectedId !== null ? rallyById(ws, selectedId) : liveRally(ws, time))
    // The first action of the line consumes the active suggestion: its moment and skill
    let suggestion = initial.suggestions.find((sg) => sg.id === suggestionId) ?? null
    let consumed: SuggestionType | null = null
    let createdId: number | null = null
    /** A new rally may land before existing ones (rallies are kept in video order), so remember it by id */
    const createRally = async (draft: RallyDraftType) => {
      const known = new Set(ws.rallies.map((r) => r.id))
      ws = await postRally(ws.set.id, { substitutions: subs, ...draft })
      subs = []
      createdId = ws.rallies.find((r) => !known.has(r.id))?.id ?? null
    }

    // Validate every player reference before touching the server, so a typo doesn't leave half a line applied
    const stateForNewRally = target()?.state ?? ws.current
    for (const cmd of parsed.commands) {
      if (cmd.kind === 'quick' && !suggestion) throw new Error('Нет активной подсказки — укажите элемент, например 31r+')
      if (cmd.kind === 'reject' && !suggestion) throw new Error('Нет активной подсказки')
      if (cmd.kind === 'fault') {
        const isTeam = TEAM_FAULTS.includes(cmd.fault)
        if (isTeam && cmd.number !== null) throw new Error('Четыре касания и переход — нарушения команды, без номера: v4, vr (н4, нп)')
        if (isTeam) continue
        if (cmd.number === null && cmd.fault !== 'foot') throw new Error('Укажите номер нарушившего игрока, например 10vn или 10нс')
        // without a number the foot fault goes to the current server, like `s=`
        const resolved = resolvePlayer(cmd.number, faultSkill(cmd.fault), stateForNewRally, ws.players)
        if (!resolved.ok) throw new Error(resolved.error)
        continue
      }
      if (cmd.kind !== 'action' && cmd.kind !== 'quick') continue
      const skill = cmd.kind === 'quick' ? suggestion!.skill : cmd.skill
      const resolved = resolvePlayer(cmd.number, skill, stateForNewRally, ws.players)
      if (!resolved.ok) throw new Error(resolved.error)
    }

    const addAction = async (number: number | null, skill: SkillType, evaluation: EvaluationType, fault: FaultType | null = null) => {
      const sg = suggestion
      suggestion = null
      const at = sg ? sg.time : time
      let current = sg ? (rallyAtTime(ws, at) ?? target()) : target()
      if (!current) {
        const lead = skill === 'S' ? START_LEAD_SECONDS : IMPLICIT_START_LEAD_SECONDS
        await createRally({ start_time: Math.max(0, at - lead) })
        current = sg ? (rallyAtTime(ws, at) ?? openRally(ws)) : (target() ?? rallyById(ws, createdId))
        createdId = null
      }
      if (!current) throw new Error('Не удалось создать розыгрыш')
      // Team faults (four touches, rotation) belong to nobody
      const isTeamFault = fault !== null && TEAM_FAULTS.includes(fault)
      const resolved = isTeamFault ? null : resolvePlayer(number, skill, current.state ?? ws.current, ws.players)
      if (resolved && !resolved.ok) throw new Error(resolved.error)
      ws = await postAction(current.id, {
        player_id: resolved?.ok ? resolved.playerId : null,
        skill,
        evaluation,
        fault,
        video_time: at,
        suggestion_id: sg?.id ?? null,
        ...(sg && dropBox ? { drop_box: true } : {}),
      })
      if (sg) consumed = sg
    }

    for (const cmd of parsed.commands) {
      const rally = target()
      switch (cmd.kind) {
        case 'start':
          if (rally) ws = await patchRally(rally.id, { start_time: Math.max(0, time - START_LEAD_SECONDS) })
          else await createRally({ start_time: Math.max(0, time - START_LEAD_SECONDS) })
          break
        case 'end':
          if (!rally) throw new Error('Нет открытого розыгрыша')
          ws = await patchRally(rally.id, { end_time: time + END_TAIL_SECONDS })
          break
        case 'winner':
          if (rally) {
            ws = await patchRally(rally.id, { winner: cmd.side, end_time: rally.end_time ?? time + END_TAIL_SECONDS })
          } else {
            await createRally({ winner: cmd.side, end_time: time + END_TAIL_SECONDS })
          }
          break
        case 'star': {
          // Usually typed right after the rally ended, so fall back to the last closed one
          const starred = rally ?? ws.rallies[ws.rallies.length - 1]
          if (!starred) throw new Error('Нет розыгрыша для отметки')
          const tags = starred.tags.includes('star') ? starred.tags.filter((t) => t !== 'star') : [...starred.tags, 'star']
          ws = await patchRally(starred.id, { tags })
          break
        }
        case 'action':
          await addAction(cmd.number, cmd.skill, cmd.evaluation)
          break
        case 'quick':
          await addAction(cmd.number, suggestion!.skill, cmd.evaluation)
          break
        case 'fault':
          await addAction(cmd.number, faultSkill(cmd.fault), '=', cmd.fault)
          break
        case 'dropBox':
          break
        case 'reject': {
          const sg = suggestion!
          suggestion = null
          ws = await patchSuggestion(sg.id, 'rejected')
          consumed = sg
          break
        }
      }
    }
    return { ws, subsUsed: subs.length === 0 && pendingSubs.length > 0, consumed: consumed as SuggestionType | null }
  }),
})

/** Backspace on an empty code line: drop the last action, or the empty open rally. */
export const undoFx = attach({
  source: { ws: workspaceStore, selectedId: selectedRallyIdStore },
  effect: createEffect(async ({ ws, selectedId }: { ws: WorkspaceType | null; selectedId: number | null }) => {
    if (!ws) throw new Error('Партия не загружена')
    const rally = selectedId !== null ? rallyById(ws, selectedId) : (openRally(ws) ?? ws.rallies[ws.rallies.length - 1] ?? null)
    if (!rally) return ws
    const last = rally.actions[rally.actions.length - 1]
    if (last) return deleteAction(last.id)
    if (rally.winner !== null) return patchRally(rally.id, { winner: null })
    return deleteRally(rally.id)
  }),
})

// --- wiring ------------------------------------------------------------------

const workspaceUpdated = [
  loadWorkspaceFx.doneData,
  updateSetFx.doneData,
  clearSetFx.doneData,
  updateRallyFx.doneData,
  deleteRallyFx.doneData,
  deleteActionFx.doneData,
  undoFx.doneData,
]

workspaceStore
  .on(workspaceUpdated, (_, ws) => ws)
  .on(runCommandFx.doneData, (_, { ws }) => ws)
  .reset(workspaceClosed)

sample({ clock: workspaceOpened, target: loadWorkspaceFx })

draftStore
  .on(draftChanged, (_, text) => text)
  .on(numberPicked, (text, n) => {
    // Clicking a player on the court starts a new code token with their number
    const trimmed = text.replace(/\d+$/, '')
    return `${trimmed}${trimmed && !trimmed.endsWith(' ') ? ' ' : ''}${n}`
  })
  .reset(runCommandFx.done, workspaceClosed)

sample({
  clock: commandSubmitted,
  source: draftStore,
  filter: (text) => text.trim().length > 0,
  target: runCommandFx,
})

sample({ clock: undoRequested, target: undoFx })

selectedRallyIdStore
  .on(rallySelected, (_, id) => id)
  .on(deleteRallyFx.done, (selected, { params }) => (selected === params ? null : selected))
  .reset(workspaceClosed)

// A deleted rally may have been selected via undo as well
sample({
  clock: workspaceStore,
  source: selectedRallyIdStore,
  filter: (id, ws) => id !== null && ws !== null && !ws.rallies.some((r) => r.id === id),
  fn: () => null,
  target: rallySelected,
})

pendingSubsStore
  .on(substitutionQueued, (subs, sub) => [...subs, sub])
  .on(runCommandFx.doneData, (subs, { subsUsed }) => (subsUsed ? [] : subs))
  .reset(pendingSubsCleared, workspaceClosed)

commandErrorStore
  .on(
    [runCommandFx.failData, undoFx.failData, updateSetFx.failData, clearSetFx.failData, updateRallyFx.failData, deleteRallyFx.failData, deleteActionFx.failData, loadWorkspaceFx.failData],
    (_, e) => errorMessage(e),
  )
  .reset(runCommandFx.done, errorDismissed, workspaceClosed)

// A line that fails halfway may have already applied some codes — resync with the server
sample({
  clock: runCommandFx.fail,
  source: workspaceStore.map((ws) => ws?.set.id ?? null),
  filter: (id): id is number => id !== null,
  target: loadWorkspaceFx,
})

// --- CV suggestions review ---------------------------------------------------

/** Plays up to the touch and stops on it, so the frame matches the ball/player highlight. */
const playSuggestionFx = attach({
  source: workspaceStore,
  effect: createEffect(({ ws, sg }: { ws: WorkspaceType | null; sg: SuggestionType | null }) => {
    if (!sg || !ws) return
    const { start, touch, end } = reviewWindow(ws, sg)
    playerController.playReview(start, touch, end)
  }),
  mapParams: (sg: SuggestionType | null, ws) => ({ ws, sg }),
})

activeSuggestionIdStore.on(suggestionActivated, (_, sg) => sg?.id ?? null).reset(workspaceClosed)
boxRejectedStore.on(boxRejectToggled, (rejected) => !rejected).reset(suggestionActivated, workspaceClosed, runCommandFx.done)

// With a trained player classifier the number is already known: only the evaluation is left to type
sample({
  clock: suggestionActivated,
  source: workspaceStore,
  filter: (_, sg) => sg !== null,
  fn: (ws, sg) => {
    const player = sg?.player_id != null ? ws?.players.find((p) => p.id === sg.player_id) : undefined
    return player?.number != null ? String(player.number) : ''
  },
  target: draftChanged,
})

sample({ clock: suggestionActivated, target: playSuggestionFx })

sample({
  clock: nextSuggestionRequested,
  source: { ws: workspaceStore, activeId: activeSuggestionIdStore },
  fn: ({ ws, activeId }) => {
    if (!ws) return null
    const active = ws.suggestions.find((sg) => sg.id === activeId)
    return nextSuggestion(ws, active ? active.time : playerController.time() - 0.1)
  },
  target: suggestionActivated,
})

// After accepting or rejecting, move straight to the next one
sample({
  clock: runCommandFx.doneData,
  filter: ({ consumed }) => consumed !== null,
  fn: ({ ws, consumed }) => nextSuggestion(ws, consumed!.time),
  target: suggestionActivated,
})
