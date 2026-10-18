import { useState } from 'preact/hooks'
import { today } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Field, Input } from '@/shared/ui/form'

type Props = {
  pending: boolean
  onSubmit: (draft: { opponent: string; date: string; venue: string | null }) => void
}

export function MatchForm({ pending, onSubmit }: Props) {
  const [opponent, setOpponent] = useState('')
  const [date, setDate] = useState(today())
  const [venue, setVenue] = useState('')

  return (
    <form
      class="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1.5fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        if (!opponent.trim()) return
        onSubmit({ opponent: opponent.trim(), date, venue: venue.trim() || null })
        setOpponent('')
        setVenue('')
      }}
    >
      <Field label="Соперник">
        <Input value={opponent} placeholder="Название команды" onInput={(e) => setOpponent(e.currentTarget.value)} />
      </Field>
      <Field label="Дата">
        <Input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
      </Field>
      <Field label="Место (необязательно)">
        <Input value={venue} onInput={(e) => setVenue(e.currentTarget.value)} />
      </Field>
      <Button type="submit" variant="primary" disabled={pending || !opponent.trim()}>
        Создать матч
      </Button>
    </form>
  )
}
