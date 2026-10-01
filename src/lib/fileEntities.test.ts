import { describe, it, expect } from 'vitest'
import { listRoutes, listPlugins, summarizeFile } from './fileEntities'
import type { KongConfig } from '../types/kong'

const config = (): KongConfig => ({
  _format_version: '3.0',
  services: [
    {
      name: 'billing',
      host: 'billing.internal',
      enabled: true,
      plugins: [{ name: 'key-auth' }],
      routes: [
        { name: 'pay', paths: ['/pay'], protocols: ['https'], plugins: [{ name: 'cors' }] },
        { paths: ['/refund'], protocols: ['http', 'https'] },
      ],
    },
    { name: 'reports', host: 'reports.internal', enabled: false, routes: [{ name: 'daily', protocols: ['grpc'] }] },
    { host: 'unnamed.internal' },
  ],
  consumers: [{ username: 'alice', plugins: [{ name: 'rate-limiting' }] }, { custom_id: 'x' }],
  plugins: [{ name: 'cors' }, { name: 'rate-limiting' }],
})

describe('listRoutes', () => {
  it('lists every route with its service, in file order', () => {
    const rows = listRoutes(config())
    expect(rows.map((r) => [r.serviceName, r.label])).toEqual([
      ['billing', 'pay'],
      ['billing', '/refund'],
      ['reports', 'daily'],
    ])
  })

  it('gives each route a stable id from its position, so renaming does not change it', () => {
    const rows = listRoutes(config())
    expect(rows.map((r) => r.id)).toEqual(['0/0', '0/1', '1/0'])
  })

  it('replaces a route in place', () => {
    const cfg = config()
    const [first] = listRoutes(cfg)
    first.replace({ name: 'pay-v2', paths: ['/pay'] })
    expect(cfg.services![0].routes![0].name).toBe('pay-v2')
    expect(listRoutes(cfg)[0].id).toBe('0/0')
  })

  it('copes with a config that has no services', () => {
    expect(listRoutes({ _format_version: '3.0' })).toEqual([])
  })
})

describe('listPlugins', () => {
  it('lists plugins from every level with where each one applies', () => {
    const rows = listPlugins(config())
    expect(rows.map((r) => [r.plugin.name, r.scope.kind, r.scope.label])).toEqual([
      ['cors', 'global', 'global'],
      ['rate-limiting', 'global', 'global'],
      ['key-auth', 'service', 'billing'],
      ['cors', 'route', 'pay'],
      ['rate-limiting', 'consumer', 'alice'],
    ])
  })

  it('gives plugins that share a name different ids', () => {
    const ids = listPlugins(config()).map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('names the entry that owns a nested plugin, so editing it can mark that entry modified', () => {
    const rows = listPlugins(config())
    expect(rows.map((r) => r.modifiedKey)).toEqual([
      'plugin:global/cors',
      'plugin:global/rate-limiting',
      'service:billing',
      'service:billing',
      'consumer:alice',
    ])
  })

  it('replaces a plugin in place at its own level', () => {
    const cfg = config()
    const nested = listPlugins(cfg).find((r) => r.scope.kind === 'route')!
    nested.replace({ name: 'cors', enabled: false })
    expect(cfg.services![0].routes![0].plugins![0]).toEqual({ name: 'cors', enabled: false })
    expect(cfg.plugins![0]).toEqual({ name: 'cors' })
  })

  it('ignores a plugins value that is not a list', () => {
    const cfg = config()
    ;(cfg.services![0] as Record<string, unknown>).plugins = 'nope'
    expect(listPlugins(cfg).some((r) => r.scope.kind === 'service')).toBe(false)
  })
})

describe('summarizeFile', () => {
  it('counts every entity, including routes and plugins nested inside others', () => {
    const summary = summarizeFile(config())
    expect(summary).toMatchObject({ services: 3, routes: 3, consumers: 2, plugins: 5 })
  })

  it('splits services into enabled and disabled, counting a missing flag as enabled', () => {
    expect(summarizeFile(config()).serviceStatus).toEqual({ total: 3, enabled: 2, disabled: 1 })
  })

  it('counts routes per protocol and the most used plugins across all levels', () => {
    const summary = summarizeFile(config())
    expect(summary.protocols).toEqual([
      { label: 'https', count: 2 },
      { label: 'grpc', count: 1 },
      { label: 'http', count: 1 },
    ])
    expect(summary.topPlugins[0]).toEqual({ name: 'cors', count: 2 })
  })

  it('is all zeros for an empty config', () => {
    expect(summarizeFile({ _format_version: '3.0' })).toMatchObject({ services: 0, routes: 0, consumers: 0, plugins: 0 })
  })
})
