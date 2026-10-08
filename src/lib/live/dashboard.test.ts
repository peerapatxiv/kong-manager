import { describe, it, expect } from 'vitest'
import { summarizeServices, countRouteProtocols, topPlugins, parseNodeStatus, summarizeUpstreamHealth, mapLimit } from './dashboard'

describe('summarizeServices', () => {
  it('counts enabled and disabled services, treating a missing flag as enabled', () => {
    expect(summarizeServices([{ enabled: true }, { enabled: false }, {}, { enabled: undefined }])).toEqual({
      total: 4,
      enabled: 3,
      disabled: 1,
    })
  })

  it('handles an empty list', () => {
    expect(summarizeServices([])).toEqual({ total: 0, enabled: 0, disabled: 0 })
  })
})

describe('countRouteProtocols', () => {
  it('counts a route once under each protocol it serves, most used first', () => {
    const rows = countRouteProtocols([
      { protocols: ['http', 'https'] },
      { protocols: ['https'] },
      { protocols: ['https'] },
      { protocols: ['grpc'] },
    ])
    expect(rows).toEqual([
      { label: 'https', count: 3 },
      { label: 'grpc', count: 1 },
      { label: 'http', count: 1 },
    ])
  })

  it('ignores routes without a usable protocols list', () => {
    expect(countRouteProtocols([{}, { protocols: null }, { protocols: 'http' }])).toEqual([])
  })
})

describe('topPlugins', () => {
  it('groups plugin instances by name, most used first, and respects the limit', () => {
    const plugins = [
      { name: 'rate-limiting' },
      { name: 'key-auth' },
      { name: 'rate-limiting' },
      { name: 'cors' },
      { name: 'rate-limiting' },
      { name: 'key-auth' },
    ]
    expect(topPlugins(plugins, 2)).toEqual([
      { name: 'rate-limiting', count: 3 },
      { name: 'key-auth', count: 2 },
    ])
  })

  it('skips plugins with no name', () => {
    expect(topPlugins([{}, { name: 5 }, { name: 'cors' }])).toEqual([{ name: 'cors', count: 1 }])
  })
})

describe('parseNodeStatus', () => {
  it('reads database reachability, total requests and active connections from /status', () => {
    expect(
      parseNodeStatus({
        database: { reachable: true },
        server: { total_requests: 1234, connections_active: 7, connections_accepted: 99 },
      }),
    ).toEqual({ databaseReachable: true, totalRequests: 1234, activeConnections: 7 })
  })

  it('reports what is missing as undefined rather than guessing', () => {
    expect(parseNodeStatus({ server: {} })).toEqual({
      databaseReachable: undefined,
      totalRequests: undefined,
      activeConnections: undefined,
    })
  })

  it('returns null when the response is not an object', () => {
    expect(parseNodeStatus(null)).toBeNull()
    expect(parseNodeStatus('ok')).toBeNull()
  })
})

describe('summarizeUpstreamHealth', () => {
  const row = (health: string | undefined) => ({ target: 't', weight: 1, health })

  it('counts upstreams, targets, unhealthy and unknown targets', () => {
    const summary = summarizeUpstreamHealth([
      [row('HEALTHY'), row('UNHEALTHY'), row('DNS_ERROR')],
      [row('HEALTHCHECKS_OFF'), row(undefined), row('HEALTHY')],
    ])
    expect(summary).toEqual({ upstreams: 2, targets: 6, unhealthy: 2, unknown: 2 })
  })

  it('counts an upstream whose request failed as one unknown, without adding targets', () => {
    expect(summarizeUpstreamHealth([[row('HEALTHY')], null])).toEqual({ upstreams: 2, targets: 1, unhealthy: 0, unknown: 1 })
  })

  it('handles no upstreams', () => {
    expect(summarizeUpstreamHealth([])).toEqual({ upstreams: 0, targets: 0, unhealthy: 0, unknown: 0 })
  })
})

describe('mapLimit', () => {
  it('keeps the order of the results and never runs more than the limit at once', async () => {
    let running = 0
    let peak = 0
    const results = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return n * 2
    })
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14])
    expect(peak).toBe(3)
  })

  it('returns [] for no items', async () => {
    expect(await mapLimit([], 3, async (n: number) => n)).toEqual([])
  })
})
