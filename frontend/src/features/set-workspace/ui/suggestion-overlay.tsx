import type { SuggestionType } from '@/shared/api/schemas'

/** Highlights the suggested player and the ball on top of the video (normalized coordinates). */
export function SuggestionOverlay({ suggestion }: { suggestion: SuggestionType | null }) {
  if (!suggestion) return null
  const [bx = 0, by = 0] = suggestion.ball
  const box = suggestion.player_box
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
      {box && (
        <rect
          x={box[0]}
          y={box[1]}
          width={(box[2] ?? 0) - (box[0] ?? 0)}
          height={(box[3] ?? 0) - (box[1] ?? 0)}
          fill="none"
          stroke="#38bdf8"
          stroke-width={0.003}
          vector-effect="non-scaling-stroke"
        />
      )}
      <ellipse cx={bx} cy={by} rx={0.012} ry={0.021} fill="none" stroke="#fbbf24" stroke-width={2} vector-effect="non-scaling-stroke" />
    </svg>
  )
}
