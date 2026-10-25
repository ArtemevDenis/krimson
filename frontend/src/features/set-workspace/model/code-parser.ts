import type { EvaluationType, FaultType, SideType, SkillType } from '@/shared/api/schemas'
import { FAULT_CODES, FAULT_CODES_RU } from '@/shared/lib/volleyball'

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
  /** `` ` `` / `ё`: the suggestion's player box is on the wrong person — keep the action, drop the box */
  | { kind: 'dropBox' }
  /** `10vn` / `10нс`: violation by #10 (net touch); team faults (`v4`, `vr`) have no number, `vf` defaults to the server */
  | { kind: 'fault'; number: number | null; fault: FaultType }

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
  // violations: v + type (n, c, d, h, f, 4, r) — к, в, а are already mapped above
  'п': 'g',
  'м': 'v',
  'ё': '`',
  'т': 'n',
  'с': 'c',
  'р': 'h',
}

const invert = (codes: Record<FaultType, string>) =>
  Object.fromEntries(Object.entries(codes).map(([fault, key]) => [key, fault as FaultType])) as Record<string, FaultType>
const FAULT_KEYS = invert(FAULT_CODES)
const FAULT_KEYS_RU = invert(FAULT_CODES_RU)

const ACTION_RE = /^(\d{1,2})?([srabdefg])([#+!\-/=])$/
const QUICK_RE = /^(\d{1,2})([#+!\-/=])$/
const FAULT_RE = /^(\d{1,2})?v([ncdhf4r])$/
// Russian mnemonics are matched before the keyboard-layout mapping, which would scramble them
const FAULT_RU_RE = /^(\d{1,2})?н([сцдзл4п])$/

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
    case '`':
      return { kind: 'dropBox' }
  }
  const fault = FAULT_RE.exec(token)
  if (fault) return { kind: 'fault', number: fault[1] ? Number(fault[1]) : null, fault: FAULT_KEYS[fault[2]!]! }
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
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { ok: false, error: 'Пустая команда' }
  const commands: CommandType[] = []
  for (const raw of tokens) {
    const ru = FAULT_RU_RE.exec(raw)
    const token = normalizeCode(raw)
    const command: CommandType | null = ru
      ? { kind: 'fault', number: ru[1] ? Number(ru[1]) : null, fault: FAULT_KEYS_RU[ru[2]!]! }
      : parseToken(token)
    if (!command) return { ok: false, error: `Не понял код «${token}». Формат: номер + элемент + оценка, например 15a#` }
    commands.push(command)
  }
  return { ok: true, commands }
}

export function formatActionCode(
  number: number | null | undefined,
  skill: SkillType,
  evaluation: EvaluationType,
  fault: FaultType | null = null,
): string {
  if (fault || skill === 'N') return `${number ?? ''}V${fault ? FAULT_CODES[fault].toUpperCase() : ''}`
  return `${number ?? ''}${skill}${evaluation}`
}
