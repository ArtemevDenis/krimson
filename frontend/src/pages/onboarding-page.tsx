import { useUnit } from 'effector-react'
import { useState } from 'preact/hooks'
import { createTeamFx } from '@/shared/model/team-model'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Field, Input } from '@/shared/ui/form'

export function OnboardingPage() {
  const [name, setName] = useState('')
  const pending = useUnit(createTeamFx.pending)

  return (
    <div class="mx-auto mt-24 max-w-md">
      <Card title="Krimson — статистика волейбольных матчей">
        <form
          class="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void createTeamFx(name.trim())
          }}
        >
          <p class="text-sm text-zinc-400">Для начала назовите свою команду. Состав можно будет загрузить списком.</p>
          <Field label="Название команды">
            <Input value={name} onInput={(e) => setName(e.currentTarget.value)} />
          </Field>
          <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
            Создать
          </Button>
        </form>
      </Card>
    </div>
  )
}
