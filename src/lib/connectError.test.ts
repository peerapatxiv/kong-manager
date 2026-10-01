import { describe, it, expect, afterEach, vi } from 'vitest'
import { describeConnectError } from './connectError'
import { KongAdminApiError } from './kongAdmin/http'

const base = 'https://kong.internal:8444'

afterEach(() => vi.unstubAllEnvs())

describe('describeConnectError', () => {
  it('explains a network failure: address, Kong running, CORS, and the https-to-http rule', () => {
    const message = describeConnectError(new KongAdminApiError('Failed to fetch', { status: 0, kind: 'network' }), base)

    expect(message).toContain(`Could not reach ${base}`)
    expect(message).toContain('CORS')
    expect(message).toMatch(/https.*http/i)
    expect(message).toContain('Failed to fetch')
  })

  it('reports rejected credentials with the status', () => {
    const message = describeConnectError(new KongAdminApiError('x', { status: 401, kind: 'auth' }), base)

    expect(message).toContain('rejected the credentials')
    expect(message).toContain('401')
  })

  it('explains that /config only exists on DB-less Kong when it answers 404', () => {
    const message = describeConnectError(new KongAdminApiError('x', { status: 404, kind: 'notFound' }), base)

    expect(message).toContain('/config')
    expect(message).toMatch(/DB-less|without a database/i)
  })

  it('falls back to the plain message for other Kong errors, other errors and non-errors', () => {
    expect(describeConnectError(new KongAdminApiError('Kong Admin API responded 500: boom', { status: 500, kind: 'server' }), base)).toBe(
      'Kong Admin API responded 500: boom',
    )
    expect(describeConnectError(new Error('connection refused'), base)).toBe('connection refused')
    expect(describeConnectError('oops', base)).toBe('oops')
  })


  it('in local proxy mode, blames the address or Kong being down, not CORS or https', () => {
    vi.stubEnv('VITE_KONG_PROXY', 'true')

    const message = describeConnectError(
      new KongAdminApiError('Could not reach Kong at https://kong.internal:8444: connect ECONNREFUSED', { status: 0, kind: 'network' }),
      base,
    )

    expect(message).toContain('local proxy')
    expect(message).toContain('ECONNREFUSED')
    expect(message).not.toContain('CORS')
  })
})
