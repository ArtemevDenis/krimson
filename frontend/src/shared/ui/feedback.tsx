import type { ComponentChildren } from 'preact'

export function ErrorBanner({ message, onClose }: { message: string | null; onClose?: () => void }) {
  if (!message) return null
  return (
    <div class="flex items-start justify-between gap-3 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-200">
      <span>{message}</span>
      {onClose && (
        <button type="button" class="text-red-300 hover:text-white" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      )}
    </div>
  )
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100)
  return (
    <div class="flex flex-col gap-1">
      {label && (
        <div class="flex justify-between text-xs text-zinc-400">
          <span>{label}</span>
          <span class="tabular">{pct}%</span>
        </div>
      )}
      <div class="h-1.5 overflow-hidden rounded bg-zinc-800">
        <div class="h-full bg-rose-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function EmptyState({ children }: { children: ComponentChildren }) {
  return <div class="rounded-md border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">{children}</div>
}
