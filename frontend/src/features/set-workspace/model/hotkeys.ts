export type HotkeyActionType = { kind: 'toggle' } | { kind: 'seek'; delta: number }

type KeyInfoType = Pick<KeyboardEvent, 'code' | 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>

// event.code, not event.key: works the same on Russian and English layouts
export function videoHotkey(e: KeyInfoType, inTextField: boolean): HotkeyActionType | null {
  if (e.ctrlKey || e.metaKey) return null
  const step = e.shiftKey ? 10 : 2
  if (e.altKey && e.code === 'ArrowLeft') return { kind: 'seek', delta: -step }
  if (e.altKey && e.code === 'ArrowRight') return { kind: 'seek', delta: step }
  if (inTextField || e.altKey) return null
  if (e.code === 'Space') return { kind: 'toggle' }
  if (e.code === 'ArrowLeft') return { kind: 'seek', delta: -step }
  if (e.code === 'ArrowRight') return { kind: 'seek', delta: step }
  return null
}

export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
