import type { StatsSummaryType, TeamStatsType } from '@/shared/api/schemas'
import { formatPct } from '@/shared/lib/format'

export type ComparisonColumnType = { key: string; title: string; team: TeamStatsType; summary: StatsSummaryType }

export type ComparisonRowType = { label: string; hint?: string; value: (c: ComparisonColumnType) => string }

const pct = (part: number, total: number) => (total ? formatPct(part / total) : '—')

/** Rows of the set-by-set comparison; each shows one aspect of the game for a set or the whole match. */
export const COMPARISON_ROWS: ComparisonRowType[] = [
  { label: 'Счёт', value: ({ team }) => `${team.won}:${team.rallies - team.won}` },
  { label: 'Очки своей игрой', hint: 'эйсы, атаки, блоки, переводы с #', value: ({ team }) => String(team.our_points) },
  { label: 'Наши ошибки', hint: 'включая нарушения', value: ({ team }) => String(team.our_errors) },
  { label: 'Ошибки соперника', value: ({ team }) => String(team.opponent_errors) },
  { label: 'Очки соперника своей игрой', value: ({ team }) => String(team.opponent_points) },
  { label: 'Подача: эйсы / ошибки', value: ({ summary: s }) => `${s.aces} / ${s.serve_errors} из ${s.serve_total}` },
  { label: 'Приём: позитив', hint: 'оценки # и +', value: ({ summary: s }) => `${pct(s.reception_positive, s.reception_total)} (${s.reception_total})` },
  { label: 'Атака: результативность', value: ({ summary: s }) => `${pct(s.kills, s.attack_total)} (${s.kills}/${s.attack_total})` },
  {
    label: 'Атака: эффективность',
    hint: '(очки − ошибки − блоки) / всего',
    value: ({ summary: s }) => pct(s.kills - s.attack_errors - s.attack_blocked, s.attack_total),
  },
  { label: 'Блок: очки', value: ({ summary: s }) => String(s.block_points) },
  { label: 'Переводы (ошибки)', value: ({ summary: s }) => `${s.over_total} (${s.over_errors})` },
  { label: 'Нарушения', value: ({ team }) => String(team.faults) },
  { label: 'Side-out', hint: 'выиграно на приёме', value: ({ summary: s }) => `${pct(s.sideout_won, s.sideout_total)} (${s.sideout_won}/${s.sideout_total})` },
  { label: 'Break', hint: 'выиграно на своей подаче', value: ({ summary: s }) => `${pct(s.break_won, s.break_total)} (${s.break_won}/${s.break_total})` },
]
