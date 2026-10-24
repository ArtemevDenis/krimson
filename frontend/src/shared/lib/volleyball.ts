import type { EvaluationType, FaultType, PlayerType, PositionType, SkillType } from '@/shared/api/schemas'

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
  G: 'Перевод',
  N: 'Нарушение',
}

/** Ball-touch elements; N (violation) is entered with its own code */
export const SKILLS: SkillType[] = ['S', 'R', 'E', 'A', 'G', 'B', 'D', 'F']

export const FAULT_LABELS: Record<FaultType, string> = {
  foot: 'заступ при подаче',
  net: 'касание сетки',
  line: 'заступ за центральную линию',
  double: 'двойное касание',
  catch: 'захват',
  four: 'четыре касания',
  rotation: 'переход / неверная расстановка',
}
/** Letter after «v» in the code: 10vn — #10 touched the net */
export const FAULT_CODES: Record<FaultType, string> = { foot: 'f', net: 'n', line: 'c', double: 'd', catch: 'h', four: '4', rotation: 'r' }
/** Russian alternative: letter after «н» (нарушение) — 10нс, #10 touched the сетка */
export const FAULT_CODES_RU: Record<FaultType, string> = { foot: 'л', net: 'с', line: 'ц', double: 'д', catch: 'з', four: '4', rotation: 'п' }
/** A foot fault is recorded as a serve error, so it shows up in serve stats too */
export const faultSkill = (fault: FaultType): SkillType => (fault === 'foot' ? 'S' : 'N')
/** Faults of the whole team: entered without a player number */
export const TEAM_FAULTS: FaultType[] = ['four', 'rotation']
export const EVALUATIONS: EvaluationType[] = ['#', '+', '!', '-', '/', '=']

export const EVALUATION_LABELS: Record<SkillType, Record<EvaluationType, string>> = {
  S: { '#': 'эйс', '+': 'соперник принял плохо', '!': 'принял с ограничениями', '-': 'принял хорошо', '/': 'соперник перебросил', '=': 'ошибка' },
  R: { '#': 'идеально', '+': 'хорошо', '!': 'без первого темпа', '-': 'плохо', '/': 'перебросил', '=': 'ошибка' },
  A: { '#': 'очко', '+': 'хорошая, мяч в игре', '!': 'отбита блоком к нам', '-': 'легко защищена', '/': 'заблокирована', '=': 'ошибка' },
  B: { '#': 'очко', '+': 'смягчил, мяч наш', '!': 'смягчил, мяч у них', '-': 'касание, атакуют снова', '/': 'касание сетки', '=': 'ошибка' },
  D: { '#': 'идеально', '+': 'хорошо', '!': 'в игре', '-': 'плохо', '/': 'перебросил', '=': 'не поднял' },
  E: { '#': 'идеально', '+': 'хорошо', '!': 'в игре', '-': 'плохо', '/': 'перебросил', '=': 'ошибка' },
  F: { '#': 'идеально', '+': 'хорошо', '!': 'в игре', '-': 'плохо', '/': 'перебросил', '=': 'ошибка' },
  G: { '#': 'очко', '+': 'соперник принял плохо', '!': 'принял с ограничениями', '-': 'принял хорошо', '/': 'заблокирован', '=': 'ошибка' },
  N: { '#': '', '+': '', '!': '', '-': '', '/': '', '=': 'нарушение' },
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
