import { describe, expect, it } from 'vitest'
import { videoHotkey } from './hotkeys'

const key = (code: string, mods: Partial<{ altKey: boolean; shiftKey: boolean }> = {}) => ({
  code,
  altKey: false,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
})

describe('videoHotkey', () => {
  it('seeks with Alt+arrows even while typing codes', () => {
    expect(videoHotkey(key('ArrowLeft', { altKey: true }), true)).toEqual({ kind: 'seek', delta: -2 })
    expect(videoHotkey(key('ArrowRight', { altKey: true, shiftKey: true }), true)).toEqual({ kind: 'seek', delta: 10 })
  })

  it('leaves plain keys to text fields', () => {
    expect(videoHotkey(key('Space'), true)).toBeNull()
    expect(videoHotkey(key('Space'), false)).toEqual({ kind: 'toggle' })
  })
})
