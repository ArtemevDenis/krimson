/** Imperative handle to the <video> element: hotkeys and code commands need the exact current frame time,
 * which a store updated on `timeupdate` (~4 Hz) can't provide. */
let element: HTMLVideoElement | null = null
let stopSegment: (() => void) | null = null

export const playerController = {
  attach(el: HTMLVideoElement | null) {
    element = el
  },
  time(): number {
    return element?.currentTime ?? 0
  },
  seek(seconds: number) {
    if (!element) return
    element.currentTime = Math.max(0, Math.min(seconds, element.duration || seconds))
  },
  seekBy(delta: number) {
    if (element) this.seek(element.currentTime + delta)
  },
  togglePlay() {
    if (!element) return
    if (element.paused) void element.play()
    else element.pause()
  },
  pause() {
    element?.pause()
  },
  setRate(rate: number) {
    if (element) element.playbackRate = rate
  },
  playSegment(start: number, end: number) {
    if (!element) return
    const el = element
    stopSegment?.()
    const check = () => {
      if (el.currentTime >= end) {
        el.pause()
        cleanup()
      }
    }
    const cleanup = () => {
      el.removeEventListener('timeupdate', check)
      el.removeEventListener('seeking', onSeek)
      stopSegment = null
    }
    // A manual seek outside the segment cancels the auto-stop
    const onSeek = () => {
      if (el.currentTime < start - 0.5 || el.currentTime > end) cleanup()
    }
    el.currentTime = start
    el.addEventListener('timeupdate', check)
    el.addEventListener('seeking', onSeek)
    stopSegment = cleanup
    void el.play()
  },
}
