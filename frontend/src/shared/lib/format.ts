export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '--:--'
  const total = Math.max(0, seconds)
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  const tenth = Math.floor((total * 10) % 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenth}`
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value * 100)}%`
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
