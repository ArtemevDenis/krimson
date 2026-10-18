import type { EvaluationType, SideType, SkillType } from '@/shared/api/schemas'

export type CommandType =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'winner'; side: SideType }
  | { kind: 'star' }
  | { kind: 'action'; number: number | null; skill: SkillType; evaluation: EvaluationType }
  /** `31+`: number + evaluation, the skill comes from the active CV suggestion */
  | { kind: 'quick'; number: number; evaluation: EvaluationType }
  /** `x`: reject the active suggestion */
  | { kind: 'reject' }

export type ParseResultType = { ok: true; commands: CommandType[] } | { ok: false; error: string }

// Same physical keys on the Russian ЙЦУКЕН layout, so codes can be typed without switching layouts
const RU_TO_LATIN: Record<string, string> = {
  'ы': 's',
  'к': 'r',
  'ф': 'a',
  'и': 'b',
  'в': 'd',
  'у': 'e',
  'а': 'f',
  'х': '[',
  'ъ': ']',
  '№': '#',
  'ч': 'x',
  '.': '/',
}

const ACTION_RE = /^(\d{1,2})?([srabdef])([#+!\-/=])$/
const QUICK_RE = /^(\d{1,2})([#+!\-/=])$/

export function normalizeCode(text: string): string {
  return [...text.toLowerCase()].map((ch) => RU_TO_LATIN[ch] ?? ch).join('')
}

function parseToken(token: string): CommandType | null {
  switch (token) {
    case '[':
      return { kind: 'start' }
    case ']':
      return { kind: 'end' }
    case '+':
      return { kind: 'winner', side: 'us' }
    case '-':
      return { kind: 'winner', side: 'them' }
    case '*':
      return { kind: 'star' }
    case 'x':
      return { kind: 'reject' }
  }
  const quick = QUICK_RE.exec(token)
  if (quick) return { kind: 'quick', number: Number(quick[1]), evaluation: quick[2] as EvaluationType }
  const m = ACTION_RE.exec(token)
  if (!m) return null
  return {
    kind: 'action',
    number: m[1] ? Number(m[1]) : null,
    skill: m[2]!.toUpperCase() as SkillType,
    evaluation: m[3] as EvaluationType,
  }
}

/** `15a#`, `s-`, `7r+ 10e# 15a#`, `[`, `]`, `+`, `-`, `*` — several codes separated by spaces. */
export function parseCommandLine(text: string): ParseResultType {
  const tokens = normalizeCode(text).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { ok: false, error: 'Пустая команда' }
  const commands: CommandType[] = []
  for (const token of tokens) {
    const command = parseToken(token)
    if (!command) return { ok: false, error: `Не понял код «${token}». Формат: номер + элемент + оценка, например 15a#` }
    commands.push(command)
  }
  return { ok: true, commands }
}

export function formatActionCode(number: number | null | undefined, skill: SkillType, evaluation: EvaluationType): string {
  return `${number ?? ''}${skill}${evaluation}`
}
