import { useState } from 'preact/hooks'
import type { GameSetType, PlayerType, PositionType } from '@/shared/api/schemas'
import { POSITION_LABELS, POSITION_SHORT, playerLabel } from '@/shared/lib/volleyball'
import { Button } from '@/shared/ui/button'
import { Field, Select } from '@/shared/ui/form'
import { COURT_ZONES } from '../model/rally-logic'

type Props = {
  set: GameSetType
  players: PlayerType[]
  pending: boolean
  onSave: (patch: { lineup: number[]; lineup_roles: RoleType[]; libero_ids: number[]; we_serve_first: boolean }) => void
}

type RoleType = Exclude<PositionType, 'L'>
const ROLES: RoleType[] = ['S', 'OH', 'OPP', 'MB']

/** The roster position is only a default: in a given set a player may play another role. */
function defaultRole(player: PlayerType | undefined): RoleType {
  return player && player.position !== 'L' ? player.position : 'OH'
}

export function LineupEditor({ set, players, pending, onSave }: Props) {
  const active = players.filter((p) => p.is_active)
  const [lineup, setLineup] = useState<(number | null)[]>(set.lineup.length === 6 ? set.lineup : [null, null, null, null, null, null])
  const [roles, setRoles] = useState<RoleType[]>(() =>
    set.lineup_roles?.length === 6
      ? (set.lineup_roles.map((r) => (r === 'L' ? 'OH' : r)) as RoleType[])
      : lineup.map((id) => defaultRole(players.find((p) => p.id === id))),
  )
  const [libero, setLibero] = useState<number | null>(set.libero_ids[0] ?? active.find((p) => p.position === 'L')?.id ?? null)
  const [serveFirst, setServeFirst] = useState(set.we_serve_first)

  const complete = lineup.every((id) => id !== null) && new Set(lineup).size === 6
  const setters = roles.filter((r) => r === 'S').length
  const option = (p: PlayerType) => (
    <option key={p.id} value={p.id}>
      {playerLabel(p)} · {POSITION_SHORT[p.position]}
    </option>
  )

  return (
    <div class="flex flex-col gap-4">
      <p class="text-xs text-zinc-400">
        Стартовая расстановка нашей команды на эту партию. Зона 1 — подающий. Роль подставляется из состава, но в каждой партии её
        можно поменять. Дальше приложение само ведёт переходы, подачу и замену либеро на центрального в задней линии.
      </p>
      <div class="flex flex-col gap-2">
        <div class="h-1 rounded bg-zinc-500" />
        {COURT_ZONES.map((row, i) => (
          <div key={i} class="grid grid-cols-3 gap-2">
            {row.map((zone) => (
              <Field key={zone} label={`Зона ${zone}`}>
                <Select
                  value={lineup[zone - 1] ?? ''}
                  onChange={(e) => {
                    const id = e.currentTarget.value ? Number(e.currentTarget.value) : null
                    const next = [...lineup]
                    next[zone - 1] = id
                    setLineup(next)
                    const nextRoles = [...roles]
                    nextRoles[zone - 1] = defaultRole(players.find((p) => p.id === id))
                    setRoles(nextRoles)
                  }}
                >
                  <option value="">—</option>
                  {active.filter((p) => p.position !== 'L').map(option)}
                </Select>
                <Select
                  class="mt-1"
                  value={roles[zone - 1]}
                  onChange={(e) => {
                    const nextRoles = [...roles]
                    nextRoles[zone - 1] = e.currentTarget.value as RoleType
                    setRoles(nextRoles)
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {POSITION_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        ))}
      </div>
      <div class="grid grid-cols-2 gap-3">
        <Field label="Либеро">
          <Select value={libero ?? ''} onChange={(e) => setLibero(e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
            <option value="">без либеро</option>
            {active.map(option)}
          </Select>
        </Field>
        <Field label="Первая подача">
          <Select value={serveFirst ? 'us' : 'them'} onChange={(e) => setServeFirst(e.currentTarget.value === 'us')}>
            <option value="us">мы</option>
            <option value="them">соперник</option>
          </Select>
        </Field>
      </div>
      {!complete && <p class="text-xs text-amber-300">Нужно выбрать 6 разных игроков.</p>}
      {complete && setters !== 1 && (
        <p class="text-xs text-amber-300">Связующих в расстановке: {setters}. Расстановки P1–P6 считаются по одному связующему.</p>
      )}
      <Button
        variant="primary"
        disabled={!complete || pending}
        onClick={() => onSave({ lineup: lineup as number[], lineup_roles: roles, libero_ids: libero !== null ? [libero] : [], we_serve_first: serveFirst })}
      >
        Сохранить расстановку
      </Button>
    </div>
  )
}
