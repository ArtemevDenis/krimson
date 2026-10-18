import type { AnalyzerMetricsType, EvaluationReportType } from '@/shared/api/schemas'
import { formatPct } from '@/shared/lib/format'
import { EmptyState } from '@/shared/ui/feedback'

const seconds = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} с`)

function Row({ label, m }: { label: string; m: AnalyzerMetricsType }) {
  return (
    <tr class="border-t border-zinc-800">
      <td class="py-1 pr-3 text-left">{label}</td>
      <td class="px-2 text-right">
        {m.rallies_found}/{m.rallies_true}
      </td>
      <td class="px-2 text-right">{m.rallies_false}</td>
      <td class="px-2 text-right font-semibold">{formatPct(m.rally_f1)}</td>
      <td class="px-2 text-right">{seconds(m.start_error_s)}</td>
      <td class="px-2 text-right">{seconds(m.end_error_s)}</td>
      <td class="px-2 text-right">{formatPct(m.action_recall)}</td>
      <td class="px-2 text-right">{formatPct(m.action_precision)}</td>
      <td class="px-2 text-right font-semibold">{formatPct(m.action_f1)}</td>
    </tr>
  )
}

export function AccuracyReport({ report }: { report: EvaluationReportType | null }) {
  if (!report) return <EmptyState>Оценки ещё не было. Нажмите «Оценить точность» — анализатор прогонится по проверенным партиям.</EmptyState>
  return (
    <div class="flex flex-col gap-2">
      <div class="overflow-x-auto">
        <table class="w-full text-xs tabular">
          <thead class="text-zinc-400">
            <tr>
              <th class="text-left font-normal">Партия</th>
              <th class="px-2 text-right font-normal" title="найдено из реальных">Розыгрыши</th>
              <th class="px-2 text-right font-normal" title="лишние, которых не было">Лишние</th>
              <th class="px-2 text-right font-normal">F1</th>
              <th class="px-2 text-right font-normal" title="средняя ошибка начала">Δ начала</th>
              <th class="px-2 text-right font-normal" title="средняя ошибка конца">Δ конца</th>
              <th class="px-2 text-right font-normal" title="какую долю ваших действий угадали">Действия: полнота</th>
              <th class="px-2 text-right font-normal" title="какая доля подсказок верна">точность</th>
              <th class="px-2 text-right font-normal">F1</th>
            </tr>
          </thead>
          <tbody>
            {report.sets.map((s) => (
              <Row key={s.set_id} label={s.label} m={s} />
            ))}
            <Row label="Итого" m={report.overall} />
          </tbody>
        </table>
      </div>
      {report.skipped && report.skipped.length > 0 && (
        <ul class="text-xs text-amber-300">
          {report.skipped.map((s) => (
            <li key={s}>пропущено: {s}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
