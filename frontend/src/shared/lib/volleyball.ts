import type { EvaluationType, PlayerType, PositionType, SkillType } from '@/shared/api/schemas'

export const POSITION_LABELS: Record<PositionType, string> = {
  S: 'Связующий',
  OH: 'Доигровщик',
  OPP: 'Диагональный',
  MB: 'Центральный',
  L: 'Либеро',
}

export const POSITION_SHORT: Record<PositionType, string> = {
  S: 'СВ',
  OH: 'ДГ',
  OPP: 'ДИ',
  MB: 'ЦБ',
  L: 'ЛБ',
}

export const SKILL_LABELS: Record<SkillType, string> = {
  S: 'Подача',
  R: 'Приём',
  A: 'Атака',
  B: 'Блок',
  D: 'Защита',
  E: 'Передача',
  F: 'Свободный',
}

export const SKILLS: SkillType[] = ['S', 'R', 'E', 'A', 'B', 'D', 'F']
export const EVALUATIONS: EvaluationType[] = ['#', '+', '!', '-', '/', '=']

export const EVALUATION_LABELS: Record<SkillType, Record<EvaluationType, string>> = {
  S: { '#': 'эйс', '+': 'соперник принял плохо', '!': 'принял с ограничениями', '-': 'принял хорошо', '/': 'соперник перебросил', '=': 'ошибка' },
  R: { '#': 'идеально', '+': 'хорошо', '!': 'без первого темпа', '-': 'плохо', '/': 'перебросил', '=': 'ошибка' },
  A: { '#': 'очко', '+': 'хорошая, мяч в игре', '!': 'отбита блоком к нам', '-': 'легко защищена', '/': 'заблокирована', '=': 'ошибка' },
  B: { '#': 'очко', '+': 'смягчил, мяч наш', '!': 'смягчил, мяч у них', '-': 'касание, атакуют снова', '/': 'касание сетки', '=': 'ошибка' },
  D: { '#': 'идеально', '+': 'хорошо', '!': 'в игре', '-': 'плохо', '/': 'перебросил', '=': 'не поднял' },
  E: { '#': 'идеально', '+': 'хорошо', '!': 'в игре', '-': 'плохо', '/': 'перебросил', '=': 'ошибка' },
  F: { '#': 'идеально', '+': 'хорошо', '!': 'в игре', '-': 'плохо', '/': 'перебросил', '=': 'ошибка' },
}

export const EVALUATION_TONE: Record<EvaluationType, string> = {
  '#': 'text-emerald-400',
  '+': 'text-lime-300',
  '!': 'text-zinc-300',
  '-': 'text-amber-300',
  '/': 'text-orange-400',
  '=': 'text-red-400',
}

export function playerLabel(player: PlayerType | undefined): string {
  if (!player) return '—'
  return player.number !== null ? `#${player.number} ${player.name}` : player.name
}

export function shortName(player: PlayerType | undefined): string {
  if (!player) return '—'
  const [first = '', last] = player.name.split(/\s+/)
  return last ? `${first} ${last[0]}.` : first
}
