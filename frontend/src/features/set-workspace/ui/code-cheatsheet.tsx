import type { SkillType } from '@/shared/api/schemas'
import type { FaultType } from '@/shared/api/schemas'
import { EVALUATION_LABELS, EVALUATION_TONE, EVALUATIONS, FAULT_CODES, FAULT_CODES_RU, FAULT_LABELS, SKILL_LABELS, SKILLS, TEAM_FAULTS } from '@/shared/lib/volleyball'

const SKILL_KEYS: Record<Exclude<SkillType, 'N'>, string> = { S: 's / ы', R: 'r / к', A: 'a / ф', B: 'b / и', D: 'd / в', E: 'e / у', F: 'f / а', G: 'g / п' }

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
                  <span class="font-mono text-zinc-200">{SKILL_KEYS[s as Exclude<SkillType, 'N'>]}</span> {SKILL_LABELS[s]}
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
        <div>
          <p>
            <b>Нарушения</b> — <span class="font-mono text-zinc-200">v</span> (violation) или <span class="font-mono text-zinc-200">н</span>{' '}
            + тип; очко сопернику и ошибка игрока, сам элемент оценивается как обычно: <code class="text-zinc-200">10e+ 10vn</code>{' '}
            (или <code class="text-zinc-200">10нс</code>) — пас хороший, потом №10 коснулся сетки.
          </p>
          <ul class="mt-1 grid grid-cols-2 gap-x-4">
            {(Object.keys(FAULT_LABELS) as FaultType[]).map((f) => (
              <li key={f}>
                <code class="text-zinc-200">
                  {TEAM_FAULTS.includes(f) || f === 'foot' ? '' : '10'}v{FAULT_CODES[f]}
                </code>
                <span class="font-mono text-zinc-500">
                  {' / '}
                  {TEAM_FAULTS.includes(f) || f === 'foot' ? '' : '10'}н{FAULT_CODES_RU[f]}
                </span>{' '}
                {FAULT_LABELS[f]}
                {TEAM_FAULTS.includes(f) && <span class="text-zinc-500"> (команда, без номера)</span>}
                {f === 'foot' && <span class="text-zinc-500"> (без номера — подающий)</span>}
              </li>
            ))}
          </ul>
        </div>
        <p>
          <code class="text-zinc-200">[</code> начало розыгрыша · <code class="text-zinc-200">]</code> конец ·{' '}
          <code class="text-zinc-200">+</code> очко нам · <code class="text-zinc-200">-</code> очко соперникам ·{' '}
          <code class="text-zinc-200">*</code> в избранное · <code class="text-zinc-200">ё</code> (<code>`</code>) с подсказкой — рамка не на том игроке · Backspace в пустой строке — отменить последнее · Esc — выйти из
          редактирования. Очки с кодами <code>#</code> на подаче/атаке/переводе/блоке и любые <code>=</code> закрывают розыгрыш сами.
        </p>
      </div>
    </details>
  )
}
