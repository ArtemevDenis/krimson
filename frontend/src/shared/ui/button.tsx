import type { ComponentChildren, JSX } from 'preact'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-rose-600 hover:bg-rose-500 text-white',
  secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700',
  ghost: 'hover:bg-zinc-800 text-zinc-300',
  danger: 'bg-red-900/60 hover:bg-red-800 text-red-100',
}

type Props = Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'size'> & {
  variant?: Variant
  size?: 'sm' | 'md'
  disabled?: boolean
  type?: 'button' | 'submit'
  children: ComponentChildren
}

export function Button({ variant = 'secondary', size = 'md', class: cls, type = 'button', ...rest }: Props) {
  const sizing = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  return (
    <button
      type={type}
      class={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${sizing} ${VARIANTS[variant]} ${cls ?? ''}`}
      {...rest}
    />
  )
}
