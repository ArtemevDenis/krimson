import { useEffect, useState } from 'preact/hooks'
import { Link } from 'wouter-preact'
import {
  AccuracyReport,
  activateVersion,
  deleteVersion,
  fetchLearningScopes,
  fetchLearningSummary,
  runLearningJob,
  TrainingStep,
  VersionList,
  type LearningJobKindType,
} from '@/features/learning'
import { errorMessage } from '@/shared/api/client'
import { watchJob } from '@/shared/api/jobs-api'
import type { JobType, LearningScopeType, LearningSummaryType } from '@/shared/api/schemas'
import { formatPct } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { EmptyState, ErrorBanner } from '@/shared/ui/feedback'

const SCOPE_STORAGE_KEY = 'krimson.learningScope'

function readStoredScope(): string {
  try {
    return localStorage.getItem(SCOPE_STORAGE_KEY) ?? 'general'
  } catch {
    return 'general'
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div class="rounded-md bg-zinc-950 px-3 py-2">
      <div class="text-[11px] text-zinc-500">{label}</div>
      <div class="text-lg font-semibold tabular">{value}</div>
    </div>
  )
}

function ScopePicker({ scopes, active, onChange }: { scopes: LearningScopeType[]; active: string; onChange: (s: string) => void }) {
  const groups: [string, LearningScopeType[]][] = [
    ['Залы', scopes.filter((s) => s.kind !== 'team')],
    ['Команды — узнавание игроков', scopes.filter((s) => s.kind === 'team')],
  ]
  return (
    <div class="flex flex-col gap-2">
      {groups.map(([title, list]) =>
        list.length === 0 ? null : (
          <div key={title} class="flex flex-wrap items-center gap-1.5">
            <span class="w-52 text-xs text-zinc-500">{title}</span>
            {list.map((s) => (
              <button
                key={s.scope}
                type="button"
                onClick={() => onChange(s.scope)}
                class={`rounded-md border px-2.5 py-1 text-sm ${
                  s.scope === active ? 'border-rose-500 bg-rose-950/40 text-white' : 'border-zinc-800 text-zinc-300 hover:border-zinc-600'
                }`}
              >
                {s.label} <span class="text-xs text-zinc-500">· {s.verified_sets}</span>
              </button>
            ))}
          </div>
        ),
      )}
    </div>
  )
}

export function LearningPage() {
  const [scopes, setScopes] = useState<LearningScopeType[]>([])
  const [scope, setScope] = useState(readStoredScope)
  const [summary, setSummary] = useState<LearningSummaryType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Partial<Record<string, JobType>>>({})
  const [tuneResult, setTuneResult] = useState<Record<string, unknown> | null>(null)

  const reload = (target = scope) => {
    void fetchLearningScopes().then(setScopes).catch((e: unknown) => setError(errorMessage(e)))
    return fetchLearningSummary(target)
      .then(setSummary)
      .catch((e: unknown) => setError(errorMessage(e)))
  }

  useEffect(() => {
    setSummary(null)
    setTuneResult(null)
    try {
      localStorage.setItem(SCOPE_STORAGE_KEY, scope)
    } catch {
      // per-viewer convenience only
    }
    void reload(scope)
  }, [scope])

  const jobKey = (kind: LearningJobKindType) => `${scope}:${kind}`

  const run = async (kind: LearningJobKindType) => {
    setError(null)
    const key = jobKey(kind)
    const runScope = scope
    try {
      const job = await runLearningJob(kind, runScope)
      setJobs((j) => ({ ...j, [key]: job }))
      watchJob(job.id, (updated) => {
        setJobs((j) => ({ ...j, [key]: updated }))
        if (updated.status === 'done') {
          if (kind === 'tune') setTuneResult(updated.result)
          void reload(runScope)
        }
      })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const changeVersion = (action: Promise<unknown>) =>
    action.then(() => reload()).catch((e: unknown) => setError(errorMessage(e)))

  const job = (kind: LearningJobKindType) => jobs[jobKey(kind)] ?? null
  const busy = (kind: LearningJobKindType) => ['running', 'queued'].includes(job(kind)?.status ?? '')
  const scopeInfo = scopes.find((s) => s.scope === scope)
  const isTeam = summary?.scope_kind === 'team'
  const isVenue = summary?.scope_kind === 'venue'
  const fallback = isVenue ? 'общая модель (или стандартная)' : 'стандартная модель'

  const sets = summary?.verified_sets ?? []
  const totals = sets.reduce(
    (acc, s) => ({ rallies: acc.rallies + s.rallies, actions: acc.actions + s.actions, precise: acc.precise + s.precise_actions }),
    { rallies: 0, actions: 0, precise: 0 },
  )
  const tuneAfter = tuneResult?.['after'] as { overall?: { rally_f1?: number; action_f1?: number } } | undefined
  const tuneBefore = tuneResult?.['before'] as { overall?: { rally_f1?: number; action_f1?: number } } | undefined

  return (
    <div class="mx-auto flex max-w-6xl flex-col gap-4">
      <div class="flex items-baseline gap-3">
        <h1 class="text-lg font-semibold">Обучение анализатора</h1>
        <span class="text-xs text-zinc-500">
          модели лежат в папке <code>models/</code> проекта — закоммитьте её, чтобы перенести на другое устройство
        </span>
      </div>
      <ErrorBanner message={error} onClose={() => setError(null)} />
      <Card>
        <ScopePicker scopes={scopes} active={scope} onChange={setScope} />
        <p class="mt-3 text-xs text-zinc-400">
          {isTeam
            ? 'Узнавание игроков общее для команды во всех залах.'
            : isVenue
              ? `У зала свои пороги и детектор мяча; где своей активной версии нет, используется общая модель. Обучение здесь не меняет модели других залов. Сейчас: ${summary?.profile ?? '…'}`
              : `Общая модель учится на всех залах и используется там, где у зала нет своих версий. Сейчас: ${summary?.profile ?? '…'}`}
        </p>
      </Card>

      {!summary ? null : (
        <>
          {!summary.cv_installed && (
            <ErrorBanner message="CV-зависимости не установлены: в папке backend выполните `uv sync --extra cv`. Оценка и подбор порогов работают и без них." />
          )}

          <Card title={`Проверенные партии — ${scopeInfo?.label ?? scope}`}>
            <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Проверено партий" value={sets.length} />
              <Stat label="Розыгрышей" value={totals.rallies} />
              <Stat label="Действий" value={totals.actions} />
              <Stat label="С точным временем" value={totals.precise} />
            </div>
            {sets.length === 0 ? (
              <EmptyState>
                Нет проверенных партий{isVenue ? ' в этом зале' : ''}. Укажите зал у матча и отметьте полностью размеченные партии «Проверена».
              </EmptyState>
            ) : (
              <table class="w-full text-xs tabular">
                <thead class="text-zinc-400">
                  <tr>
                    <th class="text-left font-normal">Партия</th>
                    <th class="px-2 text-right font-normal">Розыгрыши</th>
                    <th class="px-2 text-right font-normal">Действия</th>
                    <th class="px-2 text-right font-normal">Точное время</th>
                    <th class="px-2 text-right font-normal">С рамкой игрока</th>
                    <th class="px-2 text-right font-normal">Детекции</th>
                    <th class="px-2 text-right font-normal">Площадка</th>
                  </tr>
                </thead>
                <tbody>
                  {sets.map((s) => (
                    <tr key={s.set_id} class="border-t border-zinc-800">
                      <td class="py-1 text-left">
                        <Link href={`/sets/${s.set_id}`} class="hover:text-rose-300">
                          {s.label}
                        </Link>
                      </td>
                      <td class="px-2 text-right">{s.rallies}</td>
                      <td class="px-2 text-right">{s.actions}</td>
                      <td class="px-2 text-right">{s.precise_actions}</td>
                      <td class="px-2 text-right">{s.with_player_box}</td>
                      <td class="px-2 text-right">{s.has_detections ? '✓' : <span class="text-amber-300">нет</span>}</td>
                      <td class="px-2 text-right">{s.has_calibration ? '✓' : <span class="text-amber-300">нет</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {!isTeam && (
            <Card
              title="Точность"
              actions={
                <Button size="sm" disabled={busy('evaluate') || sets.length === 0} onClick={() => void run('evaluate')}>
                  Оценить точность
                </Button>
              }
            >
              <AccuracyReport report={summary.last_evaluation} />
            </Card>
          )}

          {!isTeam ? (
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TrainingStep
                title="Пороги"
                ready={summary.readiness.tune}
                readyHint="нужна 1 партия с детекциями"
                description="Подбор порогов поиска розыгрышей и касаний под проверенные партии этой области. Секунды. Новая версия включается, только если она лучше текущей."
                job={job('tune')}
                actions={
                  <Button variant="primary" size="sm" disabled={!summary.readiness.tune || busy('tune')} onClick={() => void run('tune')}>
                    Подобрать пороги
                  </Button>
                }
                result={
                  <div class="flex flex-col gap-2">
                    {tuneResult && (
                      <div class="text-xs text-zinc-300">
                        {tuneResult['version'] ? `Создана версия ${String(tuneResult['version'])}` : 'Лучше текущих не нашлось'}: розыгрыши F1{' '}
                        {formatPct(tuneBefore?.overall?.rally_f1)} → {formatPct(tuneAfter?.overall?.rally_f1)}, действия F1{' '}
                        {formatPct(tuneBefore?.overall?.action_f1)} → {formatPct(tuneAfter?.overall?.action_f1)}
                      </div>
                    )}
                    <VersionList
                      versions={summary.versions['params'] ?? []}
                      fallbackLabel={isVenue ? 'общие пороги (или по умолчанию)' : 'пороги по умолчанию'}
                      onActivate={(v) => void changeVersion(activateVersion(scope, 'params', v))}
                      onDelete={(v) => void changeVersion(deleteVersion(scope, 'params', v))}
                    />
                  </div>
                }
              />
              <TrainingStep
                title="Детектор мяча"
                ready={summary.readiness.ball}
                readyHint={`лучше от ${summary.readiness.min_sets_ball} партий`}
                description={
                  <>
                    Дообучение нейросети на кадрах {isVenue ? 'этого зала' : 'всех залов'}. Стартует с текущей модели ({fallback} для нового
                    зала), а не с нуля. Долго — лучше на Windows: <code>python -m app.learning train-ball --scope {scope}</code>. Новая версия
                    не включается сама: для видео понадобятся новые детекции.
                    {summary.datasets.ball && ` Датасет: ${summary.datasets.ball.images.train} + ${summary.datasets.ball.images.val} кадров.`}
                  </>
                }
                job={job('train_ball') ?? job('ball_dataset')}
                actions={
                  <>
                    <Button size="sm" disabled={sets.length === 0 || busy('ball_dataset')} onClick={() => void run('ball_dataset')}>
                      Собрать датасет
                    </Button>
                    <Button variant="primary" size="sm" disabled={!summary.datasets.ball || busy('train_ball')} onClick={() => void run('train_ball')}>
                      Обучить
                    </Button>
                  </>
                }
                result={
                  <VersionList
                    versions={summary.versions['ball'] ?? []}
                    fallbackLabel={fallback}
                    onActivate={(v) => {
                      if (v === null || confirm('Для видео этого зала понадобятся новые детекции (≈1.5 ч на партию на Mac). Включить версию?')) {
                        void changeVersion(activateVersion(scope, 'ball', v))
                      }
                    }}
                    onDelete={(v) => void changeVersion(deleteVersion(scope, 'ball', v))}
                  />
                }
              />
            </div>
          ) : (
            <TrainingStep
              title="Узнавание игроков"
              ready={summary.readiness.players}
              readyHint={`от ${summary.readiness.min_examples_player} примеров на игрока`}
              description="Классификатор «кто из состава» по виду целиком — номер, рост, форма. Примеры — подсказки, подтверждённые номером, из всех залов. Новая версия включается сразу; откатить можно ниже."
              job={job('train_players') ?? job('players_dataset')}
              actions={
                <>
                  <Button size="sm" disabled={summary.players.length === 0 || busy('players_dataset')} onClick={() => void run('players_dataset')}>
                    Собрать датасет
                  </Button>
                  <Button variant="primary" size="sm" disabled={!summary.datasets.players || busy('train_players')} onClick={() => void run('train_players')}>
                    Обучить
                  </Button>
                </>
              }
              result={
                <div class="flex flex-col gap-2">
                  {summary.players.length > 0 && (
                    <div class="flex flex-wrap gap-1 text-[11px]">
                      {summary.players.map((p) => (
                        <span
                          key={p.player_id}
                          class={`rounded px-1.5 py-0.5 ${p.examples >= summary.readiness.min_examples_player ? 'bg-emerald-950 text-emerald-200' : 'bg-zinc-800 text-zinc-400'}`}
                        >
                          #{p.number ?? '?'} {p.name}: {p.examples}
                        </span>
                      ))}
                    </div>
                  )}
                  <VersionList
                    versions={summary.versions['players'] ?? []}
                    fallbackLabel="без узнавания игроков"
                    onActivate={(v) => void changeVersion(activateVersion(scope, 'players', v))}
                    onDelete={(v) => void changeVersion(deleteVersion(scope, 'players', v))}
                  />
                </div>
              }
            />
          )}
        </>
      )}
    </div>
  )
}
