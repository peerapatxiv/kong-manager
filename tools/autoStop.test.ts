import { describe, it, expect } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createTabTracker, heartbeatMiddleware, HEARTBEAT_PATH } from './autoStop'

function clock(start = 0) {
  let time = start
  return { now: () => time, advance: (ms: number) => (time += ms) }
}

const options = { closeGraceMs: 10_000, staleMs: 180_000, startupMs: 180_000 }

describe('createTabTracker', () => {
  it('keeps running while a tab is open', () => {
    const c = clock()
    const tracker = createTabTracker({ ...options, now: c.now })
    tracker.beat('a')
    c.advance(60_000)
    expect(tracker.shouldStop()).toBe(false)
  })

  it('stops once the last tab has said goodbye and the grace period passes', () => {
    const c = clock()
    const tracker = createTabTracker({ ...options, now: c.now })
    tracker.beat('a')
    tracker.bye('a')
    c.advance(9_000)
    expect(tracker.shouldStop()).toBe(false)
    c.advance(2_000)
    expect(tracker.shouldStop()).toBe(true)
  })

  it('keeps running through a reload, which says goodbye then comes back', () => {
    const c = clock()
    const tracker = createTabTracker({ ...options, now: c.now })
    tracker.beat('a')
    tracker.bye('a')
    c.advance(1_000)
    tracker.beat('b')
    c.advance(20_000)
    expect(tracker.shouldStop()).toBe(false)
  })

  it('keeps running while another tab is still open', () => {
    const c = clock()
    const tracker = createTabTracker({ ...options, now: c.now })
    tracker.beat('a')
    tracker.beat('b')
    tracker.bye('a')
    c.advance(20_000)
    expect(tracker.shouldStop()).toBe(false)
  })

  it('drops a tab that stopped checking in without saying goodbye', () => {
    const c = clock()
    const tracker = createTabTracker({ ...options, now: c.now })
    tracker.beat('a')
    c.advance(181_000)
    expect(tracker.shouldStop()).toBe(false)
    c.advance(11_000)
    expect(tracker.shouldStop()).toBe(true)
  })

  it('stops if no tab ever opens', () => {
    const c = clock()
    const tracker = createTabTracker({ ...options, now: c.now })
    c.advance(179_000)
    expect(tracker.shouldStop()).toBe(false)
    c.advance(2_000)
    expect(tracker.shouldStop()).toBe(true)
  })
})

describe('heartbeatMiddleware', () => {
  async function withServer(run: (base: string, calls: string[]) => Promise<void>) {
    const calls: string[] = []
    const tracker = { beat: (id: string) => calls.push(`beat ${id}`), bye: (id: string) => calls.push(`bye ${id}`) }
    const middleware = heartbeatMiddleware(tracker)
    const server = http.createServer((req, res) =>
      middleware(req, res, () => {
        res.statusCode = 418
        res.end()
      }),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    try {
      await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }

  it('records a heartbeat and a goodbye', async () => {
    await withServer(async (base, calls) => {
      expect((await fetch(`${base}${HEARTBEAT_PATH}?tab=t1`, { method: 'POST' })).status).toBe(204)
      expect((await fetch(`${base}${HEARTBEAT_PATH}?tab=t1&bye=1`, { method: 'POST' })).status).toBe(204)
      expect(calls).toEqual(['beat t1', 'bye t1'])
    })
  })

  it('ignores a heartbeat without a tab id', async () => {
    await withServer(async (base, calls) => {
      expect((await fetch(`${base}${HEARTBEAT_PATH}`, { method: 'POST' })).status).toBe(204)
      expect(calls).toEqual([])
    })
  })

  it('passes every other request on', async () => {
    await withServer(async (base, calls) => {
      expect((await fetch(`${base}/__kong/services`)).status).toBe(418)
      expect((await fetch(`${base}${HEARTBEAT_PATH}-other?tab=x`, { method: 'POST' })).status).toBe(418)
      expect(calls).toEqual([])
    })
  })
})
