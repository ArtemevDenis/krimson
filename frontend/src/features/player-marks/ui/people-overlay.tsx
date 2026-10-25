import type { PeopleFrameType, PlayerType } from '@/shared/api/schemas'
import type { BoxType } from '../model/marks-logic'

type Props = {
  frame: PeopleFrameType | null
  players: Map<number, PlayerType>
  onCorrect: (box: BoxType, time: number) => void
}

/** Numbers over our players while watching; a click opens the marking with that person selected. */
export function PeopleOverlay({ frame, players, onCorrect }: Props) {
  if (!frame) return null
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
      {frame.people.map((p) => {
        const unknown = p.player_id === null
        const color = unknown ? '#f87171' : p.confirmed ? '#34d399' : p.confidence >= 0.8 ? '#f4f4f5' : '#fbbf24'
        const number = p.player_id !== null ? players.get(p.player_id)?.number : undefined
        return (
          <g key={p.track} class="pointer-events-auto cursor-pointer" onClick={() => onCorrect(p.box, frame.t)}>
            <rect
              x={p.box[0]}
              y={p.box[1]}
              width={p.box[2] - p.box[0]}
              height={p.box[3] - p.box[1]}
              fill="rgba(0,0,0,0.01)"
              stroke={color}
              stroke-width={p.confirmed ? 2 : 1.5}
              stroke-dasharray={!unknown && (p.confirmed || p.confidence >= 0.8) ? undefined : '4 3'}
              vector-effect="non-scaling-stroke"
            />
            <text
              x={(p.box[0] + p.box[2]) / 2}
              y={p.box[1] - 0.008}
              text-anchor="middle"
              font-size={0.032}
              font-weight="bold"
              fill={color}
              style={{ paintOrder: 'stroke', stroke: 'black', strokeWidth: 0.006 }}
            >
              {unknown ? '?' : (number ?? '?')}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
