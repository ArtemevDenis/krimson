import { useState } from 'preact/hooks'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/form'

type Props = {
  pending: boolean
  onImport: (text: string, replace: boolean) => void
}

const PLACEHOLDER = `15 Иван Петров доигровщик
10 Олег Смирнов связующий
7 Пётр Иванов либеро
3 Сергей Ким центральный
9 Антон Лис диагональный`

export function RosterImport({ pending, onImport }: Props) {
  const [text, setText] = useState('')
  const [replace, setReplace] = useState(false)

  return (
    <div class="flex flex-col gap-3">
      <p class="text-xs text-zinc-400">
        Одна строка — один игрок: номер, имя, амплуа (по-русски или S / OH / OPP / MB / L). Игроки с уже существующими номерами
        обновятся.
      </p>
      <Textarea rows={8} value={text} placeholder={PLACEHOLDER} onInput={(e) => setText(e.currentTarget.value)} />
      <div class="flex items-center justify-between">
        <label class="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.currentTarget.checked)} />
          Тех, кого нет в списке, пометить «не в составе»
        </label>
        <Button
          variant="primary"
          disabled={pending || !text.trim()}
          onClick={() => {
            onImport(text, replace)
            setText('')
          }}
        >
          Импортировать
        </Button>
      </div>
    </div>
  )
}
