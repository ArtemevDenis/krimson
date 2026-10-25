import { createEffect, createEvent, createStore, sample } from 'effector'
import { errorMessage } from '@/shared/api/client'
import type { FramePersonsType, IgnoredPersonType, MarksStateType, PeopleWindowType, PlayerMarkType } from '@/shared/api/schemas'
import { fetchFramePersons, fetchMarks, fetchPeople, postIgnore, postMark, postMarks, removeIgnore, removeMark, type BoxType } from '../api/marks-api'
import { iou, needsPeopleWindow, PEOPLE_WINDOW, type AutoStopModeType } from './marks-logic'

/** `box`: open with this person already selected (clicked on a name over the video);
 * `resume`: opened by a stop on an unknown person — play on once he's marked */
export const markingOpened = createEvent<{ setId: number; time: number; box?: BoxType; resume?: boolean }>()
export const markingClosed = createEvent()
export const frameRequested = createEvent<number>()
export const personSelected = createEvent<BoxType | null>()

export const loadMarksFx = createEffect(fetchMarks)
export const loadPersonsFx = createEffect(({ setId, time }: { setId: number; time: number }) => fetchFramePersons(setId, time))
export const addMarkFx = createEffect(({ setId, time, box, playerId }: { setId: number; time: number; box: BoxType; playerId: number }) =>
  postMark(setId, { time, box, player_id: playerId }),
)
export const deleteMarkFx = createEffect(removeMark)
export const addMarksFx = createEffect(({ setId, marks }: { setId: number; marks: { time: number; box: BoxType; player_id: number }[] }) =>
  postMarks(setId, marks),
)
export const addIgnoreFx = createEffect(({ setId, time, box }: { setId: number; time: number; box: BoxType }) => postIgnore(setId, { time, box }))
export const deleteIgnoreFx = createEffect(removeIgnore)

/** Set whose players are being marked; null = marking mode is off */
export const markingSetStore = createStore<number | null>(null).on(markingOpened, (_, { setId }) => setId).reset(markingClosed)
export const framePersonsStore = createStore<FramePersonsType | null>(null)
  .on(loadPersonsFx.doneData, (_, frame) => frame)
  .reset(markingClosed)
const marksChanged = [
  loadMarksFx.doneData,
  addMarkFx.doneData,
  addMarksFx.doneData,
  deleteMarkFx.doneData,
  addIgnoreFx.doneData,
  deleteIgnoreFx.doneData,
]
export const marksStore = createStore<PlayerMarkType[]>([])
  .on(marksChanged, (_, state: MarksStateType) => state.marks)
  .reset(markingClosed)
export const ignoredStore = createStore<IgnoredPersonType[]>([])
  .on(marksChanged, (_, state: MarksStateType) => state.ignored)
  .reset(markingClosed)
/** Play on after this marking (it was opened by a stop on an unknown person) */
export const resumeAfterStore = createStore(false)
  .on(markingOpened, (_, { resume }) => !!resume)
  .reset(markingClosed)
/** Same person on a newly loaded frame (a seek nearby): keep him selected, otherwise drop the selection */
function sameOnFrame(box: BoxType | null, frame: FramePersonsType): BoxType | null {
  if (!box) return null
  const best = frame.persons.map((p) => ({ box: p.box, overlap: iou(p.box, box) })).sort((a, b) => b.overlap - a.overlap)[0]
  return best && best.overlap >= 0.5 ? best.box : null
}

export const selectedPersonStore = createStore<BoxType | null>(null)
  .on(personSelected, (_, box) => box)
  .on(loadPersonsFx.doneData, sameOnFrame)
  .reset([markingClosed, addMarkFx.done, addIgnoreFx.done])
export const marksErrorStore = createStore<string | null>(null)
  .on([loadMarksFx.failData, loadPersonsFx.failData, addMarkFx.failData, deleteMarkFx.failData, addIgnoreFx.failData, deleteIgnoreFx.failData], (_, e) =>
    errorMessage(e),
  )
  .reset([markingClosed, loadPersonsFx.done, addMarkFx.done, addIgnoreFx.done])

sample({ clock: markingOpened, fn: ({ setId }) => setId, target: loadMarksFx })
sample({ clock: markingOpened, target: loadPersonsFx })
sample({
  clock: frameRequested,
  source: markingSetStore,
  filter: (setId): setId is number => setId !== null,
  fn: (setId, time) => ({ setId: setId as number, time }),
  target: loadPersonsFx,
})

// A clicked name over the video: select that person once the frame's people are loaded
const pendingSelectionStore = createStore<BoxType | null>(null)
  .on(markingOpened, (_, { box }) => box ?? null)
  .reset(markingClosed)
sample({
  clock: loadPersonsFx.doneData,
  source: pendingSelectionStore,
  filter: (box): box is BoxType => box !== null,
  fn: (box, frame) => sameOnFrame(box, frame),
  target: personSelected,
})
sample({ clock: loadPersonsFx.done, fn: () => null, target: pendingSelectionStore })

// --- names over the video while watching -------------------------------------

export const peopleShownToggled = createEvent<number>()
export const peopleTimeChanged = createEvent<number>()
export const loadPeopleFx = createEffect(({ setId, start, end }: { setId: number; start: number; end: number }) =>
  fetchPeople(setId, start, end).then((w) => ({ ...w, start, end })),
)

/** Set whose names are shown over the video; null = off */
export const peopleSetStore = createStore<number | null>(null).on(peopleShownToggled, (current, setId) => (current === setId ? null : setId))
export const peopleWindowStore = createStore<(PeopleWindowType & { start: number; end: number }) | null>(null)
  .on(loadPeopleFx.doneData, (_, w) => w)
  .reset(peopleSetStore)
export const peopleErrorStore = createStore<string | null>(null)
  .on(loadPeopleFx.failData, (_, e) => errorMessage(e))
  .reset([loadPeopleFx.done, peopleSetStore])

/** Last video time asked for: when a load finishes, the video may already be somewhere the window doesn't cover */
const peopleTimeStore = createStore(0).on(peopleTimeChanged, (_, t) => t)
const windowAround = ({ setId }: { setId: number | null }, t: number) => ({
  setId: setId as number,
  start: Math.max(0, t - PEOPLE_WINDOW.before),
  end: t + PEOPLE_WINDOW.after,
})

sample({
  clock: peopleTimeChanged,
  source: { setId: peopleSetStore, loaded: peopleWindowStore, busy: loadPeopleFx.pending },
  filter: ({ setId, loaded, busy }, t) => setId !== null && !busy && needsPeopleWindow(loaded, t),
  fn: windowAround,
  target: loadPeopleFx,
})
sample({
  clock: loadPeopleFx.done, // not after a failure: that would retry in a loop
  source: { setId: peopleSetStore, loaded: peopleWindowStore, t: peopleTimeStore },
  filter: ({ setId, loaded, t }) => setId !== null && needsPeopleWindow(loaded, t),
  fn: (src) => windowAround(src, src.t),
  target: loadPeopleFx,
})
// A new or removed mark changes who is who: reload what is on screen
sample({
  clock: [addMarkFx.done, addMarksFx.done, deleteMarkFx.done, addIgnoreFx.done, deleteIgnoreFx.done],
  source: { setId: peopleSetStore, loaded: peopleWindowStore },
  filter: ({ setId, loaded }) => setId !== null && loaded !== null,
  fn: ({ setId, loaded }) => ({ setId: setId as number, start: loaded!.start, end: loaded!.end }),
  target: loadPeopleFx,
})

// --- stop on people nobody has named -------------------------------------------

export const autoStopChanged = createEvent<AutoStopModeType>()
export const personAsked = createEvent<number>()
export const autoStopStore = createStore<AutoStopModeType>('unnamed').on(autoStopChanged, (_, mode) => mode)
/** Tracks already stopped for: each person is asked about once, playing on without an answer skips him */
export const askedTracksStore = createStore<ReadonlySet<number>>(new Set())
  .on(personAsked, (asked, track) => new Set([...asked, track]))
  .reset(peopleShownToggled)

// --- players pass: rally by rally at the serve, confirm or fix the names -------

export const passStarted = createEvent<{ setId: number; times: number[]; index: number }>()
export const passStepped = createEvent<number>() // index to go to
export type PassType = { setId: number; times: number[]; index: number }

export const passStore = createStore<PassType | null>(null)
  .on(passStarted, (_, pass) => pass)
  .on(passStepped, (pass, index) => (pass ? { ...pass, index: Math.max(0, Math.min(index, pass.times.length - 1)) } : pass))
  .reset(markingClosed)

// Every step opens the marking on the serve frame and loads the solver's names around it
const passMoment = sample({
  clock: [passStarted, passStepped],
  source: passStore,
  filter: (pass): pass is PassType => pass !== null,
  fn: (pass) => ({ setId: (pass as PassType).setId, time: (pass as PassType).times[(pass as PassType).index]! }),
})
sample({ clock: passMoment, target: markingOpened })
sample({ clock: passMoment, fn: ({ setId, time }) => ({ setId, start: Math.max(0, time - 1.5), end: time + 1.5 }), target: loadPeopleFx })

/** "All right": the predicted names on this frame become marks, then the next rally */
export const passConfirmFx = createEffect(
  async ({ setId, marks, next }: { setId: number; marks: { time: number; box: BoxType; player_id: number }[]; next: number }) => {
    if (marks.length) await addMarksFx({ setId, marks })
    return next
  },
)
sample({ clock: passConfirmFx.doneData, target: passStepped })
