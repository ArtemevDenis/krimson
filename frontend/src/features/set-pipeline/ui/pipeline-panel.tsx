import { useRef, useState } from 'preact/hooks'
import type { PipelineStepType } from '@/shared/api/schemas'
import { Button } from '@/shared/ui/button'

type Props = {
  steps: PipelineStepType[]
  onAction: (step: PipelineStepType) => void
  onUploadBall: (file: File) => void
  uploading: boolean
}

const ICON: Record<PipelineStepType['status'], string> = { done: '✓', attention: '!', todo: '○', blocked: '·', running: '◌' }
const TONE: Record<PipelineStepType['status'], string> = {
  done: 'text-emerald-400',
  attention: 'text-amber-300',
  todo: 'text-sky-300',
  blocked: 'text-zinc-600',
  running: 'text-sky-300 animate-pulse',
}

const ACTION_LABELS: Record<string, string> = {
  video: 'Подключить',
  lineup: 'Задать',
  court: 'Разметить',
  find_rallies: 'Найти',
  review_rallies: 'Проверить',
  detect_persons: 'Найти людей',
  players_pass: 'Проход по игрокам',
  upload_ball: 'Загрузить файл',
  analyze: 'Подсказки',
  tagging: 'К разметке',
  learning: 'Обучение',
}

/** The set's processing steps in order, each with its state and the action that moves it forward. */
export function PipelinePanel({ steps, onAction, onUploadBall, uploading }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const next = steps.find((s) => s.status === 'todo' || s.status === 'attention')
  if (!steps.length) return null

  return (
    <div class="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs">
      <div class="flex items-center gap-2">
        <b class="text-sm">Обработка партии</b>
        <span class="text-zinc-500">
          {steps.filter((s) => s.status === 'done').length} из {steps.length} этапов
          {next ? ` · дальше: ${next.title}` : ' · всё готово'}
        </span>
        <button type="button" class="ml-auto text-zinc-500 hover:text-white" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? 'показать' : 'свернуть'}
        </button>
      </div>
      {!collapsed && (
        <ol class="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
          {steps.map((step, i) => (
            <li
              key={step.key}
              class={`flex items-start gap-2 rounded px-2 py-1 ${step === next ? 'bg-zinc-900 ring-1 ring-sky-800' : ''}`}
            >
              <span class={`w-4 text-center font-bold ${TONE[step.status]}`}>{ICON[step.status]}</span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class={step.status === 'blocked' ? 'text-zinc-500' : 'text-zinc-200'}>
                  {i + 1}. {step.title}
                  {step.status === 'running' && step.progress !== undefined && ` — ${Math.round(step.progress * 100)}%`}
                </span>
                <span class="text-zinc-500">{step.detail}</span>
                {step.command && step.status !== 'done' && (
                  <code class="mt-0.5 select-all break-all text-[11px] text-zinc-400">{step.command}</code>
                )}
              </span>
              {step.action && step.status !== 'running' && step.status !== 'blocked' && (
                <Button
                  size="sm"
                  variant={step === next ? 'primary' : 'ghost'}
                  disabled={step.action === 'upload_ball' && uploading}
                  onClick={() => (step.action === 'upload_ball' ? fileRef.current?.click() : onAction(step))}
                >
                  {step.action === 'upload_ball' && uploading ? 'Загрузка…' : (ACTION_LABELS[step.action] ?? 'Сделать')}
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".gz"
        class="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) onUploadBall(file)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}
