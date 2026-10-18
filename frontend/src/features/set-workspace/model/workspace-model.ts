import { attach, createEffect, createEvent, createStore, sample } from 'effector'
import { errorMessage } from '@/shared/api/client'
import type { SubstitutionType, WorkspaceType } from '@/shared/api/schemas'
import {
  deleteAction,
  deleteRally,
  fetchWorkspace,
  patchRally,
  patchSet,
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
  openRally,
  rallyById,
  resolvePlayer,
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

export const updateRallyFx = createEffect(({ id, patch }: { id: number; patch: RallyDraftType }) => patchRally(id, patch))
export const deleteRallyFx = createEffect(deleteRally)
export const deleteActionFx = createEffect(deleteAction)

type CommandContextType = {
  ws: WorkspaceType | null
  selectedId: number | null
  line: string
  pendingSubs: SubstitutionType[]
}

/** Runs a whole command line sequentially; every API call returns the fresh workspace,
 * so rally targeting and score/rotation state are always re-read from the server's replay. */
export const runCommandFx = attach({
  source: { ws: workspaceStore, selectedId: selectedRallyIdStore, line: draftStore, pendingSubs: pendingSubsStore },
  effect: createEffect(async ({ ws: initial, selectedId, line, pendingSubs }: CommandContextType) => {
    if (!initial) throw new Error('Партия не загружена')
    const parsed = parseCommandLine(line)
    if (!parsed.ok) throw new Error(parsed.error)

    let ws = initial
    let subs = pendingSubs
    const time = playerController.time()
    const target = () => (selectedId !== null ? rallyById(ws, selectedId) : openRally(ws))
    const createRally = async (draft: RallyDraftType) => {
      ws = await postRally(ws.set.id, { substitutions: subs, ...draft })
      subs = []
    }

    // Validate every player reference before touching the server, so a typo doesn't leave half a line applied
    const stateForNewRally = target()?.state ?? ws.current
    for (const cmd of parsed.commands) {
      if (cmd.kind !== 'action') continue
      const resolved = resolvePlayer(cmd.number, cmd.skill, stateForNewRally, ws.players)
      if (!resolved.ok) throw new Error(resolved.error)
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
        case 'action': {
          let current = rally
          if (!current) {
            const lead = cmd.skill === 'S' ? START_LEAD_SECONDS : IMPLICIT_START_LEAD_SECONDS
            await createRally({ start_time: Math.max(0, time - lead) })
            current = target()
          }
          if (!current) throw new Error('Не удалось создать розыгрыш')
          const resolved = resolvePlayer(cmd.number, cmd.skill, current.state ?? ws.current, ws.players)
          if (!resolved.ok) throw new Error(resolved.error)
          ws = await postAction(current.id, {
            player_id: resolved.playerId,
            skill: cmd.skill,
            evaluation: cmd.evaluation,
            video_time: time,
          })
          break
        }
      }
    }
    return { ws, subsUsed: subs.length === 0 && pendingSubs.length > 0 }
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
    [runCommandFx.failData, undoFx.failData, updateSetFx.failData, updateRallyFx.failData, deleteRallyFx.failData, deleteActionFx.failData, loadWorkspaceFx.failData],
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
