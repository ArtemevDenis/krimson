import type { SkillType } from '@/shared/api/schemas'
import { EVALUATION_LABELS, EVALUATION_TONE, EVALUATIONS, SKILL_LABELS, SKILLS } from '@/shared/lib/volleyball'

const SKILL_KEYS: Record<SkillType, string> = { S: 's / ы', R: 'r / к', A: 'a / ф', B: 'b / и', D: 'd / в', E: 'e / у', F: 'f / а' }

export function CodeCheatsheet() {
  return (
    <details class="text-xs text-zinc-400">
      <summary class="cursor-pointer select-none text-zinc-300">Шпаргалка по кодам</summary>
      <div class="mt-2 flex flex-col gap-3">
        <p>
          Код = <b>номер</b> + <b>элемент</b> + <b>оценка</b>: <code class="text-zinc-200">15a#</code>. Несколько кодов через пробел.
          Без номера: подача — подающий, передача — связующий на площадке. Русская раскладка тоже работает (№ = #, «.» = /).
        </p>
        <table class="w-full">
          <thead>
            <tr class="text-zinc-500">
              <th class="text-left font-normal">Элемент</th>
              {EVALUATIONS.map((e) => (
                <th key={e} class={`font-mono font-bold ${EVALUATION_TONE[e]}`}>
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SKILLS.map((s) => (
              <tr key={s} class="border-t border-zinc-800 align-top">
                <td class="py-1 pr-2 whitespace-nowrap">
                  <span class="font-mono text-zinc-200">{SKILL_KEYS[s]}</span> {SKILL_LABELS[s]}
                </td>
                {EVALUATIONS.map((e) => (
                  <td key={e} class="px-1 py-1 text-center text-[11px] leading-tight">
                    {EVALUATION_LABELS[s][e]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <code class="text-zinc-200">[</code> начало розыгрыша · <code class="text-zinc-200">]</code> конец ·{' '}
          <code class="text-zinc-200">+</code> очко нам · <code class="text-zinc-200">-</code> очко соперникам ·{' '}
          <code class="text-zinc-200">*</code> в избранное · Backspace в пустой строке — отменить последнее · Esc — выйти из
          редактирования. Очки с кодами <code>#</code> на подаче/атаке/блоке и любые <code>=</code> закрывают розыгрыш сами.
        </p>
      </div>
    </details>
  )
}
