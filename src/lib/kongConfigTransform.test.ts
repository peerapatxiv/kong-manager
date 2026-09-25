import { describe, it, expect } from 'vitest'
import { denormalizeKongConfig } from './kongConfigTransform'

const EXPANDED = {
  _format_version: '3.0',
  _transform: false,
  services: [
    { id: 'svc-1', name: 'billing-service', host: 'billing.internal', created_at: 1, updated_at: 1 },
    { id: 'svc-2', name: 'reporting-service', host: 'reporting.internal', created_at: 1, updated_at: 1 },
  ],
  routes: [
    { id: 'route-1', name: 'billing-route', service: 'svc-1', paths: ['/billing'], created_at: 1, updated_at: 1 },
    {
      id: 'route-orphan',
      name: 'orphan-route',
      service: 'svc-missing',
      paths: ['/orphan'],
      created_at: 1,
      updated_at: 1,
    },
  ],
  consumers: [{ id: 'cons-1', username: 'alice', created_at: 1, updated_at: 1 }],
  keyauth_credentials: [
    { id: 'cred-1', consumer: 'cons-1', key: 'abc123key', created_at: 1 },
    { id: 'cred-orphan', consumer: 'cons-missing', key: 'orphan-key', created_at: 1 },
  ],
  plugins: [
    {
      id: 'plug-global',
      name: 'rate-limiting',
      service: null,
      route: null,
      consumer: null,
      config: { minute: 100 },
      created_at: 1,
      updated_at: 1,
    },
    {
      id: 'plug-route',
      name: 'key-auth',
      service: null,
      route: 'route-1',
      consumer: null,
      config: {},
      created_at: 1,
      updated_at: 1,
    },
    {
      id: 'plug-service',
      name: 'cors',
      service: 'svc-2',
      route: null,
      consumer: null,
      config: {},
      created_at: 1,
      updated_at: 1,
    },
  ],
}

describe('denormalizeKongConfig', () => {
  it('nests routes under their owning service and strips bookkeeping/back-reference fields', () => {
    const config = denormalizeKongConfig(EXPANDED)

    const billing = config.services!.find((s) => s.name === 'billing-service')!
    expect(billing.routes).toHaveLength(1)
    expect(billing.routes![0]).toMatchObject({ name: 'billing-route', paths: ['/billing'] })
    expect(billing.routes![0]).not.toHaveProperty('service')
    expect(billing.routes![0]).not.toHaveProperty('id')
    expect(billing.routes![0]).not.toHaveProperty('created_at')
    expect(billing).not.toHaveProperty('id')
    expect(billing).not.toHaveProperty('created_at')
  })

  it('puts a route whose service id does not resolve into a top-level array instead of dropping it', () => {
    const config = denormalizeKongConfig(EXPANDED)

    expect(config.routes).toEqual([expect.objectContaining({ name: 'orphan-route' })])
  })

  it('nests keyauth credentials under their owning consumer', () => {
    const config = denormalizeKongConfig(EXPANDED)

    const alice = config.consumers!.find((c) => c.username === 'alice')!
    expect(alice.keyauth_credentials).toEqual([{ key: 'abc123key' }])
  })

  it('drops a credential whose consumer id does not resolve, instead of crashing', () => {
    const config = denormalizeKongConfig(EXPANDED)

    const allCredentials = config.consumers!.flatMap((c) => (c.keyauth_credentials as unknown[] | undefined) ?? [])
    expect(allCredentials).toHaveLength(1)
  })

  it('routes scoped plugins to their service or route, and leaves unscoped plugins global', () => {
    const config = denormalizeKongConfig(EXPANDED)

    expect(config.plugins).toEqual([expect.objectContaining({ name: 'rate-limiting' })])

    const billing = config.services!.find((s) => s.name === 'billing-service')!
    expect(billing.routes![0].plugins).toEqual([expect.objectContaining({ name: 'key-auth' })])

    const reporting = config.services!.find((s) => s.name === 'reporting-service')!
    expect(reporting.plugins).toEqual([expect.objectContaining({ name: 'cors' })])
  })

  it('preserves unrecognized top-level fields untouched', () => {
    const config = denormalizeKongConfig(EXPANDED)
    expect(config._transform).toBe(false)
  })

  it('omits the top-level routes key entirely when there are no unmatched routes', () => {
    const noOrphans = { ...EXPANDED, routes: EXPANDED.routes.filter((r) => r.service === 'svc-1') }
    const config = denormalizeKongConfig(noOrphans)
    expect(config.routes).toBeUndefined()
  })
})
