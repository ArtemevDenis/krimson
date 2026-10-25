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
  play() {
    if (element) void element.play()
  },
  isPlaying(): boolean {
    return !!element && !element.paused && !element.ended
  },
  /** Current frame as an image (same-origin video, so the canvas isn't tainted). */
  captureFrame(): { image: string; time: number } | null {
    if (!element || element.readyState < 2 || !element.videoWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = element.videoWidth
    canvas.height = element.videoHeight
    canvas.getContext('2d')?.drawImage(element, 0, 0)
    return { image: canvas.toDataURL('image/jpeg', 0.85), time: element.currentTime }
  },
  setRate(rate: number) {
    if (element) element.playbackRate = rate
  },
  /** Paused on one frame, cancelling any segment playback (to look closely at the touch). */
  showFrame(seconds: number) {
    stopSegment?.()
    element?.pause()
    this.seek(seconds)
  },
  /**
   * Plays the context of a touch: from `start`, holds on the touch frame for `holdMs` so the player can be read,
   * then plays on to `end` to show where the ball went. A manual pause or seek hands control back to the user.
   */
  playReview(start: number, touch: number, end: number, holdMs = 800) {
    if (!element) return
    const el = element
    stopSegment?.()
    let held = false
    let ourPause = false
    let frame = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      if (!held && el.currentTime >= touch) {
        held = true
        ourPause = true
        el.pause()
        el.currentTime = touch
        timer = setTimeout(() => void el.play(), holdMs)
      } else if (held && el.currentTime >= end) {
        ourPause = true
        el.pause()
        cleanup()
        return
      }
      frame = requestAnimationFrame(tick)
    }
    const onPause = () => {
      if (ourPause) ourPause = false
      else cleanup()
    }
    const onSeek = () => {
      if (el.currentTime < start - 0.5 || el.currentTime > end) cleanup()
    }
    const cleanup = () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('seeking', onSeek)
      stopSegment = null
    }
    el.currentTime = start
    el.addEventListener('pause', onPause)
    el.addEventListener('seeking', onSeek)
    stopSegment = cleanup
    frame = requestAnimationFrame(tick)
    void el.play()
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
