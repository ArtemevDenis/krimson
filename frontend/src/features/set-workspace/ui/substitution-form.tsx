import { useState } from 'preact/hooks'
import type { PlayerType, PositionType, RallyStateType, SubstitutionType } from '@/shared/api/schemas'
import { POSITION_LABELS, playerLabel } from '@/shared/lib/volleyball'
import { Button } from '@/shared/ui/button'
import { Field, Select } from '@/shared/ui/form'

type Props = {
  state: RallyStateType
  players: PlayerType[]
  onSubmit: (sub: SubstitutionType) => void
}

const ROLES: PositionType[] = ['S', 'OH', 'OPP', 'MB']

export function SubstitutionForm({ state, players, onSubmit }: Props) {
  const onCourt = state.lineup.map((id) => players.find((p) => p.id === id)).filter((p): p is PlayerType => !!p)
  const bench = players.filter((p) => p.is_active && p.position !== 'L' && !state.lineup.includes(p.id))
  const [outId, setOutId] = useState<number | null>(null)
  const [inId, setInId] = useState<number | null>(null)
  // null = takes over the role of the player he replaces
  const [role, setRole] = useState<PositionType | null>(null)
  const [forServe, setForServe] = useState(false)
  const outIndex = outId === null ? -1 : state.lineup.indexOf(outId)
  const replacedRole = outIndex >= 0 ? state.lineup_roles[outIndex] : null

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-end gap-2">
        <Field label="Уходит" class="flex-1">
          <Select value={outId ?? ''} onChange={(e) => setOutId(Number(e.currentTarget.value) || null)}>
            <option value="">—</option>
            {onCourt.map((p) => (
              <option key={p.id} value={p.id}>
                {playerLabel(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Выходит" class="flex-1">
          <Select value={inId ?? ''} onChange={(e) => setInId(Number(e.currentTarget.value) || null)}>
            <option value="">—</option>
            {bench.map((p) => (
              <option key={p.id} value={p.id}>
                {playerLabel(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Играет" class="flex-1">
          <Select value={role ?? ''} onChange={(e) => setRole((e.currentTarget.value || null) as PositionType | null)}>
            <option value="">{replacedRole ? `по позиции (${POSITION_LABELS[replacedRole].toLowerCase()})` : 'по позиции'}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {POSITION_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-1" title="Основной игрок вернётся позже — приложение подскажет когда">
          <input type="checkbox" checked={forServe} onChange={(e) => setForServe(e.currentTarget.checked)} />
          на подачу
        </label>
        <Button
          class="ml-auto"
          disabled={outId === null || inId === null}
          onClick={() => {
            if (outId === null || inId === null) return
            onSubmit({ out_id: outId, in_id: inId, kind: forServe ? 'serve' : 'regular', role })
            setOutId(null)
            setInId(null)
            setRole(null)
            setForServe(false)
          }}
        >
          Замена
        </Button>
      </div>
    </div>
  )
}
