import { useState } from 'preact/hooks'
import type { PlayerType, RallyStateType, SubstitutionType } from '@/shared/api/schemas'
import { playerLabel } from '@/shared/lib/volleyball'
import { Button } from '@/shared/ui/button'
import { Field, Select } from '@/shared/ui/form'

type Props = {
  state: RallyStateType
  players: PlayerType[]
  onSubmit: (sub: SubstitutionType) => void
}

export function SubstitutionForm({ state, players, onSubmit }: Props) {
  const onCourt = state.lineup.map((id) => players.find((p) => p.id === id)).filter((p): p is PlayerType => !!p)
  const bench = players.filter((p) => p.is_active && p.position !== 'L' && !state.lineup.includes(p.id))
  const [outId, setOutId] = useState<number | null>(null)
  const [inId, setInId] = useState<number | null>(null)

  return (
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
      <Button
        disabled={outId === null || inId === null}
        onClick={() => {
          if (outId === null || inId === null) return
          onSubmit({ out_id: outId, in_id: inId })
          setOutId(null)
          setInId(null)
        }}
      >
        Замена
      </Button>
    </div>
  )
}
