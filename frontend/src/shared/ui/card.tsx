import type { ComponentChildren } from 'preact'

type Props = {
  title?: ComponentChildren
  actions?: ComponentChildren
  class?: string
  children: ComponentChildren
}

export function Card({ title, actions, class: cls, children }: Props) {
  return (
    <section class={`rounded-lg border border-zinc-800 bg-zinc-900/60 ${cls ?? ''}`}>
      {(title || actions) && (
        <header class="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2.5">
          <h2 class="text-sm font-semibold text-zinc-200">{title}</h2>
          <div class="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div class="p-4">{children}</div>
    </section>
  )
}
