import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Lets the local server stop itself once every app tab is closed. Used by the macOS app
 * (KONG_MANAGER_AUTO_STOP=1); a plain `npm start` or `dev:proxy` keeps running.
 *
 * Each tab POSTs `${HEARTBEAT_PATH}?tab=<id>` every few seconds, and `&bye=1` when it closes.
 */
export const HEARTBEAT_PATH = '/__kong-heartbeat'

export type TabTrackerOptions = {
  now?: () => number
  /** How long to wait after the last tab closes, so a reload doesn't stop the server. */
  closeGraceMs?: number
  /** A tab that hasn't checked in for this long is treated as closed. Kept long because
   * browsers slow timers in background tabs to about once a minute. */
  staleMs?: number
  /** Stop if no tab has opened this long after start. */
  startupMs?: number
}

export function createTabTracker(options: TabTrackerOptions = {}) {
  const { now = Date.now, closeGraceMs = 10_000, staleMs = 180_000, startupMs = 180_000 } = options
  const lastSeen = new Map<string, number>()
  const startedAt = now()
  let emptySince: number | null = null

  return {
    beat(id: string) {
      lastSeen.set(id, now())
      emptySince = null
    },
    bye(id: string) {
      if (!lastSeen.delete(id)) return
      if (lastSeen.size === 0) emptySince = now()
    },
    shouldStop(): boolean {
      const time = now()
      // forEach, not for...of: tsconfig.node.json compiles tools/ to a target without Map iteration.
      lastSeen.forEach((seen, id) => {
        if (time - seen > staleMs) {
          lastSeen.delete(id)
          if (lastSeen.size === 0) emptySince = seen + staleMs
        }
      })
      if (lastSeen.size > 0) return false
      if (emptySince === null) return time - startedAt > startupMs
      return time - emptySince > closeGraceMs
    },
  }
}

type Tracker = { beat(id: string): void; bye(id: string): void }

export function heartbeatMiddleware(tracker: Tracker) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = new URL(req.url ?? '', 'http://localhost')
    if (url.pathname !== HEARTBEAT_PATH) {
      next()
      return
    }
    const tab = url.searchParams.get('tab')
    if (tab) {
      if (url.searchParams.has('bye')) tracker.bye(tab)
      else tracker.beat(tab)
    }
    res.statusCode = 204
    res.end()
  }
}

/** Checks every couple of seconds and exits the process once every tab has gone. */
export function watchTabs(tracker: ReturnType<typeof createTabTracker>, onStop: () => void, intervalMs = 2_000) {
  const timer = setInterval(() => {
    if (!tracker.shouldStop()) return
    clearInterval(timer)
    onStop()
  }, intervalMs)
  timer.unref()
  return timer
}
