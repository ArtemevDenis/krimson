import type { PlayerType } from '@/shared/api/schemas'
import type { BoxType, MarkedPersonType, PredictedType } from '../model/marks-logic'

type Props = {
  persons: MarkedPersonType[]
  /** The solver's names for the same people (shown with "?" until confirmed) */
  predicted?: PredictedType[]
  selected: BoxType | null
  players: Map<number, PlayerType>
  onSelect: (box: BoxType) => void
}

const same = (a: BoxType | null, b: BoxType) => !!a && a.every((v, i) => v === b[i])

/** Detected people as clickable boxes over the paused video; marked ones carry the player's number. */
export function PlayerMarksOverlay({ persons, predicted = [], selected, players, onSelect }: Props) {
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" class="absolute inset-0 h-full w-full">
      {persons.map(({ box, mark, ignored }, i) => {
        const isSelected = same(selected, box)
        const color = isSelected ? '#fbbf24' : mark ? '#34d399' : ignored ? '#71717a' : '#a1a1aa'
        const number = mark ? players.get(mark.player_id)?.number : undefined
        return (
          <g key={i} class="cursor-pointer" onClick={() => onSelect(box)}>
            <rect
              x={box[0]}
              y={box[1]}
              width={box[2] - box[0]}
              height={box[3] - box[1]}
              fill={isSelected ? 'rgba(251,191,36,0.15)' : 'rgba(0,0,0,0.01)'}
              stroke={color}
              stroke-width={isSelected ? 3 : 1.5}
              stroke-dasharray={ignored && !isSelected ? '2 3' : undefined}
              vector-effect="non-scaling-stroke"
            />
            {!mark && !ignored && predicted[i] && (
              <text
                x={box[0]}
                y={box[1] - 0.008}
                font-size={0.03}
                fill={isSelected ? '#fbbf24' : (predicted[i]?.confidence ?? 0) >= 0.8 ? '#f4f4f5' : '#fbbf24'}
                style={{ paintOrder: 'stroke', stroke: 'black', strokeWidth: 0.006 }}
              >
                {players.get(predicted[i]!.player_id)?.number ?? '?'}?
              </text>
            )}
            {ignored && !mark && (
              <text x={box[0]} y={box[1] - 0.008} font-size={0.026} fill="#71717a" style={{ paintOrder: 'stroke', stroke: 'black', strokeWidth: 0.005 }}>
                не наш
              </text>
            )}
            {mark && (
              <text
                x={box[0]}
                y={box[1] - 0.008}
                font-size={0.03}
                fill={color}
                style={{ paintOrder: 'stroke', stroke: 'black', strokeWidth: 0.006 }}
              >
                {number ?? '?'}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
