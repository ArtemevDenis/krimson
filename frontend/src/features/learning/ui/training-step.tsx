import type { ComponentChildren } from 'preact'
import type { JobType } from '@/shared/api/schemas'
import { ProgressBar } from '@/shared/ui/feedback'

type Props = {
  title: string
  ready: boolean
  readyHint: string
  description: ComponentChildren
  actions: ComponentChildren
  job: JobType | null
  result?: ComponentChildren
}

export function TrainingStep({ title, ready, readyHint, description, actions, job, result }: Props) {
  return (
    <section class="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <header class="flex items-center gap-2">
        <h3 class="text-sm font-semibold">{title}</h3>
        <span class={`rounded px-1.5 py-0.5 text-[11px] ${ready ? 'bg-emerald-900 text-emerald-200' : 'bg-zinc-800 text-zinc-400'}`}>
          {ready ? 'данных достаточно' : readyHint}
        </span>
      </header>
      <div class="text-xs leading-relaxed text-zinc-400">{description}</div>
      <div class="flex flex-wrap gap-2">{actions}</div>
      {job && (job.status === 'running' || job.status === 'queued') && <ProgressBar value={job.progress} label="Выполняется…" />}
      {job?.status === 'failed' && <div class="text-xs text-red-300">Ошибка: {job.error}</div>}
      {result}
    </section>
  )
}
