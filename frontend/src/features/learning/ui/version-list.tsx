import type { ModelVersionType } from '@/shared/api/schemas'
import { formatPct } from '@/shared/lib/format'

type Props = {
  versions: ModelVersionType[]
  fallbackLabel: string
  onActivate: (version: string | null) => void
  onDelete: (version: string) => void
}

function headline(v: ModelVersionType): string {
  const m = v.metrics ?? {}
  const num = (k: string) => (typeof m[k] === 'number' ? (m[k] as number) : null)
  if (v.kind === 'params') return `розыгрыши F1 ${formatPct(num('rally_f1'))} · действия F1 ${formatPct(num('action_f1'))}`
  if (v.kind === 'ball') return `mAP50 ${formatPct(num('mAP50(B)'))} · recall ${formatPct(num('recall(B)'))}`
  return `точность ${formatPct(num('accuracy_top1'))}`
}

export function VersionList({ versions, fallbackLabel, onActivate, onDelete }: Props) {
  const anyActive = versions.some((v) => v.active)
  return (
    <div class="flex flex-col gap-1 text-xs">
      <div class={`flex items-center gap-2 rounded px-2 py-1 ${anyActive ? 'bg-zinc-950 text-zinc-500' : 'bg-emerald-950/50 text-emerald-200'}`}>
        <span>{fallbackLabel}</span>
        {anyActive ? (
          <button type="button" class="ml-auto hover:text-white" onClick={() => onActivate(null)}>
            использовать
          </button>
        ) : (
          <span class="ml-auto">используется</span>
        )}
      </div>
      {versions.map((v) => (
        <div key={v.version} class={`flex flex-wrap items-center gap-x-2 rounded px-2 py-1 ${v.active ? 'bg-emerald-950/50' : 'bg-zinc-950'}`}>
          <span class="font-mono font-semibold">{v.version}</span>
          <span class="text-zinc-500">{v.created.slice(0, 16).replace('T', ' ')}</span>
          <span class="text-zinc-300">{headline(v)}</span>
          {v.base && <span class="text-zinc-500">от {v.base}</span>}
          <span class="ml-auto flex gap-2">
            {v.active ? (
              <span class="text-emerald-300">активна</span>
            ) : (
              <>
                <button type="button" class="text-sky-300 hover:text-white" onClick={() => onActivate(v.version)}>
                  сделать активной
                </button>
                <button
                  type="button"
                  class="text-zinc-500 hover:text-red-400"
                  onClick={() => {
                    if (confirm(`Удалить версию ${v.version}? Файлы удалятся из models/.`)) onDelete(v.version)
                  }}
                >
                  удалить
                </button>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
