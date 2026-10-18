type Tab<K extends string> = { key: K; label: string }

export function Tabs<K extends string>({ tabs, active, onChange }: { tabs: Tab<K>[]; active: K; onChange: (key: K) => void }) {
  return (
    <div class="flex gap-1 border-b border-zinc-800">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          class={`-mb-px border-b-2 px-3 py-2 text-sm ${t.key === active ? 'border-rose-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
