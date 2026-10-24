import { useEffect, useRef, useState } from 'preact/hooks'
import { errorMessage } from '@/shared/api/client'
import type { CalibrationType } from '@/shared/api/schemas'
import { formatTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ErrorBanner } from '@/shared/ui/feedback'
import { fetchCalibrations, postCalibration, removeCalibration } from '../api/calibration-api'
import {
  CENTER_LINE,
  CLICK_COUNT,
  COURT_OUTLINE,
  cyclicOrder,
  FRAME_PADDING,
  HALF_CORNERS,
  halvesToCourt,
  POINT_COUNT,
  toFrame,
  type PointType,
} from '../model/court-points'

export type CapturedFrameType = { image: string; time: number }

type Props = {
  videoId: number
  captureFrame: () => CapturedFrameType | null
  onSeek: (time: number) => void
  onChanged: (calibrations: CalibrationType[]) => void
}

const SPAN = 1 + 2 * FRAME_PADDING
// Sizes are in frame units, so they shrink with the padding; scale them back to how they looked with the original 15%
const SIZE = SPAN / 1.3
const R = 0.008 * SIZE
const LINE = 0.003 * SIZE
/** Invisible grab area around a point: much easier to hit than the dot itself */
const GRAB_R = 0.03 * SIZE
const DRAG_START_PX = 4
const OUR_COLOR = '#f43f5e'
const THEIR_COLOR = '#38bdf8'
const VIEW = `${-FRAME_PADDING} ${-FRAME_PADDING} ${SPAN} ${SPAN}`

export function CourtCalibrator({ videoId, captureFrame, onSeek, onChanged }: Props) {
  const [calibrations, setCalibrations] = useState<CalibrationType[]>([])
  const [frame, setFrame] = useState<CapturedFrameType | null>(null)
  // Raw clicks: 4 corners of our half, then 4 of the opponent's; turned into the 6 court points when complete
  const [clicks, setClicks] = useState<PointType[]>([])
  const [points, setPoints] = useState<PointType[]>([])
  // While clicking, a raw click is dragged; once the court is built, one of its 6 points.
  // A press on a point becomes a drag only after the pointer moves: a plain click on it still adds a new point,
  // which is needed for the center line ends that belong to both halves.
  const [pressed, setPressed] = useState<{ kind: 'click' | 'point'; index: number; x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState<{ kind: 'click' | 'point'; index: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const update = (list: CalibrationType[]) => {
    setCalibrations(list)
    onChanged(list)
  }

  useEffect(() => {
    fetchCalibrations(videoId).then(update).catch((e: unknown) => setError(errorMessage(e)))
  }, [videoId])

  const pointerPos = (e: PointerEvent): PointType | null => {
    const box = svgRef.current?.getBoundingClientRect()
    return box ? toFrame(e.clientX, e.clientY, box) : null
  }

  const take = () => {
    const captured = captureFrame()
    if (!captured) {
      setError('Видео ещё не загрузилось — запустите воспроизведение и попробуйте снова')
      return
    }
    setFrame(captured)
    setClicks([])
    setPoints([])
    setError(null)
  }

  const save = async () => {
    if (!frame || points.length !== POINT_COUNT) return
    try {
      update(await postCalibration(videoId, frame.time, points))
      setFrame(null)
      setClicks([])
      setPoints([])
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const outline = (idx: readonly number[]) => idx.map((i) => points[i]).filter((p): p is PointType => !!p)
  const addClick = (p: PointType) => {
    const next = [...clicks, p]
    setClicks(next)
    if (next.length < CLICK_COUNT) return
    const court = halvesToCourt(next.slice(0, HALF_CORNERS), next.slice(HALF_CORNERS))
    if (court) {
      setPoints(court)
    } else {
      setError('Половины не сходятся по центральной линии: концы центральной линии нужно кликнуть в обеих половинах в тех же местах. Отмените последние точки (↶) и поправьте.')
    }
  }
  const undo = () => {
    setPoints([])
    setClicks(clicks.slice(0, -1))
  }
  const halfPolygon = (half: PointType[]) => (half.length === HALF_CORNERS ? cyclicOrder(half) : half).map((p) => p.join(',')).join(' ')
  const ourClicks = clicks.slice(0, HALF_CORNERS)
  const theirClicks = clicks.slice(HALF_CORNERS)

  return (
    <div class="flex flex-col gap-3">
      <ErrorBanner message={error} onClose={() => setError(null)} />
      <p class="text-xs text-zinc-400">
        Остановите видео на кадре, где хорошо видна площадка, и нажмите «Взять кадр». Кликните 4 угла <b>нашей половины</b>, затем 4 угла{' '}
        <b>половины соперника</b> — в любом порядке; концы центральной линии входят в обе половины. Если угол за кадром — кликните в серое
        поле, где сходятся продолжения линий. Потом точки можно перетаскивать. Если камеру переставляли — сделайте отдельную разметку с
        момента перестановки.
      </p>

      {calibrations.length > 0 && (
        <ul class="flex flex-col gap-1 text-xs">
          {calibrations.map((c) => (
            <li key={c.id} class="flex items-center gap-2 rounded bg-zinc-950 px-2 py-1">
              <button type="button" class="text-zinc-300 hover:text-white tabular" onClick={() => onSeek(c.from_time)}>
                с {formatTime(c.from_time)}
              </button>
              <span class={c.error_m > 0.5 ? 'text-amber-300' : 'text-zinc-500'}>
                точность ±{c.error_m.toFixed(2)} м{c.error_m > 0.5 ? ' — проверьте точки' : ''}
              </span>
              <button
                type="button"
                class="ml-auto text-zinc-500 hover:text-red-400"
                onClick={() => void removeCalibration(c.id).then(update).catch((e: unknown) => setError(errorMessage(e)))}
              >
                удалить
              </button>
            </li>
          ))}
        </ul>
      )}

      <div class="flex items-center gap-2">
        <Button onClick={take}>Взять кадр</Button>
        {frame && (
          <>
            <span class="text-xs text-zinc-400 tabular">кадр {formatTime(frame.time)}</span>
            <Button size="sm" variant="ghost" disabled={clicks.length === 0} onClick={undo}>
              ↶ точка
            </Button>
            <Button variant="primary" class="ml-auto" disabled={points.length !== POINT_COUNT} onClick={() => void save()}>
              Сохранить площадку
            </Button>
          </>
        )}
      </div>

      {frame && (
        <>
          <div class="text-sm">
            {points.length < POINT_COUNT ? (
              <span>
                Точка {clicks.length + 1}/{CLICK_COUNT}:{' '}
                {clicks.length < HALF_CORNERS ? (
                  <b class="text-rose-300">угол нашей половины</b>
                ) : (
                  <b class="text-sky-300">угол половины соперника</b>
                )}
                <span class="text-xs text-zinc-500"> (два угла у задней линии и два конца центральной, в любом порядке)</span>
              </span>
            ) : (
              <span class="text-emerald-300">Все точки на месте. Проверьте, что контур совпадает с линиями, и сохраните.</span>
            )}
          </div>
          <svg
            ref={svgRef}
            viewBox={VIEW}
            preserveAspectRatio="none"
            class="aspect-video w-full cursor-crosshair touch-none rounded bg-zinc-800 select-none"
            onPointerDown={(e) => {
              if (dragging !== null || pressed !== null || clicks.length >= CLICK_COUNT) return
              const p = pointerPos(e)
              if (p) addClick(p)
            }}
            onPointerMove={(e) => {
              let target = dragging
              if (target === null && pressed !== null && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > DRAG_START_PX) {
                target = { kind: pressed.kind, index: pressed.index }
                setDragging(target)
              }
              if (target === null) return
              const p = pointerPos(e)
              if (!p) return
              const { kind, index } = target
              if (kind === 'point') setPoints(points.map((q, i) => (i === index ? p : q)))
              else setClicks(clicks.map((q, i) => (i === index ? p : q)))
            }}
            onPointerUp={(e) => {
              if (pressed !== null && dragging === null && clicks.length < CLICK_COUNT) {
                const p = pointerPos(e)
                if (p) addClick(p)
              }
              setPressed(null)
              setDragging(null)
            }}
            onPointerLeave={() => {
              setPressed(null)
              setDragging(null)
            }}
          >
            <image href={frame.image} x={0} y={0} width={1} height={1} preserveAspectRatio="none" />
            {points.length === 0 &&
              [
                { half: ourClicks, color: OUR_COLOR, fill: 'rgba(244,63,94,0.12)' },
                { half: theirClicks, color: THEIR_COLOR, fill: 'rgba(56,189,248,0.12)' },
              ].map(({ half, color, fill }) => (
                <g key={color}>
                  {half.length > 1 && (
                    <polygon points={halfPolygon(half)} fill={half.length === HALF_CORNERS ? fill : 'none'} stroke={color} stroke-width={LINE} />
                  )}
                  {half.map(([x, y], i) => (
                    <Handle
                      key={i}
                      x={x}
                      y={y}
                      color={color}
                      onGrab={(x, y) => setPressed({ kind: 'click', index: (color === OUR_COLOR ? 0 : HALF_CORNERS) + i, x, y })}
                    />
                  ))}
                </g>
              ))}
            {outline(COURT_OUTLINE).length === 4 && (
              <polygon
                points={outline(COURT_OUTLINE).map((p) => p.join(',')).join(' ')}
                fill="rgba(244,63,94,0.12)"
                stroke="#f43f5e"
                stroke-width={LINE}
              />
            )}
            {outline(CENTER_LINE).length === 2 && (
              <polyline points={outline(CENTER_LINE).map((p) => p.join(',')).join(' ')} stroke="#fbbf24" stroke-width={LINE * 1.3} fill="none" />
            )}
            {points.map(([x, y], i) => (
              <Handle key={i} x={x} y={y} color={i >= 4 ? '#fbbf24' : OUR_COLOR} onGrab={(px, py) => setPressed({ kind: 'point', index: i, x: px, y: py })} />
            ))}
          </svg>
        </>
      )}
    </div>
  )
}

/** A draggable point: the visible dot plus a larger transparent grab area. */
function Handle({ x, y, color, onGrab }: { x: number; y: number; color: string; onGrab: (clientX: number, clientY: number) => void }) {
  return (
    <g
      class="cursor-move"
      onPointerDown={(e) => {
        e.stopPropagation()
        onGrab(e.clientX, e.clientY)
      }}
    >
      <ellipse cx={x} cy={y} rx={GRAB_R} ry={GRAB_R * (16 / 9)} fill="transparent" />
      <ellipse cx={x} cy={y} rx={R} ry={R * (16 / 9)} fill={color} stroke="white" stroke-width={LINE * 0.7} />
    </g>
  )
}
