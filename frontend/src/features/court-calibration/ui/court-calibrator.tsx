import { useEffect, useRef, useState } from 'preact/hooks'
import { errorMessage } from '@/shared/api/client'
import type { CalibrationType } from '@/shared/api/schemas'
import { formatTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ErrorBanner } from '@/shared/ui/feedback'
import { fetchCalibrations, postCalibration, removeCalibration } from '../api/calibration-api'
import { CENTER_LINE, COURT_OUTLINE, FRAME_PADDING, POINT_COUNT, POINT_LABELS, toFrame, type PointType } from '../model/court-points'

export type CapturedFrameType = { image: string; time: number }

type Props = {
  videoId: number
  captureFrame: () => CapturedFrameType | null
  onSeek: (time: number) => void
  onChanged: (calibrations: CalibrationType[]) => void
}

const R = 0.008
const VIEW = `${-FRAME_PADDING} ${-FRAME_PADDING} ${1 + 2 * FRAME_PADDING} ${1 + 2 * FRAME_PADDING}`

export function CourtCalibrator({ videoId, captureFrame, onSeek, onChanged }: Props) {
  const [calibrations, setCalibrations] = useState<CalibrationType[]>([])
  const [frame, setFrame] = useState<CapturedFrameType | null>(null)
  const [points, setPoints] = useState<PointType[]>([])
  const [dragging, setDragging] = useState<number | null>(null)
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
    setPoints([])
    setError(null)
  }

  const save = async () => {
    if (!frame || points.length !== POINT_COUNT) return
    try {
      update(await postCalibration(videoId, frame.time, points))
      setFrame(null)
      setPoints([])
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const outline = (idx: readonly number[]) => idx.map((i) => points[i]).filter((p): p is PointType => !!p)

  return (
    <div class="flex flex-col gap-3">
      <ErrorBanner message={error} onClose={() => setError(null)} />
      <p class="text-xs text-zinc-400">
        Остановите видео на кадре, где хорошо видна площадка, и нажмите «Взять кадр». Затем кликните 6 точек по подсказке. Если угол
        за кадром — кликните в серое поле примерно там, где он должен быть. Точки можно перетаскивать. Если камеру переставляли —
        сделайте отдельную разметку с момента перестановки.
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
            <Button size="sm" variant="ghost" disabled={points.length === 0} onClick={() => setPoints(points.slice(0, -1))}>
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
                Точка {points.length + 1}/{POINT_COUNT}: <b class="text-rose-300">{POINT_LABELS[points.length]}</b>
                <span class="text-xs text-zinc-500"> (лево/право — как на экране)</span>
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
              if (dragging !== null || points.length >= POINT_COUNT) return
              const p = pointerPos(e)
              if (p) setPoints([...points, p])
            }}
            onPointerMove={(e) => {
              if (dragging === null) return
              const p = pointerPos(e)
              if (p) setPoints(points.map((q, i) => (i === dragging ? p : q)))
            }}
            onPointerUp={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
          >
            <image href={frame.image} x={0} y={0} width={1} height={1} preserveAspectRatio="none" />
            {outline(COURT_OUTLINE).length === 4 && (
              <polygon
                points={outline(COURT_OUTLINE).map((p) => p.join(',')).join(' ')}
                fill="rgba(244,63,94,0.12)"
                stroke="#f43f5e"
                stroke-width={0.003}
              />
            )}
            {outline(CENTER_LINE).length === 2 && (
              <polyline points={outline(CENTER_LINE).map((p) => p.join(',')).join(' ')} stroke="#fbbf24" stroke-width={0.004} fill="none" />
            )}
            {points.map(([x, y], i) => (
              <g
                key={i}
                class="cursor-move"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setDragging(i)
                }}
              >
                <ellipse cx={x} cy={y} rx={R} ry={R * (16 / 9)} fill={i >= 4 ? '#fbbf24' : '#f43f5e'} stroke="white" stroke-width={0.002} />
                <text x={x + 0.012} y={y - 0.012} font-size={0.03} fill="white" style={{ paintOrder: 'stroke', stroke: 'black', strokeWidth: 0.004 }}>
                  {i + 1}
                </text>
              </g>
            ))}
          </svg>
        </>
      )}
    </div>
  )
}
