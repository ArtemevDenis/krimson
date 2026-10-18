import { useEffect, useRef } from 'preact/hooks'
import { ErrorBanner } from '@/shared/ui/feedback'
import { playerController } from '../model/player-controller'

type Props = {
  value: string
  pending: boolean
  error: string | null
  editingLabel: string | null
  onChange: (text: string) => void
  onSubmit: () => void
  onUndo: () => void
  onExitEdit: () => void
  onDismissError: () => void
}

export function CodeInput({ value, pending, error, editingLabel, onChange, onSubmit, onUndo, onExitEdit, onDismissError }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [editingLabel])

  return (
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        {editingLabel ? (
          <button
            type="button"
            class="shrink-0 rounded bg-sky-900 px-2 py-1 text-xs text-sky-100 hover:bg-sky-800"
            onClick={onExitEdit}
            title="Esc — вернуться к живой разметке"
          >
            ✎ {editingLabel} ×
          </button>
        ) : (
          <span class="shrink-0 rounded bg-rose-900/60 px-2 py-1 text-xs text-rose-100">● live</span>
        )}
        <input
          ref={ref}
          value={value}
          spellcheck={false}
          autocomplete="off"
          placeholder="s#  ·  7r+ 10e# 15a#  ·  [ начало  ] конец  + наше очко  - их очко  * в избранное"
          class="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-base outline-none focus:border-rose-500"
          onInput={(e) => onChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (!pending) onSubmit()
            } else if (e.key === 'Backspace' && value === '') {
              e.preventDefault()
              if (!pending) onUndo()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              if (value) onChange('')
              else onExitEdit()
            } else if (e.key === 'Tab') {
              e.preventDefault()
              playerController.togglePlay()
            }
          }}
        />
      </div>
      <ErrorBanner message={error} onClose={onDismissError} />
    </div>
  )
}
