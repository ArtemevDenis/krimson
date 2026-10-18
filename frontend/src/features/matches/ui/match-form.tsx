import { useState } from 'preact/hooks'
import type { VenueType } from '@/shared/api/schemas'
import { today } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Field, Input } from '@/shared/ui/form'
import { VenueSelect } from './venue-select'

type Props = {
  pending: boolean
  venues: VenueType[]
  onCreateVenue: (name: string) => Promise<VenueType>
  onSubmit: (draft: { opponent: string; date: string; venue_id: number | null }) => void
}

export function MatchForm({ pending, venues, onCreateVenue, onSubmit }: Props) {
  const [opponent, setOpponent] = useState('')
  const [date, setDate] = useState(today())
  const [venueId, setVenueId] = useState<number | null>(null)

  return (
    <form
      class="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1.5fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        if (!opponent.trim()) return
        onSubmit({ opponent: opponent.trim(), date, venue_id: venueId })
        setOpponent('')
      }}
    >
      <Field label="Соперник">
        <Input value={opponent} placeholder="Название команды" onInput={(e) => setOpponent(e.currentTarget.value)} />
      </Field>
      <Field label="Дата">
        <Input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
      </Field>
      <Field label="Зал (для моделей авторазметки)">
        <VenueSelect venues={venues} value={venueId} onChange={setVenueId} onCreate={onCreateVenue} />
      </Field>
      <Button type="submit" variant="primary" disabled={pending || !opponent.trim()}>
        Создать матч
      </Button>
    </form>
  )
}
