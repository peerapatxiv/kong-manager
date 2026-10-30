// Tells the local server this tab is open, so the macOS app can stop the server once every
// tab is closed (see tools/autoStop.ts). Only runs under the local proxy.
const HEARTBEAT_PATH = '/__kong-heartbeat'

export function startHeartbeat(intervalMs = 5_000): () => void {
  const tab = crypto.randomUUID()
  const url = (bye: boolean) => `${HEARTBEAT_PATH}?tab=${tab}${bye ? '&bye=1' : ''}`
  const beat = () => {
    fetch(url(false), { method: 'POST', keepalive: true }).catch(() => {})
  }
  const onHide = () => {
    navigator.sendBeacon(url(true))
  }
  // A page restored from the back/forward cache said goodbye when it was hidden.
  const onShow = (event: PageTransitionEvent) => {
    if (event.persisted) beat()
  }

  beat()
  const timer = setInterval(beat, intervalMs)
  window.addEventListener('pagehide', onHide)
  window.addEventListener('pageshow', onShow)
  return () => {
    clearInterval(timer)
    window.removeEventListener('pagehide', onHide)
    window.removeEventListener('pageshow', onShow)
  }
}
