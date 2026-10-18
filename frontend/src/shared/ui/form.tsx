import type { ComponentChildren, JSX } from 'preact'

const CONTROL = 'w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-rose-500'

export function Field({ label, children, class: cls }: { label: string; children: ComponentChildren; class?: string }) {
  return (
    <label class={`flex flex-col gap-1 text-xs text-zinc-400 ${cls ?? ''}`}>
      {label}
      {children}
    </label>
  )
}

export function Input({ class: cls, ...rest }: JSX.HTMLAttributes<HTMLInputElement> & { value?: string | number; type?: string; placeholder?: string; min?: number; max?: number; step?: number }) {
  return <input class={`${CONTROL} ${cls ?? ''}`} {...rest} />
}

export function Select({ class: cls, ...rest }: JSX.HTMLAttributes<HTMLSelectElement> & { value?: string | number }) {
  return <select class={`${CONTROL} ${cls ?? ''}`} {...rest} />
}

export function Textarea({ class: cls, ...rest }: JSX.HTMLAttributes<HTMLTextAreaElement> & { value?: string; rows?: number; placeholder?: string }) {
  return <textarea class={`${CONTROL} font-mono ${cls ?? ''}`} {...rest} />
}
