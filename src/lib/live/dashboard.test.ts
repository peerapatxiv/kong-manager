import { describe, it, expect } from 'vitest'
import { summarizeServices, countRouteProtocols, topPlugins, parseNodeStatus } from './dashboard'

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
