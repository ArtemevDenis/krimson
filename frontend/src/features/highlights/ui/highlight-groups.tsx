import { useState } from 'preact/hooks'
import type { HighlightGroupType, HighlightRallyType, PlayerType } from '@/shared/api/schemas'
import type { SkillType, EvaluationType } from '@/shared/api/schemas'
import { formatTime } from '@/shared/lib/format'
import { EVALUATION_TONE } from '@/shared/lib/volleyball'
import { Button } from '@/shared/ui/button'
import { EmptyState, ProgressBar } from '@/shared/ui/feedback'
import { Field, Input } from '@/shared/ui/form'
import type { ExportStateType } from '../model/highlights-model'

type Props = {
  groups: HighlightGroupType[]
  excluded: Record<string, number[]>
  exports: ExportStateType[]
  roster: PlayerType[]
  onToggle: (groupKey: string, rallyId: number) => void
  onExport: (group: HighlightGroupType, pre: number, post: number) => void
}

export function HighlightGroups({ groups, excluded, exports, roster, onToggle, onExport }: Props) {
  const [preview, setPreview] = useState<HighlightRallyType | null>(null)
  const [pre, setPre] = useState(2)
  const [post, setPost] = useState(2)
  const numbers = new Map(roster.map((p) => [p.id, p.number]))

  if (groups.length === 0) {
    return (
      <EmptyState>
        Хайлайтов пока нет. Они собираются из размеченных розыгрышей с началом и концом: эйсы, блоки, атаки, длинные розыгрыши и
        отмеченные ★.
      </EmptyState>
    )
  }

  return (
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
      <div class="flex flex-col gap-4">
        <div class="flex gap-3">
          <Field label="Захват до, сек" class="w-36">
            <Input type="number" min={0} max={10} step={0.5} value={pre} onInput={(e) => setPre(Number(e.currentTarget.value))} />
          </Field>
          <Field label="Захват после, сек" class="w-36">
            <Input type="number" min={0} max={10} step={0.5} value={post} onInput={(e) => setPost(Number(e.currentTarget.value))} />
          </Field>
        </div>

        {groups.map((g) => {
          const skip = excluded[g.key] ?? []
          const count = g.rallies.length - skip.length
          const jobs = exports.filter((e) => e.groupKey === g.key)
          return (
            <section key={g.key} class="rounded-md border border-zinc-800 bg-zinc-950">
              <header class="flex items-center gap-3 border-b border-zinc-800 px-3 py-2">
                <h3 class="flex-1 text-sm font-semibold">
                  {g.title} <span class="font-normal text-zinc-500">· {count}</span>
                </h3>
                <Button size="sm" variant="primary" disabled={count === 0} onClick={() => onExport(g, pre, post)}>
                  Собрать ролик
                </Button>
              </header>
              {jobs.length > 0 && (
                <div class="flex flex-col gap-1.5 border-b border-zinc-800 px-3 py-2">
                  {jobs.map(({ job }) =>
                    job.status === 'done' && typeof job.result?.['url'] === 'string' ? (
                      <a key={job.id} href={job.result['url']} class="text-xs text-emerald-300 hover:underline" download>
                        ⬇ Скачать {String(job.result['file'] ?? '')}
                      </a>
                    ) : job.status === 'failed' ? (
                      <div key={job.id} class="text-xs text-red-300">
                        Ошибка экспорта: {job.error}
                      </div>
                    ) : (
                      <ProgressBar key={job.id} value={job.progress} label="Собираю ролик…" />
                    ),
                  )}
                </div>
              )}
              <ul class="flex flex-col">
                {g.rallies.map((r) => (
                  <li key={r.rally_id} class="flex items-center gap-2 border-t border-zinc-900 px-3 py-1.5 text-xs first:border-t-0">
                    <input type="checkbox" checked={!skip.includes(r.rally_id)} onChange={() => onToggle(g.key, r.rally_id)} />
                    <span class="w-14 text-zinc-500">партия {r.set_number}</span>
                    <span class="w-10 font-semibold tabular">{r.score}</span>
                    <span class="w-24 text-zinc-500 tabular">{formatTime(r.end - r.start).slice(0, 5)}</span>
                    <span class="flex flex-1 flex-wrap gap-1 font-mono">
                      {r.actions.map(([pid, skill, ev], i) => (
                        <span key={i} class={EVALUATION_TONE[ev as EvaluationType]}>
                          {pid !== null ? (numbers.get(pid) ?? '') : ''}
                          {skill as SkillType}
                          {ev}
                        </span>
                      ))}
                    </span>
                    <button type="button" class="text-zinc-400 hover:text-white" onClick={() => setPreview(r)}>
                      ▶
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <aside class="lg:sticky lg:top-4 lg:self-start">
        {preview ? (
          <video
            key={`${preview.rally_id}`}
            src={`/api/videos/${preview.video_id}/stream#t=${Math.max(0, preview.start - pre)},${preview.end + post}`}
            controls
            autoPlay
            class="aspect-video w-full rounded-md bg-black"
          />
        ) : (
          <EmptyState>Нажмите ▶, чтобы посмотреть момент</EmptyState>
        )}
      </aside>
    </div>
  )
}
