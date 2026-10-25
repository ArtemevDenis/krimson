import { useEffect, useState } from 'preact/hooks'
import { playerController } from './player-controller'

/** The video's time on every animation frame while `active`: labels over a playing video must not lag behind it
 * (the element's own timeupdate fires only ~4 times a second). */
export function useVideoTime(active: boolean): number {
  const [time, setTime] = useState(() => playerController.time())
  useEffect(() => {
    if (!active) return
    let frame = 0
    const tick = () => {
      setTime(playerController.time())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])
  return time
}
