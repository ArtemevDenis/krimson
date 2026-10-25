import type { SuggestionType } from '@/shared/api/schemas'

/** How close to the touch (seconds) the highlight stays: the boxes mark one frame, not the whole clip. */
const SHOW_WITHIN_SECONDS = 0.35

/** Highlights the suggested player and the ball on top of the video (normalized coordinates) at the touch. */
export function SuggestionOverlay({ suggestion, time, hideBox }: { suggestion: SuggestionType | null; time: number; hideBox: boolean }) {
  if (!suggestion || Math.abs(time - suggestion.time) > SHOW_WITHIN_SECONDS) return null
  const [bx = 0, by = 0] = suggestion.ball
  const box = hideBox ? null : suggestion.player_box
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
      {box && (
        <rect
          x={box[0]}
          y={box[1]}
          width={(box[2] ?? 0) - (box[0] ?? 0)}
          height={(box[3] ?? 0) - (box[1] ?? 0)}
          fill="rgba(56,189,248,0.08)"
          stroke="#38bdf8"
          stroke-width={2.5}
          vector-effect="non-scaling-stroke"
        />
      )}
      <ellipse cx={bx} cy={by} rx={0.012} ry={0.021} fill="none" stroke="#fbbf24" stroke-width={2} vector-effect="non-scaling-stroke" />
    </svg>
  )
}
