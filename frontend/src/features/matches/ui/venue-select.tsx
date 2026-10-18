import type { VenueType } from '@/shared/api/schemas'
import { Select } from '@/shared/ui/form'

const NEW = '__new__'

type Props = {
  venues: VenueType[]
  value: number | null
  onChange: (id: number | null) => void
  onCreate: (name: string) => Promise<VenueType>
}

export function VenueSelect({ venues, value, onChange, onCreate }: Props) {
  return (
    <Select
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.currentTarget.value
        if (raw === NEW) {
          e.currentTarget.value = value === null ? '' : String(value)
          const name = prompt('Название зала (например, «Домашний зал» или адрес)')
          if (name?.trim()) void onCreate(name.trim()).then((v) => onChange(v.id))
          return
        }
        onChange(raw ? Number(raw) : null)
      }}
    >
      <option value="">не указан</option>
      {venues.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
      <option value={NEW}>+ новый зал…</option>
    </Select>
  )
}
