// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { startHeartbeat } from './heartbeat'

describe('startHeartbeat', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let beacon: ReturnType<typeof vi.fn>
  let stop: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    beacon = vi.fn(() => true)
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    stop = startHeartbeat(5_000)
  })

  afterEach(() => {
    stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const urls = () => fetchMock.mock.calls.map(([url]) => String(url))

  it('checks in straight away and then every interval', () => {
    expect(urls()).toHaveLength(1)
    expect(urls()[0]).toMatch(/^\/__kong-heartbeat\?tab=[\w-]+$/)
    vi.advanceTimersByTime(10_000)
    expect(urls()).toHaveLength(3)
    expect(new Set(urls()).size).toBe(1)
  })

  it('says goodbye with the same tab id when the page is hidden', () => {
    window.dispatchEvent(new Event('pagehide'))
    expect(beacon).toHaveBeenCalledWith(`${urls()[0]}&bye=1`)
  })

  it('checks in again when the page comes back from the back/forward cache', () => {
    const show = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(show, 'persisted', { value: true })
    window.dispatchEvent(show)
    expect(urls()).toHaveLength(2)
  })

  it('stops checking in once stopped', () => {
    stop()
    vi.advanceTimersByTime(20_000)
    window.dispatchEvent(new Event('pagehide'))
    expect(urls()).toHaveLength(1)
    expect(beacon).not.toHaveBeenCalled()
  })
})
